// pages/login/[[...index]].js
// ─────────────────────────────────────────────────────────────────────────────
// 【직원 로그인 화면 — Supabase 이메일+비밀번호】
//  - 기존 Clerk <SignIn> 을 Supabase 이메일/비밀번호 폼으로 교체(로고 디자인 유지).
//  - 성공하면 세션 쿠키가 저장되고 메인('/')으로 이동합니다.
//  - 계정은 Supabase 대시보드(Authentication → Users)에서 미리 만든 것만 로그인됩니다.
//
//  필요한 환경변수(공개용): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Head from "next/head";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) { setError("이메일과 비밀번호를 입력하세요."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("로그인 실패: 이메일 또는 비밀번호를 확인하세요.");
      return;
    }
    // 성공 → 세션 쿠키 저장됨. 전체 새로고침으로 메인 진입(미들웨어가 세션 인식)
    window.location.href = "/";
  };

  const onKeyDown = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <>
      <Head>
        <title>Guardian &amp; Angel IP — 직원 로그인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        {/* 로고 */}
        <div className="logo-wrap">
          <div className="logo-top-rule" />
          <h1 className="logo-main">Guardian &amp; Angel</h1>
          <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
          <div className="logo-mid-rule" />
          <p className="logo-sub-kr">가엔 특허법률사무소</p>
          <div className="logo-bot-rule" />
        </div>

        {/* 로그인 폼 */}
        <div className="form-wrap">
          <label className="field-label">이메일</label>
          <input
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="username"
            placeholder="name@example.com"
          />

          <label className="field-label">비밀번호</label>
          <input
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="current-password"
            placeholder="••••••••"
          />

          {error && <div className="error-msg">{error}</div>}

          <button type="button" className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; min-height: 100vh; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%);
          padding: 40px 16px; gap: 32px;
          animation: slideUp 0.6s ease both;
        }
        .logo-wrap { display: inline-block; text-align: center; }
        .logo-top-rule { width: 340px; height: 1px; background: #13274F; margin: 0 auto 16px; }
        .logo-main {
          font-family: 'EB Garamond', 'Georgia', serif;
          font-size: 38px; font-weight: 700;
          color: #13274F; letter-spacing: -0.5px; line-height: 1.15; margin: 0;
        }
        .logo-sub-en {
          font-size: 11px; font-weight: 400; color: #13274F; letter-spacing: 5px;
          margin: 8px 0 10px; text-transform: uppercase;
        }
        .logo-mid-rule { width: 200px; height: 1px; background: #13274F; margin: 0 auto 10px; }
        .logo-sub-kr {
          font-family: 'Noto Serif KR', serif;
          font-size: 18px; font-weight: 700; color: #13274F; letter-spacing: 2px; margin: 0 0 10px;
        }
        .logo-bot-rule { width: 340px; height: 1px; background: #13274F; margin: 0 auto; }

        .form-wrap {
          width: 100%; max-width: 360px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .field-label { font-size: 13px; font-weight: 500; color: #13274F; margin: 8px 0 2px; }
        .field-input {
          width: 100%; padding: 12px 14px; font-size: 15px;
          font-family: 'Noto Sans KR', sans-serif;
          border: 1.5px solid #cbd5e1; border-radius: 10px; color: #13274F; background: #f8faff;
          outline: none; transition: border-color .15s;
        }
        .field-input:focus { border-color: #13274F; }
        .error-msg {
          font-size: 13px; color: #dc2626; background: #fff1f2;
          border-radius: 8px; padding: 8px 12px; margin-top: 4px;
        }
        .login-btn {
          margin-top: 12px; width: 100%; padding: 13px;
          font-family: 'Noto Sans KR', sans-serif; font-size: 15px; font-weight: 700;
          color: #fff; background: #13274F; border: none; border-radius: 10px; cursor: pointer;
          transition: opacity .15s;
        }
        .login-btn:hover { opacity: 0.92; }
        .login-btn:disabled { opacity: 0.6; cursor: default; }

        @media (max-width: 400px) {
          .logo-main { font-size: 28px; }
          .logo-top-rule, .logo-bot-rule { width: 260px; }
          .logo-mid-rule { width: 160px; }
        }
      `}</style>
    </>
  );
}
