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
 * `NEXT_PUBLIC_RESOURCE_SERVER_URL`, if set, wins — *unless* it points at
 * localhost while the page itself was loaded from a non-local (forwarded)
 * hostname. That specific combination is almost always a stale value left
 * over from copying `.env.example` before switching to a cloud dev
 * environment, not an intentional override, and honoring it silently
 * reproduces the exact bug this function exists to avoid. In that case we
 * fall through to auto-detection instead. A genuine custom override (e.g.
 * resource-server deployed somewhere else entirely) is unaffected, since
 * it won't look like a localhost URL.
 */
export function resourceServerUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RESOURCE_SERVER_URL;
  const isBrowser = typeof window !== "undefined";
  const pageHostname = isBrowser ? window.location.hostname : undefined;
  const pageIsLocal = pageHostname === "localhost" || pageHostname === "127.0.0.1";

  if (explicit) {
    const explicitIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(explicit);
    if (!(explicitIsLocal && isBrowser && !pageIsLocal)) {
      return explicit;
    }
  }

  if (isBrowser && !pageIsLocal) {
    const match = /^(.*-)(\d+)(\..+)$/.exec(pageHostname!);
    if (match) {
      const [, prefix, , suffix] = match;
      return `${window.location.protocol}//${prefix}${DEFAULT_PORT}${suffix}`;
    }
  }

  return explicit ?? `http://localhost:${DEFAULT_PORT}`;
}
