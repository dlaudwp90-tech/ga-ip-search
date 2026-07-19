// pages/pending.js
// ─────────────────────────────────────────────────────────────────────────────
// 【승인 대기 화면】 로그인은 됐지만 아직 관리자 승인 전인 사용자에게 보이는 페이지.
//  - "새로고침"으로 승인 여부 재확인, "로그아웃" 가능.
//  필요한 환경변수(공개용): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Head from "next/head";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Pending() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = "/login"; };
  const recheck = () => { window.location.href = "/"; }; // 승인됐으면 미들웨어가 통과시킴

  return (
    <>
      <Head><title>승인 대기 — Guardian &amp; Angel IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" /></Head>
      <div className="page">
        <div className="card">
          <div className="icon">⏳</div>
          <h1 className="title">승인 대기 중</h1>
          <p className="desc">
            가입이 접수되었습니다.<br />관리자 승인 후 이용하실 수 있습니다.
          </p>
          {email && <div className="email">{email}</div>}
          <button type="button" className="btn primary" onClick={recheck}>승인됐어요 · 새로고침</button>
          <button type="button" className="btn ghost" onClick={signOut}>로그아웃</button>
        </div>
      </div>
      <style jsx global>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Noto Sans KR',sans-serif; }`}</style>
      <style jsx>{`
        .page { min-height:100vh; display:flex; align-items:center; justify-content:center;
          background:linear-gradient(180deg,#fff 0%,#f4f6fc 100%); padding:40px 16px; }
        .card { width:100%; max-width:340px; text-align:center; display:flex; flex-direction:column; gap:10px; }
        .icon { font-size:40px; }
        .title { font-size:22px; font-weight:700; color:#13274F; }
        .desc { font-size:14px; color:#6b7280; line-height:1.6; }
        .email { font-size:12px; color:#94a3b8; word-break:break-all; margin:2px 0 6px; }
        .btn { padding:12px; font-size:14px; font-weight:700; border-radius:10px; cursor:pointer; border:none; }
        .primary { background:#13274F; color:#fff; }
        .ghost { background:#fff1f2; color:#dc2626; }
      `}</style>
    </>
  );
}
