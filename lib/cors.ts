import { ALLOWED_ORIGINS } from "./config";

// Allow only the configured storefront origins to call the browser-facing
// endpoints. If ALLOWED_ORIGINS is empty we fall back to "*" (dev only).
export function corsHeaders(origin: string | null): Record<string, string> {
  let allow = "*";
  if (ALLOWED_ORIGINS.length > 0) {
    allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  } else if (origin) {
    allow = origin;
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
