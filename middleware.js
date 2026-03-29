import { NextResponse } from "next/server";

function getExpectedCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // 루트(/) 및 정적 파일은 완전 공개 - 봇이 OG 태그 읽을 수 있도록
  if (pathname === "/" || pathname === "/og-image.png") {
    return NextResponse.next();
  }

  // 로그인 페이지는 항상 통과
  if (pathname === "/login") return NextResponse.next();

  // /api/search 는 인증 확인
  const token = req.cookies.get("ga_access")?.value;
  if (token === getExpectedCode()) return NextResponse.next();

  // 나머지 페이지는 로그인으로 리다이렉트
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login).*)"],
};
