// pages/renewals.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 · 전체 포트폴리오 페이지 v2】
//
//  - 김수산 대리인의 등록 상표/디자인을 "한눈에" 보고 연차/갱신 마감을 관리하는 화면.
//  - ★ 데이터는 Redis 캐시(renewals:data)에서만 읽음 → KIPRIS 호출 0회 ★
//    (캐시는 kipris-daily-sync.js 가 하루 1회 채움. 이 페이지는 새로고침해도 KIPRIS를 안 부름.)
//  - v2 추가: 썸네일 이미지(이미지 프록시 경유), 많은 건수 대비 '더보기' 페이징.
//
//  ⚠ 수정 주의: getServerSideProps 의 Redis 읽기(환경변수/키 이름)는 review.js 와 동일하게.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from "react";

// ── Redis(pipeline) 읽기 — review.js 와 동일 방식 (패키지 불필요) ──
async function redisGet(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["GET", key]]),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.[0]?.result ?? null;
  } catch { return null; }
}

export async function getServerSideProps() {
  let data = [], meta = null;
  try {
    const rawData = await redisGet("renewals:data");
    if (rawData) data = JSON.parse(rawData);
    const rawMeta = await redisGet("renewals:meta");
    if (rawMeta) meta = JSON.parse(rawMeta);
  } catch {}

  // 서버 기준 '오늘'로 남은일수/알림여부 미리 계산 (하이드레이션 불일치 방지)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ALERT_MONTHS = 9;
  const rows = data.map((x) => {
    const dl = x.nextDeadline ? new Date(x.nextDeadline + "T00:00:00") : null;
    let daysLeft = null, isAlert = false, overdue = false;
    if (dl) {
      daysLeft = Math.round((dl - today) / 86400000);
      const a = new Date(dl); a.setMonth(a.getMonth() - ALERT_MONTHS);
      isAlert = today >= a; overdue = daysLeft < 0;
    }
    return { ...x, daysLeft, isAlert, overdue };
  });
  return { props: { rows, meta } };
}

// 등록번호 13자리 → 보기 좋게 (예: 4024140350000 → 40-2414035)
const fmtRegNo = (s) => (!s || s.length < 9) ? (s || "") : `${s.slice(0, 2)}-${s.slice(2, 9)}`;
const d = (s) => s || "—";
const fmtSync = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
const dday = (n) => n == null ? "—" : (n === 0 ? "D-DAY" : (n > 0 ? `D-${n}` : `지남 +${Math.abs(n)}일`));
// 이미지 프록시 URL (http KIPRIS 이미지를 https로 우회)
const imgUrl = (r) => { const u = r.thumb || r.image; return u ? `/api/kipris-image?u=${encodeURIComponent(u)}` : null; };

const PAGE = 100; // 한 번에 표시할 개수

