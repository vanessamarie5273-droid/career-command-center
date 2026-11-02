import { envBase } from "@/lib/appUrl";
// The address she is using the app at, so Microsoft sends her back to the same site (and session cookie).
export function appOrigin(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)) return `${h.get("x-forwarded-proto")?.split(",")[0] || "https"}://${host}`;
  return envBase() || new URL(req.url).origin;
}
export const redirectUri = (req: Request) => `${appOrigin(req)}/api/mail/callback`;
export const STATE_COOKIE = "ccc_ms_state";
