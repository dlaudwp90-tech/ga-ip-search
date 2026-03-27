import { NextResponse } from "next/server";

export function middleware(req) {
  const token = req.cookies.get("ga_access")?.value;
  if (token === process.env.ACCESS_CODE) return NextResponse.next();
  const url = req.nextUrl.clone();
  if (url.pathname === "/login") return NextResponse.next();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login).*)"],
};
