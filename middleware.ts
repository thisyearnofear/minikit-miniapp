import * as jose from "jose";
import { NextRequest, NextResponse } from "next/server";
import { env } from "./lib/env";

export const config = {
  matcher: ["/api/:path*"],
};

export default async function middleware(req: NextRequest) {
  // Log the request path for debugging
  console.log(`Middleware processing: ${req.nextUrl.pathname}`);

  // Log all cookies for debugging
  const allCookies = req.cookies.getAll();
  console.log("Cookies in request:", allCookies.map(c => c.name));

  // Skip auth check for these endpoints
  if (
    req.nextUrl.pathname === "/api/auth/sign-in" ||
    req.nextUrl.pathname.includes("/api/og") ||
    req.nextUrl.pathname.includes("/api/webhook") ||
    req.nextUrl.pathname.includes("/api/farcaster") ||
    req.nextUrl.pathname.includes("/api/manifest") ||
    req.nextUrl.pathname.includes("/api/test") // Allow test endpoint without auth for session checking
  ) {
    console.log(`Skipping auth check for: ${req.nextUrl.pathname}`);
    return NextResponse.next();
  }

  // Get token from auth_token cookie
  const token = req.cookies.get("auth_token")?.value;

  if (!token) {
    console.log(`No auth_token cookie found for: ${req.nextUrl.pathname}`);
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    console.log(`Verifying token for: ${req.nextUrl.pathname}`);
    const secret = new TextEncoder().encode(env.JWT_SECRET);

    // Verify the token using jose
    const { payload } = await jose.jwtVerify(token, secret);

    console.log(`Token verified for FID: ${payload.fid}`);

    // Clone the request headers to add user info
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-fid", payload.fid as string);

    // Return response with modified headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error(`Token verification failed for: ${req.nextUrl.pathname}`, error);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