export default function RenewalsPage({ rows, meta }) {
  const [view, setView] = useState("all");   // all | alert
  const [type, setType] = useState("전체");   // 전체 | 상표 | 디자인
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const total = rows.length;
  const alertCount = rows.filter((r) => r.alive !== false && r.isAlert).length;

  const list = useMemo(() => {
    let arr = rows.slice();
    if (view === "alert") arr = arr.filter((r) => r.alive !== false && r.isAlert);
    if (type !== "전체") arr = arr.filter((r) => (r.type || "상표") === type);
    const kw = q.trim().toLowerCase();
    if (kw) arr = arr.filter((r) => (r.title || "").toLowerCase().includes(kw) || (r.regNo || "").includes(kw.replace(/-/g, "")));
    arr.sort((a, b) => (a.daysLeft == null) ? 1 : (b.daysLeft == null) ? -1 : a.daysLeft - b.daysLeft);
    return arr;
  }, [rows, view, type, q]);

  useEffect(() => { setShown(PAGE); }, [view, type, q]); // 필터 바뀌면 표시개수 초기화

  const visible = list.slice(0, shown);
  const rowTone = (r) => r.alive === false ? "dead" : r.overdue ? "overdue" : r.isAlert ? "alert" : "normal";

  const Thumb = ({ r }) => {
    const src = imgUrl(r);
    return src
      ? <img className="thumb" src={src} loading="lazy" alt="" />
      : <span className="thumb noimg">—</span>;
  };

  return (
    <div className="wrap">
      <div className="head">
        <h1>연차 · 갱신 관리</h1>
        <div className="meta">
          <span>총 등록 <b>{total}</b>건</span><span className="sep">·</span>
          <span>상표 <b>{meta?.trademarkRegistered ?? "—"}</b> / 디자인 <b>{meta?.designRegistered ?? "—"}</b></span><span className="sep">·</span>
          <span>임박(9개월) <b className="hl">{alertCount}</b>건</span><span className="sep">·</span>
          <span>동기화 {fmtSync(meta?.lastSync)}</span>
        </div>
      </div>

      <div className="bar">
        <div className="seg">
          <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}>전체</button>
          <button className={view === "alert" ? "on" : ""} onClick={() => setView("alert")}>임박만</button>
        </div>
        <div className="seg">
          {["전체", "상표", "디자인"].map((t) => (
            <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        <input className="search" placeholder="명칭 또는 등록번호 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="count">{list.length}건</span>
      </div>

      {/* PC: 표 */}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>이미지</th><th>유형</th><th>명칭</th><th>등록번호</th><th>등록일</th>
              <th>납부유형</th><th>다음 마감</th><th>마감일</th><th>D-day</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.regNo} className={rowTone(r)}>
                <td><Thumb r={r} /></td>
                <td><span className={`badge ${(r.type || "상표") === "디자인" ? "dsn" : "tm"}`}>{r.type || "상표"}</span></td>
                <td className="title">{r.title || <span className="muted">(명칭없음)</span>}</td>
                <td className="mono">{fmtRegNo(r.regNo)}</td>
                <td>{d(r.regDate)}</td>
                <td>{r.detailPending ? <span className="muted">조회중</span> : (r.paymentType || "—")}</td>
                <td>{r.alive === false ? <span className="muted">소멸</span> : (r.nextDeadlineKind || "—")}</td>
                <td>{r.alive === false ? "—" : d(r.nextDeadline)}</td>
                <td className="dday">{r.alive === false ? "—" : dday(r.daysLeft)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={9} className="empty">표시할 건이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 */}
      <div className="cards">
        {visible.map((r) => (
          <div key={r.regNo} className={`card ${rowTone(r)}`}>
            <div className="cardTop">
              <Thumb r={r} />
              <div className="cardHead">
                <span className={`badge ${(r.type || "상표") === "디자인" ? "dsn" : "tm"}`}>{r.type || "상표"}</span>
                <span className="cardTitle">{r.title || "(명칭없음)"}</span>
              </div>
              <span className="dday">{r.alive === false ? "소멸" : dday(r.daysLeft)}</span>
            </div>
            <div className="cardRow"><span>등록번호</span><b className="mono">{fmtRegNo(r.regNo)}</b></div>
            <div className="cardRow"><span>등록일</span><b>{d(r.regDate)}</b></div>
            <div className="cardRow"><span>납부유형</span><b>{r.detailPending ? "조회중" : (r.paymentType || "—")}</b></div>
            <div className="cardRow"><span>다음 마감</span><b>{r.alive === false ? "소멸" : `${r.nextDeadlineKind || "—"} · ${d(r.nextDeadline)}`}</b></div>
          </div>
        ))}
        {list.length === 0 && <div className="empty">표시할 건이 없습니다.</div>}
      </div>

      {list.length > shown && (
        <div className="more"><button onClick={() => setShown((s) => s + PAGE)}>더보기 ({list.length - shown}건 남음)</button></div>
      )}

      <style jsx>{`
        .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", sans-serif; color: #1f2937; }
        .head h1 { font-size: 22px; margin: 0 0 6px; font-weight: 700; }
        .meta { font-size: 13px; color: #6b7280; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .meta b { color: #111827; } .meta b.hl { color: #d97706; } .sep { color: #d1d5db; }

        .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
        .seg { display: inline-flex; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        .seg button { border: 0; background: #fff; padding: 7px 12px; font-size: 13px; cursor: pointer; color: #6b7280; }
        .seg button.on { background: #4f46e5; color: #fff; }
        .search { flex: 1; min-width: 160px; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; }
        .count { font-size: 12px; color: #9ca3af; }

        .badge { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .badge.tm { background: #eef2ff; color: #4338ca; } .badge.dsn { background: #ecfdf5; color: #047857; }

        .thumb { width: 44px; height: 44px; object-fit: contain; background: #fff; border: 1px solid #eee; border-radius: 6px; display: inline-block; }
        .thumb.noimg { display: inline-flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 12px; }

        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead th { text-align: left; padding: 9px 10px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        tbody td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        td.title { font-weight: 600; } .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
        td.dday { font-weight: 700; white-space: nowrap; }
        .muted { color: #9ca3af; } .empty { text-align: center; color: #9ca3af; padding: 30px; }

        tr.alert td { background: #fff7ed; } tr.alert td.dday { color: #c2410c; }
        tr.overdue td { background: #fef2f2; } tr.overdue td.dday { color: #b91c1c; }
        tr.dead td { color: #9ca3af; background: #fafafa; }

        .cards { display: none; flex-direction: column; gap: 10px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; }
        .card.alert { border-color: #fdba74; background: #fff7ed; }
        .card.overdue { border-color: #fca5a5; background: #fef2f2; }
        .card.dead { opacity: .6; }
        .cardTop { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .cardHead { flex: 1; min-width: 0; }
        .cardTitle { font-weight: 700; display: block; margin-top: 2px; }
        .cardTop .dday { font-weight: 700; font-size: 13px; white-space: nowrap; }
        .card.alert .cardTop .dday { color: #c2410c; } .card.overdue .cardTop .dday { color: #b91c1c; }
        .cardRow { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
        .cardRow span { color: #6b7280; }

        .more { text-align: center; margin-top: 16px; }
        .more button { padding: 9px 20px; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; cursor: pointer; font-size: 13px; color: #4f46e5; }

        @media (max-width: 768px) { .tableWrap { display: none; } .cards { display: flex; } }
        @media (prefers-color-scheme: dark) {
          .wrap { color: #e5e7eb; } .head h1 { color: #f3f4f6; } .meta { color: #9ca3af; } .meta b { color: #f3f4f6; }
          .seg { border-color: #374151; } .seg button { background: #1f2937; color: #9ca3af; }
          .search { background: #1f2937; border-color: #374151; color: #e5e7eb; }
          .thumb { background: #fff; border-color: #374151; }
          thead th { background: #111827; color: #9ca3af; border-color: #374151; } tbody td { border-color: #1f2937; }
          tr.alert td { background: #3a2a13; } tr.overdue td { background: #3a1818; } tr.dead td { background: #161616; }
          .card { background: #1f2937; border-color: #374151; }
          .card.alert { background: #3a2a13; border-color: #b45309; } .card.overdue { background: #3a1818; border-color: #b91c1c; }
          .badge.tm { background: #312e81; color: #c7d2fe; } .badge.dsn { background: #064e3b; color: #a7f3d0; }
          .more button { background: #1f2937; border-color: #374151; color: #c7d2fe; }
        }
      `}</style>
    </div>
  );
}
