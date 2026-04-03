import { NextResponse } from "next/server";

// KST(UTC+9) 기준으로 현재 연월 코드 반환
function getExpectedCode() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

export function middleware(req) {
  const ua = req.headers.get("user-agent") || "";

  // 노션·소셜·검색엔진 봇은 OG 태그 읽을 수 있도록 통과
  const isCrawler =
    ua.includes("Notion") ||
    ua.includes("Slackbot") ||
    ua.includes("Twitterbot") ||
    ua.includes("facebookexternalhit") ||
    ua.includes("LinkedInBot") ||
    ua.includes("Googlebot") ||
    ua.includes("bingbot") ||
    ua.includes("Prerender") ||
    ua.includes("og-image") ||
    ua.includes("crawler") ||
    ua.includes("spider");

  if (isCrawler) return NextResponse.next();

  const token = req.cookies.get("ga_access")?.value;
  const expected = getExpectedCode();

  // 쿠키 값이 이번 달 코드와 정확히 일치할 때만 통과
  if (token === expected) {
    const res = NextResponse.next();
    // 브라우저 캐시 방지 — 매 요청마다 미들웨어가 재검증하도록 강제
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  const url = req.nextUrl.clone();
  if (url.pathname === "/login") return NextResponse.next();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login|og-image.png).*)"],
};
