// pages/signup.js
// ─────────────────────────────────────────────────────────────────────────────
// 【회원가입 화면】 이메일+비밀번호로 가입 → 관리자 승인 대기(/pending)로 이동.
//  ⚠ Supabase 설정: Authentication에서 "회원가입 허용" ON, "이메일 확인(Confirm email)" OFF 권장.
//     (이메일 확인 ON이면 가입 후 메일 인증까지 해야 하며, 아래에서 안내 문구가 뜹니다)
//  필요한 환경변수(공개용): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Signup() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSignup = async () => {
    setError(""); setInfo("");
    if (!email || !password) { setError("이메일과 비밀번호를 입력하세요."); return; }
    if (password.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return; }
    if (password !== confirm) { setError("비밀번호가 일치하지 않습니다."); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      setError(error.message.includes("already") ? "이미 가입된 이메일입니다." : "가입 실패: " + error.message);
      return;
    }
    // 이메일 확인 OFF → 세션 생김 → 승인 대기 화면으로
    if (data?.session) { window.location.href = "/pending"; return; }
    // 이메일 확인 ON → 메일 인증 필요 안내
    setInfo("인증 메일을 보냈습니다. 메일의 링크로 인증한 뒤 로그인하시면, 관리자 승인 대기 상태가 됩니다.");
  };

  const onKeyDown = (e) => { if (e.key === "Enter") handleSignup(); };

  return (
    <>
      <Head>
        <title>회원가입 — Guardian &amp; Angel IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      <div className="page">
        <div className="card">
          <h1 className="title">회원가입</h1>
          <p className="desc">가입 후 <b>관리자 승인</b>을 받으면 이용할 수 있습니다.</p>

          <label className="lbl">이메일</label>
          <input className="inp" type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onKeyDown} autoComplete="username" placeholder="name@example.com" />

          <label className="lbl">비밀번호 (6자 이상)</label>
          <input className="inp" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={onKeyDown} autoComplete="new-password" placeholder="••••••••" />

          <label className="lbl">비밀번호 확인</label>
          <input className="inp" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={onKeyDown} autoComplete="new-password" placeholder="••••••••" />

          {error && <div className="err">{error}</div>}
          {info && <div className="ok">{info}</div>}

          <button type="button" className="btn" onClick={handleSignup} disabled={loading}>
            {loading ? "가입 중…" : "회원가입"}
          </button>

          <div className="foot">이미 계정이 있나요? <Link href="/login">로그인</Link></div>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; }
      `}</style>
      <style jsx>{`
        .page { min-height:100vh; display:flex; align-items:center; justify-content:center;
          background:linear-gradient(180deg,#fff 0%,#f4f6fc 100%); padding:40px 16px; }
        .card { width:100%; max-width:360px; display:flex; flex-direction:column; gap:8px; }
        .title { font-size:24px; font-weight:700; color:#13274F; margin-bottom:2px; }
        .desc { font-size:13px; color:#6b7280; margin-bottom:12px; }
        .lbl { font-size:13px; font-weight:500; color:#13274F; margin:8px 0 2px; }
        .inp { width:100%; padding:12px 14px; font-size:15px; border:1.5px solid #cbd5e1;
          border-radius:10px; color:#13274F; background:#f8faff; outline:none; }
        .inp:focus { border-color:#13274F; }
        .err { font-size:13px; color:#dc2626; background:#fff1f2; border-radius:8px; padding:8px 12px; margin-top:4px; }
        .ok  { font-size:13px; color:#166534; background:#f0fdf4; border-radius:8px; padding:8px 12px; margin-top:4px; }
        .btn { margin-top:12px; padding:13px; font-size:15px; font-weight:700; color:#fff;
          background:#13274F; border:none; border-radius:10px; cursor:pointer; }
        .btn:disabled { opacity:.6; cursor:default; }
        .foot { margin-top:14px; font-size:13px; color:#6b7280; text-align:center; }
        .foot :global(a) { color:#13274F; font-weight:600; text-decoration:none; }
      `}</style>
    </>
  );
}
