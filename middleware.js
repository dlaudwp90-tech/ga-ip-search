import { NextResponse } from "next/server";

function getExpectedCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

export function middleware(req) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") || "";

  // 정적 파일 및 OG 이미지는 항상 통과
  if (pathname === "/og-image.png") return NextResponse.next();

  // 루트 경로(/)는 봇 크롤링을 위해 OG 태그 노출 허용
  // 단, 실제 데이터는 /api/search에서 인증으로 보호
  if (pathname === "/") {
    // 봇이거나 쿠키가 없는 경우 → OG 태그만 있는 정적 페이지 접근 허용
    const isCrawler =
      ua.includes("bot") ||
      ua.includes("Bot") ||
      ua.includes("crawler") ||
      ua.includes("Crawler") ||
      ua.includes("spider") ||
      ua.includes("Spider") ||
      ua.includes("Notion") ||
      ua.includes("Slack") ||
      ua.includes("Twitter") ||
      ua.includes("facebook") ||
      ua.includes("LinkedIn") ||
      ua.includes("Google") ||
      ua.includes("Bing") ||
      ua.includes("opengraph") ||
      ua.includes("preview") ||
      ua.includes("Preview") ||
      ua.includes("Prerender") ||
      ua.includes("curl") ||
      ua.includes("python") ||
      ua.includes("axios");

    if (isCrawler) return NextResponse.next();
  }

  // 인증 확인
  const token = req.cookies.get("ga_access")?.value;
  if (token === getExpectedCode()) return NextResponse.next();

  // 로그인 페이지는 통과
  const url = req.nextUrl.clone();
  if (url.pathname === "/login") return NextResponse.next();

  // 나머지는 로그인으로 리다이렉트
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login|og-image.png).*)"],
};
