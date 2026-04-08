import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 공개 접근 허용 경로
const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/og-image.png",
  "/favicon.ico",
]);

export default clerkMiddleware((auth, req) => {
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
    ua.includes("crawler") ||
    ua.includes("spider");

  if (isCrawler) return NextResponse.next();

  // 공개 경로가 아니면 로그인 필요
  if (!isPublicRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: [
    // Next.js 내부 경로와 정적 파일 제외
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
