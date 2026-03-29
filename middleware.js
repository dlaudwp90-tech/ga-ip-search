import { NextResponse } from "next/server";

function getExpectedCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
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
  if (token === getExpectedCode()) return NextResponse.next();

  const url = req.nextUrl.clone();
  if (url.pathname === "/login") return NextResponse.next();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/login|og-image.png).*)"],
};
