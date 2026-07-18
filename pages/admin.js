// pages/admin.js
// ─────────────────────────────────────────────────────────────────────────────
// 【관리자 화면】 가입 승인/거부 + 관리자 승급/해제. 관리자만 의미 있게 동작.
//  - 로그인 토큰을 /api/admin-users 에 보내 서버가 관리자인지 검증합니다.
//  - 최초 관리자(dlaudwp90)는 강등·해제·삭제 불가(버튼 안 뜸).
//  필요한 환경변수(공개용): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Admin() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState("");

  // 로그인 토큰을 붙여 관리자 API 호출
  const call = async (body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const r = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || ("HTTP " + r.status)); }
    return r.json();
  };

  const load = async () => {
    setLoading(true); setError("");
    try { const d = await call({ action: "list" }); setUsers(d.users || []); }
    catch (e) { setError(e.message === "forbidden" ? "관리자만 접근할 수 있습니다." : e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const act = async (userId, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(userId + action); setError("");
    try { await call({ action, userId }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const B = (id, action) => busy === id + action; // 버튼별 로딩 여부

  const pending  = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);

  return (
    <>
      <Head><title>관리자 — 가입·권한 관리</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div className="wrap">
        <div className="head">
          <h1>가입·권한 관리</h1>
          <Link href="/" className="back">← 메인으로</Link>
        </div>

        {loading && <p className="muted">불러오는 중…</p>}
        {error && <div className="err">{error}</div>}

        {!loading && !error && (
          <>
            {/* 승인 대기 */}
            <h2>승인 대기 <span className="cnt">{pending.length}</span></h2>
            {pending.length === 0 ? <p className="muted">대기 중인 가입자가 없습니다.</p> :
              pending.map(u => (
                <div className="row" key={u.id}>
                  <span className="mail">
                    {u.email}
                    {!u.emailConfirmed && <em className="tag warn">메일 미인증</em>}
                  </span>
                  <span className="btns">
                    <button className="btn ok" disabled={B(u.id,"approve")} onClick={()=>act(u.id,"approve")}>
                      {B(u.id,"approve") ? "…" : "승인"}
                    </button>
                    <button className="btn no" disabled={B(u.id,"reject")}
                      onClick={()=>act(u.id,"reject",`'${u.email}' 가입을 거부하고 계정을 삭제할까요?`)}>
                      {B(u.id,"reject") ? "…" : "거부"}
                    </button>
                  </span>
                </div>
              ))
            }

            {/* 승인된 사용자 + 권한 관리 */}
            <h2 style={{marginTop:24}}>승인된 사용자 <span className="cnt">{approved.length}</span></h2>
            {approved.map(u => (
              <div className="row" key={u.id}>
                <span className="mail">
                  {u.email}
                  {u.isSuper ? <em className="tag super">최초관리자</em>
                    : u.isAdmin ? <em className="tag admin">관리자</em> : null}
                </span>
                <span className="btns">
                  {u.isSuper ? (
                    <span className="locked">보호됨</span>
                  ) : u.isAdmin ? (
                    <button className="btn warnbtn" disabled={B(u.id,"removeAdmin")}
                      onClick={()=>act(u.id,"removeAdmin",`'${u.email}'의 관리자 권한을 해제할까요?`)}>
                      {B(u.id,"removeAdmin") ? "…" : "관리자 해제"}
                    </button>
                  ) : (
                    <>
                      <button className="btn adminbtn" disabled={B(u.id,"makeAdmin")}
                        onClick={()=>act(u.id,"makeAdmin",`'${u.email}'을(를) 관리자로 승급할까요?`)}>
                        {B(u.id,"makeAdmin") ? "…" : "관리자 승급"}
                      </button>
                      <button className="btn no" disabled={B(u.id,"revoke")}
                        onClick={()=>act(u.id,"revoke",`'${u.email}'의 승인을 해제할까요?`)}>
                        {B(u.id,"revoke") ? "…" : "승인 해제"}
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      <style jsx global>{`* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Noto Sans KR',sans-serif; background:#f4f6fc; }`}</style>
      <style jsx>{`
        .wrap { max-width:620px; margin:0 auto; padding:28px 16px 60px; }
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
        h1 { font-size:22px; font-weight:700; color:#13274F; }
        .back { font-size:13px; color:#13274F; text-decoration:none; }
        h2 { font-size:15px; font-weight:700; color:#13274F; margin:18px 0 8px; }
        .cnt { font-size:12px; color:#fff; background:#13274F; border-radius:10px; padding:1px 8px; margin-left:4px; }
        .muted { font-size:13px; color:#94a3b8; padding:6px 0; }
        .err { font-size:13px; color:#dc2626; background:#fff1f2; border-radius:8px; padding:10px 12px; margin:8px 0; }
        .row { display:flex; align-items:center; justify-content:space-between; gap:10px;
          background:#fff; border:1px solid #e5e9f5; border-radius:10px; padding:12px 14px; margin-bottom:8px; }
        .mail { font-size:14px; color:#13274F; word-break:break-all; }
        .btns { display:flex; gap:6px; flex-shrink:0; }
        .tag { font-size:11px; font-style:normal; border-radius:6px; padding:1px 6px; margin-left:6px; }
        .tag.admin { color:#2563eb; background:#eff6ff; }
        .tag.super { color:#7c3aed; background:#f5f3ff; }
        .tag.warn  { color:#b45309; background:#fffbeb; }
        .btn { font-size:13px; font-weight:700; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; white-space:nowrap; }
        .btn:disabled { opacity:.6; cursor:default; }
        .ok { background:#dcfce7; color:#166534; }
        .no { background:#fff1f2; color:#dc2626; }
        .adminbtn { background:#eff6ff; color:#2563eb; }
        .warnbtn { background:#fff7ed; color:#c2410c; }
        .locked { font-size:12px; color:#94a3b8; }
      `}</style>
    </>
  );
}
