import { NextResponse } from "next/server";

function getExpectedCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

export function middleware(req) {
  const token = req.cookies.get("ga_access")?.value;
  if (token === getExpectedCode()) return NextResponse.next();
  const url = req.nextUrl.clone();
  if (url.pathname === "/login") return NextResponse.next();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login).*)"],
};
