// pages/renewals.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 · 전체 포트폴리오 페이지 v3】
//
//  - 김수산 대리인의 등록 상표/디자인을 한눈에 보고 연차/갱신 마감을 관리하는 화면.
//  - ★ 데이터는 Redis 캐시(renewals:data)에서만 읽음 → KIPRIS 호출 0회 ★
//  - v3 추가: 썸네일 크게(130px), 명칭 클릭 시 '바텀시트'로 상세정보(큰 이미지 + 출원/등록/존속/연차 등).
//
//  ⚠ 수정 주의: getServerSideProps 의 Redis 읽기(환경변수/키 이름)는 review.js 와 동일하게.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from "react";

// ── Redis(pipeline) 읽기 — review.js 와 동일 방식 ──
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

// ── 표시 헬퍼 ──
const fmtRegNo = (s) => (!s || s.length < 9) ? (s || "") : `${s.slice(0, 2)}-${s.slice(2, 9)}`;            // 등록번호 40-2414035
const fmtAppNo = (s) => (!s || s.length < 7) ? (s || "—") : `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`; // 출원번호 40-2025-0091177
const d = (s) => s || "—";
const fmtSync = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
const dday = (n) => n == null ? "—" : (n === 0 ? "D-DAY" : (n > 0 ? `D-${n}` : `지남 +${Math.abs(n)}일`));
const imgUrl = (u) => u ? `/api/kipris-image?u=${encodeURIComponent(u)}` : null;
const fmtClass = (r) => { if (!r.classCode) return "—"; return r.type === "상표" ? r.classCode.split("|").join(", ") + "류" : r.classCode; };

const PAGE = 100;
const THUMB = 130; // 썸네일 한 변 px (이전 44 → 약 3배)

