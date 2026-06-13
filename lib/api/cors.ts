import { NextResponse } from "next/server";

// The v1 public API is read-only and returns no secrets or cookies, so opening
// it to any origin is safe and lets browser-based dApps call it directly.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Adds the shared CORS headers to a response and returns it. */
export function withCors<T>(res: NextResponse<T>): NextResponse<T> {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.headers.set(key, value);
  }
  return res;
}

/** Standard preflight response shared by every v1 route. */
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Shorthand for a CORS-enabled JSON response. */
export function jsonWithCors(body: unknown, init?: { status?: number }): NextResponse {
  return withCors(NextResponse.json(body, init));
}
