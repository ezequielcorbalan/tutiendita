// Astro integration, `astro dev` only: tells the Worker whether the request really came from this machine.
//
// The local-store shortcut (src/dev/local-owner.ts) opens the panel without a passkey. The URL's host can't
// decide that: it comes from the Host header, and with `astro dev --host` anyone on the network can send
// `Host: localhost`. Here, on the Node side, the TCP socket's address is known: every request gets
// LOOPBACK_HEADER overwritten ("1" only from 127.0.0.1 / ::1), whatever the client sent.

export const LOOPBACK_HEADER = "x-tiendita-loopback";
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export const isLoopback = (address) => LOOPBACK.has(address ?? "");

/** Replaces the header in both `headers` and `rawHeaders` (a client copy must not survive in either). */
export function markLoopback(req) {
  const value = isLoopback(req.socket?.remoteAddress) ? "1" : "0";
  const raw = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() !== LOOPBACK_HEADER)
      raw.push(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  req.rawHeaders.splice(0, req.rawHeaders.length, ...raw, LOOPBACK_HEADER, value);
  req.headers[LOOPBACK_HEADER] = value;
}

export default function loopback() {
  return {
    name: "tiendita-loopback",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, _res, next) => {
          markLoopback(req);
          next();
        });
      },
    },
  };
}
