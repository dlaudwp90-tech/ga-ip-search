// middleware.js
// ─────────────────────────────────────────────────────────────────────────────
// 【접근 보호 + 승인 관문 — Supabase】  ⚠ 수정 주의: 로그인·승인 안 된 사용자를 막습니다.
//  흐름:
//   ① 로그인 안 함        → /login 으로
//   ② 로그인 O, 승인 대기 → /pending 으로 (앱 진입 불가)
//   ③ 로그인 O, 승인 완료 → 정상 이용
//   · 관리자(ADMIN_EMAIL)는 승인 여부와 무관하게 항상 허용(자기 자신 잠김 방지).
//  승인 여부: Supabase 계정의 app_metadata.approved === true (서버에서만 설정 가능)
//
//  공개 경로(로그인 없이): /login, /signup, /og-image.png, /favicon.ico
//  필요한 환경변수: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "dlaudwp90@gmail.com"; // 관리자 이메일

export async function middleware(request) {
  const ua = request.headers.get("user-agent") || "";

  // 봇(노션·검색엔진 등)은 OG 태그 읽도록 통과
  const isCrawler =
    /Notion|Slackbot|Twitterbot|facebookexternalhit|LinkedInBot|Googlebot|bingbot|crawler|spider/i.test(ua);
  if (isCrawler) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
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

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const redirectTo = (p) => {
    const url = request.nextUrl.clone();
    url.pathname = p;
    return NextResponse.redirect(url);
  };

  // 로그인 없이 접근 가능한 경로
  const isPublicNoAuth =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname === "/og-image.png" ||
    pathname === "/favicon.ico";

  // ① 로그인 안 됨
  if (!user) {
    if (isPublicNoAuth) return response;
    return redirectTo("/login");
  }

  // 관리자 여부(최초 관리자 또는 is_admin) → 관리자는 자동 승인·항상 통과
  const isAdmin = user.email === ADMIN_EMAIL || user.app_metadata?.is_admin === true;
  const approved = user.app_metadata?.approved === true || isAdmin;

  // ② 로그인 O, 승인 대기
  if (!approved) {
    if (pathname === "/pending") return response;   // 대기 화면만 허용
    return redirectTo("/pending");
  }

  // ③ 승인 완료: 로그인/가입/대기 화면으로 오면 메인으로 보냄
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname === "/pending") {
    return redirectTo("/");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
