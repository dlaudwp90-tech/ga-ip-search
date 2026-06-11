// pages/renewals.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 · 전체 포트폴리오 페이지】
//
//  - 김수산 대리인의 등록 상표/디자인을 "한눈에" 보고, 연차/갱신 마감을 관리하는 화면입니다.
//  - ★ 데이터는 Redis 캐시(renewals:data)에서만 읽습니다 → KIPRIS 호출 0회 ★
//    (캐시는 kipris-daily-sync.js 가 하루 1회 채웁니다. 이 페이지는 아무리 새로고침해도 KIPRIS를 안 부릅니다.)
//  - '유형' 컬럼이 있어, 나중에 디자인이 캐시에 추가되면 코드 수정 없이 함께 표시됩니다.
//
//  ⚠ 수정 주의: getServerSideProps 의 Redis 읽기 부분(환경변수/키 이름)은 review.js 와 동일하게 맞춰야 합니다.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";

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
  } catch {
    return null;
  }
}

// 페이지 진입 시 서버에서 캐시를 읽어 내려줌 (브라우저는 KIPRIS/Redis 직접 접근 안 함)
export async function getServerSideProps() {
  let data = [];
  let meta = null;
  try {
    const rawData = await redisGet("renewals:data");
    if (rawData) data = JSON.parse(rawData);
    const rawMeta = await redisGet("renewals:meta");
    if (rawMeta) meta = JSON.parse(rawMeta);
  } catch {}

  // 서버 기준 '오늘'로 남은일수/알림여부를 미리 계산해서 내려줌 (하이드레이션 불일치 방지)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ALERT_MONTHS = 9; // 마감 9개월 전부터 알림

  const rows = data.map((x) => {
    const dl = x.nextDeadline ? new Date(x.nextDeadline + "T00:00:00") : null;
    let daysLeft = null, isAlert = false, overdue = false;
    if (dl) {
      daysLeft = Math.round((dl - today) / 86400000);
      const alertStart = new Date(dl); alertStart.setMonth(alertStart.getMonth() - ALERT_MONTHS);
      isAlert = today >= alertStart;       // 9개월 창 진입
      overdue = daysLeft < 0;              // 마감 지남
    }
    return { ...x, daysLeft, isAlert, overdue };
  });

  return { props: { rows, meta } };
}

// 등록번호 13자리 → 보기 좋게 (예: 4024140350000 → 40-2414035)
function fmtRegNo(s) {
  if (!s || s.length < 9) return s || "";
  return `${s.slice(0, 2)}-${s.slice(2, 9)}`;
}
// YYYY-MM-DD 그대로 표시(빈값 처리)
const d = (s) => s || "—";
// 동기화 시각(ISO) → 한국시간 표시
function fmtSync(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}
// D-day 라벨
function dday(n) {
  if (n == null) return "—";
  if (n === 0) return "D-DAY";
  return n > 0 ? `D-${n}` : `지남 +${Math.abs(n)}일`;
}

