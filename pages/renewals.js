// pages/renewals.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 · 전체 포트폴리오 페이지 v3】
//
//  - 김수산 대리인의 등록 상표/디자인을 한눈에 보고 연차/갱신 마감을 관리하는 화면.
//  - ★ 데이터는 Supabase 캐시(app_cache)에서만 읽음 → KIPRIS 호출 0회 ★
//  - v3 추가: 썸네일 크게(130px), 명칭 클릭 시 '바텀시트'로 상세정보(큰 이미지 + 출원/등록/존속/연차 등).
//
//  ⚠ 수정 주의: getServerSideProps 의 Redis 읽기(환경변수/키 이름)는 review.js 와 동일하게.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from "react";

// ── Supabase app_cache 읽기 (jsonb → 이미 배열/객체로 반환) ──
async function sbGetCache(key) {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !skey) return null;
  try {
    const r = await fetch(`${url}/rest/v1/app_cache?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: skey, Authorization: `Bearer ${skey}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j[0] ? j[0].value : null;
  } catch { return null; }
}

export async function getServerSideProps() {
  let data = [], meta = null;
  try {
    const d = await sbGetCache("renewals_data");
    if (Array.isArray(d)) data = d;
    const m = await sbGetCache("renewals_meta");
    if (m) meta = m;
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
  const [drawings, setDrawings] = useState([]);   // 디자인 육면도(여러 도면) 목록
  const [drLoading, setDrLoading] = useState(false); // 도면 불러오는 중 표시용
  const [tmImg, setTmImg] = useState("");         // 상표 고화질 이미지 경로
  const [tmLoading, setTmLoading] = useState(false); // 상표 고화질 불러오는 중 표시용

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

  // 바텀시트가 열릴 때만 KIPRIS에서 고화질 이미지를 1회 조회한다(결과는 서버에서 Redis 캐시 → 재방문 0회).
  //  - 디자인: 육면도(여러 도면) 목록
  //  - 상표: 견본이미지(고해상도 1장) — 목록 이미지는 저해상도라 흐릿하므로 교체용
  useEffect(() => {
    setDrawings([]); // 이전 도면 초기화
    setTmImg("");    // 이전 상표 고화질 초기화
    if (!selected || !selected.appNo) return;
    if (selected.type === "디자인") {
      setDrLoading(true);
      fetch(`/api/kipris-design-images?app=${encodeURIComponent(selected.appNo)}`)
        .then((r) => r.json())
        .then((d) => setDrawings(Array.isArray(d.images) ? d.images : []))
        .catch(() => {})
        .finally(() => setDrLoading(false));
    } else {
      // 상표
      setTmLoading(true);
      fetch(`/api/kipris-trademark-image?app=${encodeURIComponent(selected.appNo)}`)
        .then((r) => r.json())
        .then((d) => setTmImg(d.large || ""))
        .catch(() => {})
        .finally(() => setTmLoading(false));
    }
  }, [selected]);

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

            {/* 디자인+육면도 → 가로 캐러셀 / 디자인 단일 → 대표도면 / 상표 → 고화질 견본이미지 */}
            {selected.type === "디자인" && drawings.length > 0 ? (
              <>
                <div className="drawings">
                  {drawings.map((g, i) => (
                    <div className="drawSlide" key={i}>
                      <img src={imgUrl(g.large || g.small)} alt={g.name || ""} loading="lazy" />
                      {g.name ? <span className="drawName">{g.name}</span> : null}
                    </div>
                  ))}
                </div>
                {drawings.length > 1 && <div className="drawHint">← 좌우로 넘겨보기 ({drawings.length}장) →</div>}
              </>
            ) : selected.type === "디자인" ? (
              imgUrl(selected.image || selected.thumb) ? (
                <div className="sheetImg">
                  <img src={imgUrl(selected.image || selected.thumb)} alt="" />
                  {drLoading && <div className="drawHint">도면 불러오는 중…</div>}
                </div>
              ) : (drLoading ? <div className="drawHint">도면 불러오는 중…</div> : null)
            ) : (
              // 상표: 고화질(tmImg)이 오면 그걸로, 오기 전/없으면 목록 이미지로 폴백
              (tmImg || imgUrl(selected.image || selected.thumb)) ? (
                <div className="sheetImg">
                  <img src={tmImg ? imgUrl(tmImg) : imgUrl(selected.image || selected.thumb)} alt="" />
                  {tmLoading && !tmImg && <div className="drawHint">고화질 이미지 불러오는 중…</div>}
                </div>
              ) : null
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
        .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", sans-serif; color: #1f2937; color-scheme: light; }
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

        /* PC 표를 모바일 카드와 같은 '흰색 패널'로 → 라이트모드 색감 일치 */
        .tableWrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead th { text-align: left; padding: 9px 10px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        tbody td { padding: 8px 10px; background: #fff; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
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
        .card.dead { background: #fafafa; color: #9ca3af; }
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
        .sheet { position: relative; width: 100%; max-width: 640px; background: #fff; border-radius: 18px 18px 0 0; padding: 16px 20px 28px; max-height: 90vh; overflow-y: auto; animation: slideUp .22s ease; box-shadow: 0 -8px 30px rgba(0,0,0,.2); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .sheetGrip { width: 40px; height: 4px; border-radius: 3px; background: #e5e7eb; margin: 2px auto 12px; }
        .sheetClose { position: absolute; top: 12px; right: 14px; border: 0; background: none; font-size: 18px; color: #9ca3af; cursor: pointer; }
        .sheetHead { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .sheetHead h2 { font-size: 18px; margin: 0; font-weight: 700; }
        .sheetImg { margin-bottom: 16px; }
        .sheetImg img { width: 100%; max-height: 62vh; object-fit: contain; border: 1px solid #eee; border-radius: 10px; background: #fff; padding: 8px; box-sizing: border-box; }
        /* 디자인 육면도 가로 스크롤 캐러셀 — 한 장이 시트 폭을 꽉 채우고 옆으로 스와이프 */
        .drawings { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 6px; margin-bottom: 4px; }
        .drawSlide { flex: 0 0 100%; scroll-snap-align: center; text-align: center; }
        .drawSlide img { width: 100%; max-height: 62vh; object-fit: contain; border: 1px solid #eee; border-radius: 10px; background: #fff; padding: 8px; box-sizing: border-box; }
        .drawName { display: block; font-size: 12px; color: #6b7280; margin-top: 4px; }
        .drawHint { text-align: center; font-size: 12px; color: #9ca3af; margin: 4px 0 14px; }
        .detail { margin: 0; }
        .detail > div { display: flex; padding: 9px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
        .detail dt { width: 110px; flex: 0 0 110px; color: #6b7280; margin: 0; }
        .detail dd { margin: 0; flex: 1; font-weight: 500; }
        .detail .rd { color: #b91c1c; } .detail .og { color: #c2410c; }

        @media (max-width: 768px) { .tableWrap { display: none; } .cards { display: flex; } }
      `}</style>
    </div>
  );
}
