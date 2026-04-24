import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal fixed-window in-memory rate limiter keyed by client IP.
 *
 * Good enough for single-instance deployments and per-instance backpressure.
 * If you run multiple replicas and need global limits, put a real rate
 * limiter (Redis, API gateway) in front.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  const prune = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  // Keep the map from growing unboundedly under churn. Unref so it doesn't
  // keep the event loop alive.
  const interval = setInterval(prune, Math.max(options.windowMs, 10_000));
  interval.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("x-ratelimit-limit", String(options.max));
    res.setHeader("x-ratelimit-remaining", String(remaining));
    res.setHeader("x-ratelimit-reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfter));
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32002, message: "Rate limit exceeded" },
        id: null,
      });
      return;
    }

    next();
  };
}
