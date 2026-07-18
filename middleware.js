// middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// 【접근 보호 — Supabase 버전】  ⚠ 수정 주의: 로그인 안 한 사용자를 막는 관문입니다.
//  - Clerk 미들웨어를 Supabase 세션 확인으로 교체.
//  - 하는 일: ① 매 요청마다 Supabase 로그인 세션(쿠키)을 새로고침,
//            ② 로그인 안 했으면 /login 으로 돌려보냄(공개 경로·봇 제외).
//  - 앱 전체(페이지+API)를 이 한 곳에서 보호합니다. (기존 Clerk와 동일한 구조)
//
//  필요한 환경변수(공개용): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// 로그인 없이 접근 허용할 경로
function isPublic(pathname) {
  return (
    pathname.startsWith("/login") ||
    pathname === "/og-image.png" ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(request) {
  const ua = request.headers.get("user-agent") || "";

  // 노션·소셜·검색엔진 봇은 OG 태그를 읽을 수 있게 통과 (기존 동작 유지)
  const isCrawler =
    /Notion|Slackbot|Twitterbot|facebookexternalhit|LinkedInBot|Googlebot|bingbot|crawler|spider/i.test(ua);
  if (isCrawler) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 새로고침 + 현재 로그인 사용자 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 로그인 안 했고 공개 경로도 아니면 → 로그인 화면으로
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Next.js 내부 경로·정적 파일 제외
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