export default function RenewalsPage({ rows, meta }) {
  const [view, setView] = useState("all");      // "all"(전체) | "alert"(임박만)
  const [type, setType] = useState("전체");      // "전체" | "상표" | "디자인"
  const [q, setQ] = useState("");               // 검색어(명칭/등록번호)

  // 요약 숫자
  const total = rows.length;
  const alertCount = rows.filter((r) => r.alive !== false && r.isAlert).length;

  // 필터 + 정렬(임박순: 남은일수 오름차순)
  const list = useMemo(() => {
    let arr = rows.slice();
    if (view === "alert") arr = arr.filter((r) => r.alive !== false && r.isAlert);
    if (type !== "전체") arr = arr.filter((r) => (r.type || "상표") === type);
    const kw = q.trim().toLowerCase();
    if (kw) {
      arr = arr.filter((r) =>
        (r.title || "").toLowerCase().includes(kw) ||
        (r.regNo || "").includes(kw.replace(/-/g, ""))
      );
    }
    arr.sort((a, b) => {
      if (a.daysLeft == null) return 1;
      if (b.daysLeft == null) return -1;
      return a.daysLeft - b.daysLeft;
    });
    return arr;
  }, [rows, view, type, q]);

  // 행 색상 클래스
  const rowTone = (r) =>
    r.alive === false ? "dead" : r.overdue ? "overdue" : r.isAlert ? "alert" : "normal";

  return (
    <div className="wrap">
      {/* ── 헤더/요약 ── */}
      <div className="head">
        <h1>연차 · 갱신 관리</h1>
        <div className="meta">
          <span>총 등록 <b>{total}</b>건</span>
          <span className="sep">·</span>
          <span>마감 임박(9개월) <b className="hl">{alertCount}</b>건</span>
          <span className="sep">·</span>
          <span>마지막 동기화 {fmtSync(meta?.lastSync)}</span>
        </div>
      </div>

      {/* ── 필터 바 ── */}
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
        <input
          className="search"
          placeholder="명칭 또는 등록번호 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="count">{list.length}건</span>
      </div>

      {/* ── PC: 표 ── */}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>유형</th><th>명칭</th><th>등록번호</th><th>등록일</th>
              <th>납부유형</th><th>다음 마감</th><th>마감일</th><th>D-day</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.regNo} className={rowTone(r)}>
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
            {list.length === 0 && (
              <tr><td colSpan={8} className="empty">표시할 건이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 모바일: 카드 ── */}
      <div className="cards">
        {list.map((r) => (
          <div key={r.regNo} className={`card ${rowTone(r)}`}>
            <div className="cardTop">
              <span className={`badge ${(r.type || "상표") === "디자인" ? "dsn" : "tm"}`}>{r.type || "상표"}</span>
              <span className="cardTitle">{r.title || "(명칭없음)"}</span>
              <span className="dday">{r.alive === false ? "소멸" : dday(r.daysLeft)}</span>
            </div>
            <div className="cardRow"><span>등록번호</span><b className="mono">{fmtRegNo(r.regNo)}</b></div>
            <div className="cardRow"><span>등록일</span><b>{d(r.regDate)}</b></div>
            <div className="cardRow"><span>납부유형</span><b>{r.detailPending ? "조회중" : (r.paymentType || "—")}</b></div>
            <div className="cardRow"><span>다음 마감</span>
              <b>{r.alive === false ? "소멸" : `${r.nextDeadlineKind || "—"} · ${d(r.nextDeadline)}`}</b>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="empty">표시할 건이 없습니다.</div>}
      </div>

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
        .badge.tm { background: #eef2ff; color: #4338ca; }
        .badge.dsn { background: #ecfdf5; color: #047857; }

        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead th { text-align: left; padding: 9px 10px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        tbody td { padding: 9px 10px; border-bottom: 1px solid #f3f4f6; }
        td.title { font-weight: 600; } td.mono, .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
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
        .cardTop { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .cardTitle { font-weight: 700; flex: 1; }
        .cardTop .dday { font-weight: 700; font-size: 13px; }
        .card.alert .cardTop .dday { color: #c2410c; } .card.overdue .cardTop .dday { color: #b91c1c; }
        .cardRow { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
        .cardRow span { color: #6b7280; }

        @media (max-width: 768px) {
          .tableWrap { display: none; }
          .cards { display: flex; }
        }
        @media (prefers-color-scheme: dark) {
          .wrap { color: #e5e7eb; }
          .head h1 { color: #f3f4f6; } .meta { color: #9ca3af; } .meta b { color: #f3f4f6; }
          .seg { border-color: #374151; } .seg button { background: #1f2937; color: #9ca3af; }
          .search { background: #1f2937; border-color: #374151; color: #e5e7eb; }
          thead th { background: #111827; color: #9ca3af; border-color: #374151; }
          tbody td { border-color: #1f2937; }
          tr.alert td { background: #3a2a13; } tr.overdue td { background: #3a1818; } tr.dead td { background: #161616; }
          .card { background: #1f2937; border-color: #374151; }
          .card.alert { background: #3a2a13; border-color: #b45309; } .card.overdue { background: #3a1818; border-color: #b91c1c; }
          .badge.tm { background: #312e81; color: #c7d2fe; } .badge.dsn { background: #064e3b; color: #a7f3d0; }
        }
      `}</style>
    </div>
  );
}
