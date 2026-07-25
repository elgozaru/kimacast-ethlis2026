const DEFAULT_PORT = 4000;

/**
 * Resolves the resource-server's base URL for the current environment.
 *
 * In cloud dev environments (this one included) the page itself is served
 * from a forwarded preview URL like `https://<name>-3000.app.github.dev`,
 * not `localhost` — "localhost" in that browser tab means the visitor's own
 * machine, not the container the apps actually run in. A hardcoded
 * `http://localhost:4000` fetch target then silently fails: nothing is
 * listening there, and the browser reports it as a CORS error (no server
 * ever sent back CORS headers) rather than a clearer connection failure.
 *
 * `NEXT_PUBLIC_RESOURCE_SERVER_URL`, if set, always wins. Otherwise, when
 * running in the browser on a forwarded "<name>-<port>.<domain>" hostname,
 * this swaps the port segment to point at the resource server
 * automatically, so a fresh preview URL doesn't need manual
 * reconfiguration every session. Falls back to plain localhost for a
 * normal local dev setup.
 */
export function resourceServerUrl(): string {
  if (process.env.NEXT_PUBLIC_RESOURCE_SERVER_URL) {
    return process.env.NEXT_PUBLIC_RESOURCE_SERVER_URL;
  }

  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    const match = /^(.*-)(\d+)(\..+)$/.exec(hostname);
    if (match) {
      const [, prefix, , suffix] = match;
      return `${protocol}//${prefix}${DEFAULT_PORT}${suffix}`;
    }
  }

  return `http://localhost:${DEFAULT_PORT}`;
}
