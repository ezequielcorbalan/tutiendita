// Tests for the loopback integration (node --test, no server).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LOOPBACK_HEADER, markLoopback } from "./loopback.mjs";

const request = (remoteAddress, rawHeaders = []) => {
  const headers = {};
  for (let i = 0; i < rawHeaders.length; i += 2) headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1];
  return { socket: { remoteAddress }, rawHeaders: [...rawHeaders], headers };
};
const rawValues = (req) =>
  req.rawHeaders.filter((_, i) => req.rawHeaders[i - 1]?.toLowerCase() === LOOPBACK_HEADER);

describe("markLoopback", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    test(`a request from ${address} is marked "1"`, () => {
      const req = request(address);
      markLoopback(req);
      assert.equal(req.headers[LOOPBACK_HEADER], "1");
      assert.deepEqual(rawValues(req), ["1"]);
    });
  }

  test('a request from the network is marked "0" even if it sends the header and Host: localhost', () => {
    const req = request("192.168.1.30", ["Host", "localhost:4321", "X-Tiendita-Loopback", "1"]);
    markLoopback(req);
    assert.equal(req.headers[LOOPBACK_HEADER], "0");
    assert.deepEqual(rawValues(req), ["0"]);
    assert.equal(req.headers.host, "localhost:4321");
  });

  test("without a socket address it is not loopback", () => {
    const req = request(undefined);
    markLoopback(req);
    assert.equal(req.headers[LOOPBACK_HEADER], "0");
  });
});
