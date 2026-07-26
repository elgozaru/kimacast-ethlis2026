/// Same convention as apps/web/src/lib/devMode.ts: when true, the dashboard
/// skips Privy login entirely and every dashboard-api call, rendering a
/// hardcoded example agent + generation results instead (see mockData.ts).
/// Useful for previewing the UI while dashboard-api's Privy app-secret
/// issue is unresolved. Never true in a real deployment.
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";
