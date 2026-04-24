import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "../src/rate-limit.js";

function makeReq(ip = "1.2.3.4"): Request {
  return { ip, headers: {}, socket: { remoteAddress: ip } } as unknown as Request;
}

function makeRes(): {
  res: Response;
  status: () => number | undefined;
  headers: Record<string, string>;
  body: unknown;
  ended: boolean;
} {
  const headers: Record<string, string> = {};
  let statusCode: number | undefined;
  let body: unknown;
  let ended = false;

  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      ended = true;
      return res;
    },
  } as unknown as Response;

  return {
    res,
    status: () => statusCode,
    headers,
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
  };
}

describe("rateLimit", () => {
  it("passes through under the limit and sets headers", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3 });
    const r = makeRes();
    let called = false;
    mw(makeReq(), r.res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(r.headers["x-ratelimit-limit"], "3");
    assert.equal(r.headers["x-ratelimit-remaining"], "2");
  });

  it("returns 429 once max is exceeded", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2 });
    const next: NextFunction = () => {};

    mw(makeReq("9.9.9.9"), makeRes().res, next);
    mw(makeReq("9.9.9.9"), makeRes().res, next);

    const third = makeRes();
    mw(makeReq("9.9.9.9"), third.res, next);
    assert.equal(third.status(), 429);
    assert.equal(third.headers["retry-after"] !== undefined, true);
    assert.ok(
      typeof third.body === "object" && third.body !== null && "error" in third.body,
    );
  });

  it("keys per-IP", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 });
    const next: NextFunction = () => {};
    mw(makeReq("1.1.1.1"), makeRes().res, next);

    // different IP should still pass
    const other = makeRes();
    let called = false;
    mw(makeReq("2.2.2.2"), other.res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(other.status(), undefined);
  });
});