export default function RenewalsPage({ rows, meta }) {
  const [view, setView] = useState("all");
  const [type, setType] = useState("전체");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null); // 바텀시트 대상

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

  useEffect(() => { setShown(PAGE); }, [view, type, q]);

  const visible = list.slice(0, shown);
  const rowTone = (r) => r.alive === false ? "dead" : r.overdue ? "overdue" : r.isAlert ? "alert" : "normal";

  const Thumb = ({ r, size }) => {
    const src = imgUrl(r.thumb || r.image);
    const box = { width: size, height: size, objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, flex: "0 0 auto", display: "block" };
    return src
      ? <img src={src} loading="lazy" alt="" style={box} />
      : <span style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 12 }}>이미지<br/>없음</span>;
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
                <td><Thumb r={r} size={THUMB} /></td>
                <td><span className={`badge ${(r.type || "상표") === "디자인" ? "dsn" : "tm"}`}>{r.type || "상표"}</span></td>
                <td className="title"><button className="link" onClick={() => setSelected(r)}>{r.title || "(명칭없음)"}</button></td>
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
          <div key={r.regNo} className={`card ${rowTone(r)}`} onClick={() => setSelected(r)}>
            <div className="cardTop">
              <Thumb r={r} size={THUMB} />
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

      {/* ── 바텀시트(상세) ── */}
      {selected && (
        <div className="sheetBackdrop" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetGrip" />
            <button className="sheetClose" onClick={() => setSelected(null)}>✕</button>

            <div className="sheetHead">
              <span className={`badge ${(selected.type || "상표") === "디자인" ? "dsn" : "tm"}`}>{selected.type || "상표"}</span>
              <h2>{selected.title || "(명칭없음)"}</h2>
            </div>

            {imgUrl(selected.image || selected.thumb) && (
              <div className="sheetImg"><img src={imgUrl(selected.image || selected.thumb)} alt="" /></div>
            )}

            <dl className="detail">
              <div><dt>등록번호</dt><dd className="mono">{fmtRegNo(selected.regNo)}</dd></div>
              <div><dt>출원번호</dt><dd className="mono">{fmtAppNo(selected.appNo)}</dd></div>
              <div><dt>출원일</dt><dd>{d(selected.appDate)}</dd></div>
              <div><dt>등록일</dt><dd>{d(selected.regDate)}</dd></div>
              <div><dt>존속기간 만료</dt><dd>{d(selected.expirationDate)}</dd></div>
              <div><dt>{selected.type === "디자인" ? "물품분류" : "상품류"}</dt><dd>{fmtClass(selected)}</dd></div>
              <div><dt>권리자</dt><dd>{d(selected.holder)}</dd></div>
              <div><dt>납부유형</dt><dd>{selected.paymentType || "—"}{selected.maxLastAnnual ? ` (${selected.maxLastAnnual}년차)` : ""}</dd></div>
              <div><dt>다음 마감</dt><dd>
                {selected.alive === false
                  ? <span className="muted">소멸{selected.terminationCause ? ` · ${selected.terminationCause}` : ""}</span>
                  : <>{selected.nextDeadlineKind || "—"} · {d(selected.nextDeadline)} <b className={selected.overdue ? "rd" : selected.isAlert ? "og" : ""}>{dday(selected.daysLeft)}</b></>}
              </dd></div>
              <div><dt>상태</dt><dd>{selected.status || "—"}</dd></div>
            </dl>
          </div>
        </div>
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

        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead th { text-align: left; padding: 9px 10px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        tbody td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        td.title { font-weight: 600; } .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
        td.dday { font-weight: 700; white-space: nowrap; }
        .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: #4f46e5; cursor: pointer; text-align: left; text-decoration: underline; text-underline-offset: 2px; }
        .muted { color: #9ca3af; } .empty { text-align: center; color: #9ca3af; padding: 30px; }

        tr.alert td { background: #fff7ed; } tr.alert td.dday { color: #c2410c; }
        tr.overdue td { background: #fef2f2; } tr.overdue td.dday { color: #b91c1c; }
        tr.dead td { color: #9ca3af; background: #fafafa; }

        .cards { display: none; flex-direction: column; gap: 10px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #fff; cursor: pointer; }
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

        /* 바텀시트 */
        .sheetBackdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1000; display: flex; align-items: flex-end; justify-content: center; }
        .sheet { position: relative; width: 100%; max-width: 560px; background: #fff; border-radius: 18px 18px 0 0; padding: 16px 20px 28px; max-height: 88vh; overflow-y: auto; animation: slideUp .22s ease; box-shadow: 0 -8px 30px rgba(0,0,0,.2); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .sheetGrip { width: 40px; height: 4px; border-radius: 3px; background: #e5e7eb; margin: 2px auto 12px; }
        .sheetClose { position: absolute; top: 12px; right: 14px; border: 0; background: none; font-size: 18px; color: #9ca3af; cursor: pointer; }
        .sheetHead { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .sheetHead h2 { font-size: 18px; margin: 0; font-weight: 700; }
        .sheetImg { text-align: center; margin-bottom: 16px; }
        .sheetImg img { max-width: 240px; max-height: 240px; object-fit: contain; border: 1px solid #eee; border-radius: 10px; background: #fff; padding: 6px; }
        .detail { margin: 0; }
        .detail > div { display: flex; padding: 9px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
        .detail dt { width: 110px; flex: 0 0 110px; color: #6b7280; margin: 0; }
        .detail dd { margin: 0; flex: 1; font-weight: 500; }
        .detail .rd { color: #b91c1c; } .detail .og { color: #c2410c; }

        @media (max-width: 768px) { .tableWrap { display: none; } .cards { display: flex; } }
        @media (prefers-color-scheme: dark) {
          .wrap { color: #e5e7eb; } .head h1 { color: #f3f4f6; } .meta { color: #9ca3af; } .meta b { color: #f3f4f6; }
          .seg { border-color: #374151; } .seg button { background: #1f2937; color: #9ca3af; }
          .search { background: #1f2937; border-color: #374151; color: #e5e7eb; }
          thead th { background: #111827; color: #9ca3af; border-color: #374151; } tbody td { border-color: #1f2937; }
          tr.alert td { background: #3a2a13; } tr.overdue td { background: #3a1818; } tr.dead td { background: #161616; }
          .card { background: #1f2937; border-color: #374151; }
          .card.alert { background: #3a2a13; border-color: #b45309; } .card.overdue { background: #3a1818; border-color: #b91c1c; }
          .badge.tm { background: #312e81; color: #c7d2fe; } .badge.dsn { background: #064e3b; color: #a7f3d0; }
          .more button { background: #1f2937; border-color: #374151; color: #c7d2fe; }
          .link { color: #a5b4fc; }
          .sheet { background: #1f2937; box-shadow: 0 -8px 30px rgba(0,0,0,.5); }
          .sheetHead h2 { color: #f3f4f6; } .sheetGrip { background: #374151; }
          .detail > div { border-color: #111827; } .detail dt { color: #9ca3af; }
          .sheetImg img { background: #fff; border-color: #374151; }
        }
      `}</style>
    </div>
  );
}
