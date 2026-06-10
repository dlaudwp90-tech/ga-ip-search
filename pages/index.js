// ============================================================================
// pages/index.js  —  G&A IP 사내 검색 메인 화면
// ----------------------------------------------------------------------------
// [이 파일이 하는 일]
//   · 노션 DB를 검색하고, 최근 편집된 건을 실시간으로 보여주는 메인 페이지입니다.
//   · 대표검토(확인/반려/검토) 토글, 댓글, 알림, 파일 다운로드 등을 포함합니다.
//
// [화면(뷰) 규칙]  ⚠ 중요
//   · 모바일(768px 이하)    → 세로로 쌓이는 '카드형 목록'(.mobile-cards) 하나만
//   · PC·태블릿(769px 이상) → 여러 열 '카드 그리드'(.pc-cards) 하나만
//   · 기기마다 단일 뷰. 전환 버튼 없음. 표시는 맨 아래 CSS 미디어쿼리가 결정.
//     ← 이 CSS 부분 함부로 바꾸지 말 것.
//
// [수정 시 주의]
//   · PC와 모바일 뷰는 서로 독립입니다. 한쪽을 고칠 때 다른 쪽 영향 없는지 확인.
//   · tabView 상태값은 모바일/PC 카드 레이아웃 전환에만 쓰입니다.
//   · 코드가 길어 부분 교체보다 '전체 파일 교체'가 안전합니다.
//   · 카드 이동(재정렬) 애니메이션은 framer-motion 라이브러리를 씁니다.
//     ⚠ package.json 에 "framer-motion" 의존성이 반드시 있어야 하며,
//        이 파일(index.js)만 단독 배포하면 빌드가 실패합니다 → package.json과 함께 배포할 것.
// ============================================================================
import React from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
// framer-motion: 카드 재정렬(위치 이동) 애니메이션 라이브러리. ⚠ package.json 의존성 필요
import { motion } from "framer-motion";


// ─── 이름 + 연도 + 부분 복사 추출 ──────────────────────────────────────────
// appNum(출원번호)   "40-2026-0075516 (26.04.16)"    → name(없음) / year "2026" / partial "0075516"
// appOwner(출원인)   "김은희(4-2026-030277-6)"        → name "김은희" / year "2026" / partial "030277"
//                    "주식회사 코리아이앤피(1-...)"    → name "주식회사 코리아이앤피" ...
// agentCode(대리인)  "2026-017894-2"                  → name(없음) / year "2026" / partial "017894"
// 추출 실패 시 null — 버튼 미표시
const extractCopyExtras = (line, field) => {
  const empty = { name: null, year: null, partial: null };
  if (!line) return empty;
  const t = line.trim();
  let m = null;
  if (field === "appNum") {
    m = t.match(/\d{2}-(\d{4})-(\d{7})\b/);
    return m ? { name: null, year: m[1], partial: m[2] } : empty;
  }
  if (field === "appOwner") {
    // 괄호 바로 앞까지를 name으로, 괄호 내부에서 연도/일련번호 추출
    m = t.match(/^(.*?)\s*\(\s*\d-(\d{4})-(\d{6})-\d\s*\)/);
    if (!m) return empty;
    const rawName = (m[1] || "").trim();
    return { name: rawName || null, year: m[2], partial: m[3] };
  }
  if (field === "agentCode") {
    m = t.match(/\b(\d{4})-(\d{6})-\d\b/);
    return m ? { name: null, year: m[1], partial: m[2] } : empty;
  }
  return empty;
};
// 기존 호환 (미사용 대비)
const extractPartialCopy = (line, field) => extractCopyExtras(line, field).partial;
// ck 키(prefix)로 필드 판별 — n/a=출원번호, o=출원인, c=대리인 / mn/mo/mc / pn/po/pc
const fieldFromCk = (ck) => {
  const parts = String(ck).split("-"); // ["{i}", "prefix", "{li}"]
  const p = parts[1] || "";
  if (p === "n" || p === "a" || p === "mn" || p === "pn") return "appNum";
  if (p === "o" || p === "mo" || p === "po") return "appOwner";
  if (p === "c" || p === "mc" || p === "pc") return "agentCode";
  return null;
};

// ─── 줄별 복사 버튼 표시 여부 판별 ─────────────────────────────────────────
// 규칙: 끝이 ) 이거나 숫자로 끝나면 복사 O, 그 외(한글 라벨, 00류 등) 복사 X
// 예외 마커: 라인 앞에 공백 2칸( "  " )이 있으면 강제로 복사 제외
const shouldCopyLine = (line) => {
  if (!line || !line.trim()) return false;
  if (line.startsWith("  ")) return false;          // 예외 마커: 공백 2칸 시작
  const t = line.trim();
  if (t.endsWith(")")) return true;                 // (특허고객번호) 형식
  if (/\d$/.test(t)) return true;                  // 출원번호·대리인코드 등 숫자 끝
  return false;
};
// 예외 마커 공백 제거 후 표시용 텍스트 반환
const displayLine = (line) => line.startsWith("  ") ? line.trimStart() : line;

// ── 노션 글자색/볼드 표시용 도우미 ──
//   search.js(API)가 내려준 줄별 색·볼드 정보({c,b})를 실제 CSS 스타일로 변환합니다.
//   ⚠ 색 이름 → 색상값. 다크모드에서는 더 밝은 색을 사용(가이드 페이지 색상과 동일 계열).
//   이 부분은 표시 전용이라 데이터/검색 로직에는 영향 없음.
const NOTION_TEXT_COLORS = {
  gray:{light:"#6b7280",dark:"#9ca3af"}, brown:{light:"#8b5e34",dark:"#b08968"},
  orange:{light:"#c2410c",dark:"#fb923c"}, yellow:{light:"#a16207",dark:"#facc15"},
  green:{light:"#166534",dark:"#4ade80"}, blue:{light:"#1d4ed8",dark:"#60a5fa"},
  purple:{light:"#7e22ce",dark:"#c084fc"}, pink:{light:"#be185d",dark:"#f472b6"},
  red:{light:"#b91c1c",dark:"#f87171"},
};
// info = { c: 색이름|null, b: 볼드여부 } → CSS style 객체로 변환
const notionTextStyle = (info, dark) => {
  if (!info) return {};
  const s = {};
  if (info.b) s.fontWeight = 700;                          // 볼드
  if (info.c) {
    const name = String(info.c).replace("_background", ""); // 배경색이면 같은 계열 글자색으로 처리
    const c = NOTION_TEXT_COLORS[name];
    if (c) s.color = dark ? c.dark : c.light;
  }
  return s;
};
// row 의 특정 필드(ck 로 판별)·특정 줄(li)의 색/볼드 style 반환
const lineStyle = (row, ck, li, dark) =>
  notionTextStyle(row[(fieldFromCk(ck) || "") + "Styles"]?.[li], dark);
function renderSingleLine(text) {
  if (!text) return "—";
  return text.split("\n")[0];
}

function renderWithIndent(text) {
  if (!text) return <span className="cell-text">—</span>;
  const lines = text.split("\n");
  if (lines.length === 1) return <span className="cell-text">{text}</span>;
  return (
    <div className="indent-block">
      {lines.map((line, i) => (
        <div key={i} className={i === 0 ? "first-line" : "indent-line"}>{line || "\u3000"}</div>
      ))}
    </div>
  );
}

const NOTION_COLOR = {
  default:{ bg:"#e5e7eb",text:"#374151",darkBg:"#374151",darkText:"#d1d5db" },
  gray:   { bg:"#f3f4f6",text:"#4b5563",darkBg:"#374151",darkText:"#d1d5db" },
  brown:  { bg:"#f5e6d8",text:"#7c3f1e",darkBg:"#3b1506",darkText:"#e2b48a" },
  orange: { bg:"#ffedd5",text:"#9a3412",darkBg:"#431407",darkText:"#fdba74" },
  yellow: { bg:"#fef9c3",text:"#854d0e",darkBg:"#422006",darkText:"#fde68a" },
  green:  { bg:"#dcfce7",text:"#166534",darkBg:"#14532d",darkText:"#86efac" },
  blue:   { bg:"#dbeafe",text:"#1e40af",darkBg:"#1e3a6e",darkText:"#93c5fd" },
  purple: { bg:"#ede9fe",text:"#5b21b6",darkBg:"#3b0764",darkText:"#c4b5fd" },
  pink:   { bg:"#fce7f3",text:"#9d174d",darkBg:"#500724",darkText:"#f9a8d4" },
  red:    { bg:"#fee2e2",text:"#991b1b",darkBg:"#450a0a",darkText:"#fca5a5" },
};
function notionBadgeStyle(color, dark) {
  const c = NOTION_COLOR[color] || NOTION_COLOR.default;
  return dark ? { background: c.darkBg, color: c.darkText } : { background: c.bg, color: c.text };
}

function rowBg(i, dark, hover = false) {
  if (hover) return dark ? "#1e3a5f" : "#f0f4ff";
  if (i % 2 === 0) return dark ? "#1e293b" : "#fff";
  return dark ? "#172035" : "#f7f8ff";
}

// ── 카드 내 파일 업로드 패널 ──
//   각 카드의 📎 버튼을 누르면 펼쳐짐.
//   ① 드래그앤드롭 또는 클릭으로 파일을 '대기 목록'에 추가(여러 번 가능)
//   ② '업로드' 버튼을 눌러야 실제 업로드 → ③ 성공 표시 후 잠시 뒤 패널이 자동으로 닫힘.
//   ⚠ 저장 폴더는 카드 고유 'pageId' 기준 → 노션 제목을 바꿔도 파일이 안 깨짐.
//   업로드/삭제 시 노션 '파일다운링크'도 /api/upload가 함께 갱신함. (비개발자: 이 컴포넌트는 한 덩어리로 유지)
function CardUploadPanel({ pageId, fileLinks, dark, onChange, onClose }) {
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState([]); // 업로드 대기 파일 (아직 안 올림)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");        // 진행/오류 메시지
  const [done, setDone] = useState("");      // 성공 표시 메시지
  const fileRef = useRef(null);

  // 한글 등 파일명 경로를 노션 저장 형식과 동일하게 인코딩 (appendFileLink와 일치)
  const encUrl = (u) => u.split("/").map((p, i) => (i < 3 ? p : encodeURIComponent(decodeURIComponent(p)))).join("/");

  // 드롭/선택한 파일을 '대기 목록'에 추가만 함 (바로 업로드 X). 같은 파일(이름+크기)은 중복 추가 안 함.
  const addFiles = (filesIn) => {
    const list = Array.from(filesIn || []);
    if (!list.length) return;
    setDone(""); setMsg("");
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => f.name + ":" + f.size));
      return [...prev, ...list.filter((f) => !seen.has(f.name + ":" + f.size))];
    });
  };

  const removeStaged = (idx) => setStaged((prev) => prev.filter((_, k) => k !== idx));

  // '업로드' 버튼: 대기 목록 전체를 차례로 업로드 (presign → R2 PUT → 노션 링크 갱신)
  const doUpload = async () => {
    if (busy || !staged.length) return;
    setBusy(true); setDone(""); setMsg("");
    let cur = [...fileLinks];
    let okCount = 0;
    for (let n = 0; n < staged.length; n++) {
      const f = staged[n];
      setMsg(`업로드 중… (${n + 1}/${staged.length}) ${f.name}`);
      try {
        const pr = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "presign", folder: pageId, fileName: f.name, contentType: f.type || "application/octet-stream" }) });
        const pd = await pr.json();
        if (!pd.presignedUrl) throw new Error("presign 실패");
        await fetch(pd.presignedUrl, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        const enc = encUrl(pd.publicUrl);
        if (!cur.includes(enc)) {
          await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "notify", pageId, folder: pageId, publicUrl: pd.publicUrl }) });
          cur = [...cur, enc];
        }
        okCount++;
      } catch (e) {
        onChange(cur);
        setMsg("⚠ 업로드 실패: " + f.name + " (" + (e.message || "") + ")");
        setBusy(false);
        return;
      }
    }
    onChange(cur);
    setStaged([]); setMsg(""); setBusy(false);
    setDone(`✅ ${okCount}개 업로드 완료`);
    setTimeout(() => onClose(), 1800); // 성공 표시를 잠깐 보여준 뒤 패널 자동 닫기
  };

  // 업로드된 파일 삭제: R2 영구 삭제 + 노션 링크 제거
  const doDelete = async (url) => {
    if (busy) return;
    if (!window.confirm("이 파일을 삭제하시겠습니까? (저장소에서 영구 삭제)")) return;
    const key = url.split("/").slice(3).join("/");
    setBusy(true);
    try {
      await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", key, pageId, publicUrl: url }) });
      onChange(fileLinks.filter((u) => u !== url));
    } catch { setMsg("삭제 실패"); }
    setBusy(false);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ margin: "4px 0 8px", padding: 10, borderRadius: 10,
        background: dark ? "#0f172a" : "#f8faff", border: `1px solid ${dark ? "#334155" : "#dbe3f5"}` }}>
      {/* 드롭존: 끌어다 놓거나 클릭해서 '대기 목록'에 추가 (아직 업로드 X) */}
      <div onClick={() => !busy && fileRef.current && fileRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        style={{ cursor: busy ? "default" : "pointer", textAlign: "center", padding: "14px 8px", borderRadius: 8,
          border: `2px dashed ${dragging ? "#6366f1" : (dark ? "#475569" : "#c3cce6")}`,
          background: dragging ? (dark ? "#1e293b" : "#eef1fb") : "transparent",
          color: dark ? "#94a3b8" : "#6b7280", fontSize: 12, lineHeight: 1.4 }}>
        📎 파일을 끌어다 놓거나 클릭해서 추가
      </div>
      <input ref={fileRef} type="file" multiple style={{ display: "none" }}
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      {/* 대기 목록 + 업로드 버튼 */}
      {staged.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {staged.map((f, k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: dark ? "#cbd5e1" : "#374151" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⬆ {f.name}</span>
              {!busy && (
                <button onClick={() => removeStaged(k)} title="목록에서 제거"
                  style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: dark ? "#94a3b8" : "#9ca3af" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={doUpload} disabled={busy}
            style={{ marginTop: 4, alignSelf: "flex-start", border: "none", borderRadius: 7, padding: "6px 14px",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: busy ? "default" : "pointer",
              background: busy ? (dark ? "#334155" : "#cbd5e1") : "#4f46e5", color: "#fff" }}>
            {busy ? "업로드 중…" : `⬆ ${staged.length}개 업로드`}
          </button>
        </div>
      )}

      {/* 진행 / 성공 / 오류 표시 */}
      {(msg || done) && (
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600,
          color: done ? (dark ? "#4ade80" : "#16a34a") : (dark ? "#fca5a5" : "#dc2626") }}>
          {done || msg}
        </div>
      )}

      {/* 현재(업로드된) 파일 목록 — 🗑로 삭제 */}
      {fileLinks.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${dark ? "#334155" : "#e5e9f5"}`, display: "flex", flexDirection: "column", gap: 4 }}>
          {fileLinks.map((u, k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: dark ? "#cbd5e1" : "#374151" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {decodeURIComponent(u.split("/").pop())}</span>
              <button onClick={() => doDelete(u)} disabled={busy} title="삭제"
                style={{ flexShrink: 0, border: "none", background: "transparent", cursor: busy ? "default" : "pointer", fontSize: 13, color: dark ? "#f87171" : "#dc2626" }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState(false); // 노션 초기 로딩 실패 여부 (빈 화면 방지용)
  const [error,        setError]        = useState(null);
  const [searched,     setSearched]     = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [tabView,      setTabView]      = useState("auto"); // "auto"|"mobile"|"pc"
  const [fadeVisible,  setFadeVisible]  = useState(true);
  const [popup,        setPopup]        = useState(null);
  const [copied,       setCopied]       = useState({});
  const [filePopup,    setFilePopup]    = useState(null);
  const [popupPos,     setPopupPos]     = useState({ x: 0, y: 0 });
  const [downloading,  setDownloading]  = useState({});
  const [tableVisible, setTableVisible] = useState(false);
  const [isRecent,     setIsRecent]     = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [hoveredRow,   setHoveredRow]   = useState(null);


  // ── 닉네임 ──
  const [nickname,      setNickname]      = useState(null);
  const [nickInput,     setNickInput]     = useState("");
  const [nickEditing,   setNickEditing]   = useState(false);
  const [nickSaving,    setNickSaving]    = useState(false);

  // ── 댓글 ──
  const [commentPanels, setCommentPanels] = useState({}); // { idx: { open, comments, loading, input, saving, saved } }

  // ── 카드 파일 업로드 패널 (pageId 기준 열림/닫힘) ──
  const [uploadPanels, setUploadPanels] = useState({});
  const toggleUploadPanel = (pageId) => setUploadPanels(p => ({ ...p, [pageId]: { open: !p[pageId]?.open } }));
  // 업로드/삭제 후 해당 카드의 파일 목록(fileLinks)을 즉시 갱신 (낙관적 업데이트)
  const updateRowFiles = (pid, urls) => setResults(prev => Array.isArray(prev) ? prev.map(r => r.pageId === pid ? { ...r, fileLinks: urls.join("\n") } : r) : prev);

  const toggleRow = (idx) => setExpandedRows(p => ({ ...p, [idx]: !p[idx] }));
  const inputRef      = useRef(null);
  const filePopupRef  = useRef(null);
  const router        = useRouter();
  const { signOut }   = useClerk();
  const { user }      = useUser();
  const [userPopup,   setUserPopup]   = useState(false);
  const [userBtnPos,  setUserBtnPos]  = useState({ x: 0, y: 0 });
  const userBtnRef    = useRef(null);

  // ── 알림 ──
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [notifList,   setNotifList]   = useState([]);
  const [lastRead,    setLastRead]    = useState(0);
  const [notifPos,    setNotifPos]    = useState({ x: 0, y: 0 });
  const [nowTs,       setNowTs]       = useState(Date.now());
  const notifBtnRef   = useRef(null);
  const mobileCardRefs = useRef({});
  const pcCardRefs     = useRef({});

  // ── 실시간 폴링 ──
  const resultsRef   = useRef(null);
  const isPollingRef = useRef(false);
  const [pollToast, setPollToast] = useState(null); // { text, type: "update"|"new" }

  // ── FLIP 애니메이션 ──

  // 1분마다 현재 시각 갱신 (1시간 뱃지 자동 소멸)
  // 시스템 다크모드 변경 자동 감지
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── resultsRef: 폴링 클로저에서 최신 results 참조 ──
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // ── 노션 데이터 실시간 폴링 (30초) — recent 모드일 때만 ──
  useEffect(() => {
    if (!isRecent) return; // 검색 결과 화면에서는 폴링 안 함

    const pollNotionData = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "recent" }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const polled = data.results || [];
        if (!polled.length) return;

        const current = resultsRef.current;
        if (!current?.length) return;

        const currentMap = new Map(current.map((r, i) => [r.pageId, { row: r, idx: i }]));

        let updatedCount = 0;
        const newItems = [];

        for (const polledRow of polled) {
          const existing = currentMap.get(polledRow.pageId);
          if (existing) {
            if (polledRow.lastEditedTime && polledRow.lastEditedTime > (existing.row.lastEditedTime || "")) {
              updatedCount++;
            }
          } else {
            newItems.push(polledRow);
          }
        }

        if (updatedCount === 0 && newItems.length === 0) return;

        // recent 모드는 항상 최근 편집 순 — 폴링 결과 전체로 교체
        setResults(polled);

        const toastText = newItems.length > 0
          ? `✦ ${newItems.length}건 새로 추가됨`
          : `↻ ${updatedCount}건 업데이트됨`;
        const toastType = newItems.length > 0 ? "new" : "update";
        setPollToast({ text: toastText, type: toastType });
        setTimeout(() => setPollToast(null), 3500);

      } catch {
        // 폴링 실패는 무시
      } finally {
        isPollingRef.current = false;
      }
    };

    const id = setInterval(pollNotionData, 10000);
    return () => clearInterval(id);
  }, [isRecent]);

  // ── 카드 재정렬 애니메이션: framer-motion이 자동 처리 ──
  // (이전의 수동 FLIP 코드 제거. 각 카드의 <motion.div layout="position"> + 고유 key가
  //  목록 변경 시 옛 위치 → 새 위치로 부드럽게 이동시킨다. 위치 계산/타이머는 라이브러리가 담당.)


  // 닉네임 로드
  useEffect(() => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress }),
    }).then(r => r.json()).then(d => {
      setNickname(d.nickname || null);
      setNickInput(d.nickname || "");
    });
  }, [user]);

  // ── 개인 설정 (dark / tabView) 로드·저장 ──
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress }),
    })
      .then(r => r.json())
      .then(d => {
        if (d?.prefs) {
          if (typeof d.prefs.dark === "boolean")    setDark(d.prefs.dark);
          if (typeof d.prefs.tabView === "string")  setTabView(d.prefs.tabView);
        }
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true));
  }, [user]);

  // 값이 바뀔 때마다 자동 저장 (최초 로드 전엔 저장 안 함)
  useEffect(() => {
    if (!prefsLoaded) return;
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.primaryEmailAddress.emailAddress,
        prefs: { dark, tabView },
      }),
    }).catch(() => {});
  }, [dark, tabView, prefsLoaded, user]);

  // 알림 로드
  const loadNotifications = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    const r = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", email: user.primaryEmailAddress.emailAddress }),
    });
    const d = await r.json();
    setNotifList(d.notifications || []);
    setLastRead(Number(d.lastRead) || 0);
  };

  useEffect(() => { loadNotifications(); }, [user]);

  // 알림 읽음 처리
  const markNotifRead = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead", email: user.primaryEmailAddress.emailAddress }),
    });
    setLastRead(Date.now());
  };

  // 알림 클릭 → 해당 행으로 이동 + 댓글 패널 열기
  const handleNotifClick = async (notif) => {
    setNotifOpen(false);
    // PC: 테이블 행에서 찾기
    const idx = results?.findIndex(r => r.pageId === notif.pageId);
    if (idx !== undefined && idx >= 0) {
      await toggleCommentPanel(idx, notif.pageId);
      const scrollToTarget = () => {
        const isMobile = window.innerWidth <= 768;
        let target;
        // 모바일(<=768px)=카드형 목록(mobileCardRefs), PC=카드 그리드(pcCardRefs)
        if (isMobile) target = mobileCardRefs.current[idx];
        else          target = pcCardRefs.current[idx];
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: "smooth" });
          return true;
        }
        return false;
      };
      if (!scrollToTarget()) {
        let tries = 0;
        const retry = setInterval(() => {
          if (scrollToTarget() || ++tries >= 8) clearInterval(retry);
        }, 200);
      }
    } else {
      // 현재 목록에 없으면 all.js로 이동하며 pageId 전달
      router.push(`/all?openComment=${notif.pageId}`);
    }
  };


  useEffect(() => { fetchRecent(); }, []);

  // 결과 로드 시 각 카드의 댓글 수 미리 조회 (댓글 뱃지 표시용)
  //   ⚠ 카드 식별을 'pageId'(고유 ID)로 한다 — index(몇 번째)로 하면 카드가 재정렬될 때
  //      뱃지가 옛 자리에 남아 '댓글 없는 카드에 뱃지가 뜨는' 문제가 생긴다.
  //   ⚠ 댓글이 0개여도 comments:[] 로 항상 갱신 → 다른 곳에서 옮겨온 옛 뱃지를 깨끗이 지운다.
  useEffect(() => {
    if (!results?.length) return;
    results.forEach((row) => {
      if (!row.pageId) return;
      fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId: row.pageId }),
      }).then(r => r.json()).then(d => {
        setCommentPanels(prev => ({
          ...prev,
          [row.pageId]: { ...(prev[row.pageId] || {}), comments: d.comments || [] }
        }));
      }).catch(() => {});
    });
  }, [results]);
  // ── 노션 '최근 편집' 목록 불러오기 ──
  //   ⚠ 콜드 스타트/일시 지연 대비: 첫 요청이 실패하면 자동으로 다시 시도합니다(최대 3회, 0.8s→1.6s→2.4s 간격).
  //      그래서 '처음 접속'이나 '오랜만에 접속'해서 첫 호출이 늦더라도, 빈 화면 대신 잠깐 기다렸다가 채워집니다.
  //      3번 모두 실패하면 loadError 를 켜서 화면에 안내 + '다시 시도' 버튼을 보여줍니다(빈 화면 방지).
  const fetchRecent = async (attempt = 0) => {
    if (attempt === 0) { setLoading(true); setLoadError(false); setTableVisible(false); }
    try {
      const res  = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent" }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results); setIsRecent(true); setLoadError(false);
        setTimeout(() => setTableVisible(true), 50);
        setLoading(false);
        return;
      }
      throw new Error("server not ok"); // 아래 catch 의 재시도 로직으로 보냄
    } catch {
      // 실패 → 최대 3회까지 재시도 (간격을 점점 늘림)
      if (attempt < 3) {
        setTimeout(() => fetchRecent(attempt + 1), 800 * (attempt + 1));
        return; // 재시도 중에는 로딩 스피너를 그대로 유지
      }
      // 재시도 모두 실패 → 빈 화면 대신 안내/다시시도 표시
      setLoadError(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!filePopup) return;
    const handle = (e) => {
      if (filePopupRef.current?.contains(e.target)) return;
      if (e.target.closest(".file-link-wrap")) return;
      setFilePopup(null);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("touchstart", handle); };
  }, [filePopup]);

  // 유저 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!userPopup) return;
    const handle = (e) => {
      if (userBtnRef.current?.contains(e.target)) return;
      setUserPopup(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [userPopup]);

  // 알림 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!notifOpen) return;
    const handle = (e) => {
      if (notifBtnRef.current?.contains(e.target)) return;
      setNotifOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [notifOpen]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setFilePopup(null); setTableVisible(false);
    await new Promise(r => setTimeout(r, 280));
    setLoading(true); setError(null); setResults(null); setSearched(true); setIsRecent(false); setExpandedRows({});
    try {
      const res  = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 실패");
      setResults(data.results);
      setTimeout(() => setTableVisible(true), 50);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };
  const handleSaveNick = async () => {
    if (!nickInput.trim()) return;
    setNickSaving(true);
    await fetch("/api/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress, nickname: nickInput.trim() }),
    });
    setNickname(nickInput.trim());
    setNickEditing(false);
    setNickSaving(false);
  };

  // ── 댓글 패널 토글 ──
  const toggleCommentPanel = async (idx, pageId) => {
    const isOpen = commentPanels[pageId]?.open;
    if (isOpen) {
      // 접기: closing 애니메이션 후 닫기
      setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], closing: true } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], open: false, closing: false } })), 380);
      return;
    }
    // 열기 1단계: 빈 패널 먼저 펼치기
    setCommentPanels(prev => ({ ...prev, [pageId]: { ...(prev[pageId]||{}), open: true, loading: true, commentsVisible: false } }));
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId }),
      });
      const d = await r.json();
      // 열기 2단계: 패널 펼쳐진 후 댓글 fade-in
      setTimeout(() => {
        setCommentPanels(prev => ({ ...prev, [pageId]: { ...(prev[pageId]||{}), loading: false, comments: d.comments || [], commentsVisible: true } }));
      }, 320);
    } catch {
      setCommentPanels(prev => ({ ...prev, [pageId]: { ...(prev[pageId]||{}), loading: false, comments: [], commentsVisible: true } }));
    }
  };

  // ── 댓글 작성 ──
  const handleEditComment = async (idx, pageId, commentId) => {
    const panel = commentPanels[pageId] || {};
    if (!panel.editInput?.trim()) return;
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", pageId, commentId, nickname: nickname || "익명", content: panel.editInput.trim() }),
    });
    const r2 = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", pageId }),
    });
    const d2 = await r2.json();
    setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], comments: d2.comments || [], editingId: null } }));
  };

  const handlePostComment = async (idx, pageId) => {
    const panel = commentPanels[pageId] || {};
    if (!panel.input?.trim()) return;
    setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], saving: true } }));
    const docTitle = results?.[idx]?.title || "";
    const r = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post", pageId, nickname: nickname || "익명", content: panel.input, docTitle }),
    });
    const d = await r.json();
    if (d.ok) {
      // 목록 새로고침
      const r2 = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId }),
      });
      const d2 = await r2.json();
      setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], saving: false, saved: true, input: "", comments: d2.comments || [] } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], saved: false } })), 3000);
    } else {
      setCommentPanels(prev => ({ ...prev, [pageId]: { ...prev[pageId], saving: false } }));
    }
  };

  const handleClear   = () => {
    setQuery(""); setSearched(false); setResults(null); setError(null); setFilePopup(null);
    setTableVisible(false); setIsRecent(false); fetchRecent();
    inputRef.current?.focus();
  };
  const handleTitleClick = (e, url) => { e.stopPropagation(); setFilePopup(null); setPopup({ url }); };
  const openInNotion  = () => { if (!popup?.url) return; window.location.href = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/"); setPopup(null); };
  const openInBrowser = () => { if (!popup?.url) return; window.open(popup.url, "_blank"); setPopup(null); };
  const handleCopy    = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500);
    });
  };
  const isMultiLine   = (text) => text && text.includes("\n");
  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation(); e.preventDefault();
    setDownloading(p => ({ ...p, [key]: true }));
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = { pdf:"application/pdf",hwpx:"application/octet-stream",hwp:"application/octet-stream",
          pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
          docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",htl:"application/octet-stream" };
        const fh = await window.showSaveFilePicker({ suggestedName: fileName,
          types:[{description:"파일",accept:{[mimeMap[ext]||"application/octet-stream"]:[`.${ext}`]}}] });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const bUrl = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=bUrl; a.download=fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(bUrl);
      }
    } catch (err) { if (err.name !== "AbortError") alert("다운로드 실패: " + err.message); }
    finally { setDownloading(p => ({ ...p, [key]: false })); setFilePopup(null); }
  };



  return (
    <>
      <Head>
        <title>Guardian & Angel IP — 문서 통합 검색</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="가엔 특허법률사무소 · 특허·상표·디자인 문서 통합 검색" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Guardian & Angel IP — 문서 통합 검색" />
        <meta property="og:description" content="가엔 특허법률사무소 · 특허·상표·디자인 문서 통합 검색" />
        <meta property="og:image" content="https://ga-ip-search.vercel.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://ga-ip-search.vercel.app" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Guardian & Angel IP — 문서 통합 검색" />
        <meta name="twitter:description" content="가엔 특허법률사무소 · 특허·상표·디자인 문서 통합 검색" />
        <meta name="twitter:image" content="https://ga-ip-search.vercel.app/og-image.png" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* ── 실시간 폴링 토스트 ── */}
      {pollToast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, pointerEvents: "none",
          background: pollToast.type === "new"
            ? (dark ? "#14532d" : "#f0fdf4")
            : (dark ? "#1e3a6e" : "#eef1fb"),
          color: pollToast.type === "new"
            ? (dark ? "#86efac" : "#166534")
            : (dark ? "#93c5fd" : "#1a3a8f"),
          border: `1.5px solid ${pollToast.type === "new"
            ? (dark ? "#4ade80" : "#86efac")
            : (dark ? "#60a5fa" : "#93c5fd")}`,
          borderRadius: 20, padding: "8px 20px",
          fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          whiteSpace: "nowrap",
          animation: "pollToastIn 0.3s ease",
        }}>
          {pollToast.text}
        </div>
      )}

      {/* 파일 팝업 */}
      {filePopup && results && (() => {
        let ri, ci;
        if (filePopup.startsWith("m_") || filePopup.startsWith("pc_")) {
          const parts = filePopup.split("_");
          ri = Number(parts[1]); ci = Number(parts[2]);
        } else {
          [ri, ci] = filePopup.split("-").map(Number);
        }
        const row = results[ri];
        if (!row?.fileLinks) return null;
        const links = row.fileLinks.split("\n").filter(Boolean);
        const link  = links[ci];
        if (!link) return null;
        const fileName = decodeURIComponent(link.split("/").pop());
        const dlKey    = `dl-${filePopup}`;
        return (
          <div ref={filePopupRef}
            style={{ position:"fixed",left:popupPos.x+14,top:popupPos.y-10,zIndex:500,
              background:dark?"#1e293b":"#fff",border:dark?"1.5px solid #334155":"1.5px solid #e5e9f5",
              borderRadius:10,boxShadow:"0 8px 24px rgba(19,39,79,0.18)",padding:6,minWidth:140,display:"flex",flexDirection:"column",gap:4 }}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            <a href={link} target="_blank" rel="noreferrer"
              style={{fontSize:12,fontWeight:700,padding:"8px 14px",borderRadius:7,textDecoration:"none",textAlign:"center",background:dark?"#1e3a6e":"#eef1fb",color:dark?"#93c5fd":"#1a3a8f",display:"block"}}
              onClick={()=>setFilePopup(null)}>🔍 미리보기</a>
            <button
              style={{fontSize:12,fontWeight:700,padding:"8px 14px",borderRadius:7,textAlign:"center",
                background:downloading[dlKey]?(dark?"#1e293b":"#f3f4f6"):(dark?"#14532d":"#f0fdf4"),
                color:downloading[dlKey]?"#9ca3af":(dark?"#86efac":"#166534"),
                border:"none",cursor:downloading[dlKey]?"not-allowed":"pointer",fontFamily:"inherit"}}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
              onClick={e=>handleDownload(e,link,fileName,dlKey)} disabled={downloading[dlKey]}>
              {downloading[dlKey]?"⏳ 준비 중...":"⬇ 다운로드"}
            </button>
          </div>
        );
      })()}

      <div className={`page${searched?" searched":""}${dark?" dark":""}`}>
        {/* ── 우측 상단 버튼 묶음 (all.js와 동일 구조) ── */}
        <div style={{ position:"fixed", top:14, right:12, zIndex:400,
          display:"flex", alignItems:"flex-start", gap:8 }}>

          {/* 알림 벨 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <button ref={notifBtnRef} title="댓글 알림"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                setNotifPos({ x: rect.left, y: rect.bottom });
                if (!notifOpen) { markNotifRead(); loadNotifications(); }
                setNotifOpen(p => !p);
                setUserPopup(false);
              }}
              style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
                width:40, height:40, fontSize:18, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                position:"relative", transition:"border-color .2s" }}>
              🔔
              {notifList.some(n => nowTs - n.ts < 3600000) && (
                <span style={{ position:"absolute", top:-4, right:-4,
                  background:"#ef4444", color:"#fff", fontSize:11, fontWeight:900,
                  minWidth:18, height:18, borderRadius:9999,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  padding:"0 4px", border:"2px solid #fff", lineHeight:1 }}>
                  N
                </span>
              )}
            </button>
            <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>알림</span>
          </div>

          {/* 유저 버튼 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <button ref={userBtnRef} title="계정"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                setUserBtnPos({ x: rect.left, y: rect.bottom });
                setUserPopup(p => !p);
                setNotifOpen(false);
              }}
              style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
                width:40, height:40, fontSize:18, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"border-color .2s", flexShrink:0 }}>
              👤
            </button>
            <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>내 정보</span>
          </div>

          {/* 업로드 버튼 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <button onClick={()=>router.push("/upload")} title="파일 업로드"
              style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
                width:40, height:40, fontSize:18, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"border-color .2s", flexShrink:0 }}>
              📁
            </button>
            <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>업로드</span>
          </div>

          {/* 테마 버튼 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <button onClick={()=>setDark(!dark)} title={dark?"라이트":"다크"}
              style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
                width:40, height:40, fontSize:18, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"border-color .2s", flexShrink:0 }}>
              {dark?"☀️":"🌙"}
            </button>
            <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>{dark?"라이트모드":"다크모드"}</span>
          </div>

        </div>{/* ── 우측 버튼 묶음 끝 ── */}

        {/* 알림 드롭다운 */}
        {notifOpen && (
          <div style={{ position:"fixed", right:16, top:notifPos.y+6, zIndex:600,
            background:dark?"#1e293b":"#fff",
            border:dark?"1.5px solid #334155":"1.5px solid #e5e9f5",
            borderRadius:12, boxShadow:"0 8px 32px rgba(19,39,79,0.18)",
            width:300, maxHeight:420, overflowY:"auto",
            display:"flex", flexDirection:"column" }}
            onMouseDown={e=>e.stopPropagation()}>
            <div style={{ padding:"12px 16px 8px", borderBottom:dark?"1px solid #334155":"1px solid #f1f5f9",
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:700, color:dark?"#e2e8f0":"#13274F" }}>댓글 알림</span>
              <button onClick={() => setNotifOpen(false)}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#94a3b8" }}>✕</button>
            </div>
            {notifList.length === 0 ? (
              <div style={{ padding:24, textAlign:"center", fontSize:13, color:"#94a3b8" }}>알림이 없습니다</div>
            ) : (
              notifList.map((n, ni) => {
                const isNew = (nowTs - n.ts) < 3600000;
                return (
                  <div key={n.id} onClick={() => handleNotifClick(n)}
                    style={{ padding:"10px 16px", cursor:"pointer", borderBottom:dark?"1px solid #1e293b":"1px solid #f8faff",
                      background: isNew ? (dark?"rgba(30,58,110,0.2)":"#eef2ff") : "transparent",
                      transition:"background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = dark?"#334155":"#f1f5f9"}
                    onMouseLeave={e => e.currentTarget.style.background = isNew?(dark?"rgba(30,58,110,0.2)":"#eef2ff"):"transparent"}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:dark?"#93c5fd":"#1a3a8f" }}>{n.docTitle}</span>
                      {isNew && (
                        <span style={{ background:"#ef4444", color:"#fff", fontSize:10, fontWeight:900,
                          borderRadius:9999, padding:"1px 5px", lineHeight:1.4, flexShrink:0 }}>N</span>
                      )}
                    </div>
                    <div style={{ fontSize:12, color:dark?"#94a3b8":"#6b7280", marginBottom:2 }}>
                      <span style={{ fontWeight:600 }}>{n.nickname}</span> · {n.createdAt}
                    </div>
                    <div style={{ fontSize:12, color:dark?"#cbd5e1":"#374151",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {n.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        {userPopup && (
          <div
            style={{ position:"fixed", right: 16, top:userBtnPos.y+6, zIndex:500,
              background:dark?"#1e293b":"#fff", border:dark?"1.5px solid #334155":"1.5px solid #e5e9f5",
              borderRadius:10, boxShadow:"0 8px 24px rgba(19,39,79,0.18)",
              padding:6, minWidth:200, maxWidth:260, display:"flex", flexDirection:"column", gap:4 }}
            onMouseDown={e=>e.stopPropagation()}
          >
            {user?.primaryEmailAddress?.emailAddress && (
              <div style={{ fontSize:11, color:dark?"#94a3b8":"#6b7280", padding:"6px 10px 4px",
                borderBottom:dark?"1px solid #334155":"1px solid #e5e9f5", marginBottom:2, wordBreak:"break-all" }}>
                {user.primaryEmailAddress.emailAddress}
              </div>
            )}
            {/* 닉네임 */}
            {nickEditing ? (
              <div style={{ display:"flex", gap:4, padding:"4px 6px" }}>
                <input
                  autoFocus
                  value={nickInput}
                  onChange={e => setNickInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter") handleSaveNick(); if(e.key==="Escape") setNickEditing(false); }}
                  style={{ flex:1, fontSize:12, border:"1.5px solid #cbd5e1", borderRadius:6,
                    padding:"4px 8px", outline:"none", fontFamily:"inherit",
                    background:dark?"#0f172a":"#f8faff", color:dark?"#e2e8f0":"#13274F" }}
                  placeholder="닉네임 입력"
                />
                <button onClick={handleSaveNick} disabled={nickSaving}
                  style={{ fontSize:11, fontWeight:700, padding:"4px 8px", borderRadius:6,
                    background:"#13274F", color:"#fff", border:"none", cursor:"pointer", fontFamily:"inherit" }}>
                  {nickSaving?"…":"저장"}
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"6px 10px", fontSize:12, color:dark?"#e2e8f0":"#13274F" }}>
                <span>👤 {nickname || "닉네임 없음"}</span>
                <button onClick={() => setNickEditing(true)}
                  style={{ fontSize:11, background:"none", border:"1px solid #cbd5e1", borderRadius:5,
                    padding:"2px 7px", cursor:"pointer", color:dark?"#94a3b8":"#6b7280", fontFamily:"inherit" }}>
                  변경
                </button>
              </div>
            )}

            {/* ── 개인 설정 ── */}
            <div style={{ borderTop:dark?"1px solid #334155":"1px solid #e5e9f5",
              marginTop:4, paddingTop:8 }}>
              <div style={{ fontSize:10, color:dark?"#94a3b8":"#9ca3af", fontWeight:600,
                padding:"0 10px 6px", letterSpacing:"0.04em" }}>
                기본 설정 (자동 저장)
              </div>

              {/* 테마 */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"4px 10px", fontSize:11, color:dark?"#e2e8f0":"#13274F" }}>
                <span>테마</span>
                <div style={{ display:"flex", gap:2, border:dark?"1px solid #334155":"1px solid #cbd5e1",
                  borderRadius:6, padding:1, background:dark?"#0f172a":"#f8faff" }}>
                  {[
                    { v:false, label:"라이트" },
                    { v:true,  label:"다크" },
                  ].map(o => (
                    <button key={String(o.v)} onClick={() => setDark(o.v)}
                      style={{ fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:4,
                        border:"none", cursor:"pointer", fontFamily:"inherit",
                        background: dark===o.v ? (dark?"#334155":"#13274F") : "transparent",
                        color: dark===o.v ? "#fff" : (dark?"#94a3b8":"#6b7280") }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <button
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textAlign:"center",
                background:dark?"#450a0a":"#fff1f2", color:dark?"#f87171":"#dc2626",
                border:"none", cursor:"pointer", fontFamily:"inherit" }}
              onClick={() => { setUserPopup(false); signOut({ redirectUrl: "/login" }); }}
            >
              🚪 로그아웃
            </button>
          </div>
        )}

        <div className="logo-area" onClick={searched?handleClear:undefined} style={searched?{cursor:"pointer"}:{}}>
          <div className="logo-wrap">
            <div className="logo-top-rule"/>
            <h1 className="logo-main">Guardian &amp; Angel</h1>
            <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
            <div className="logo-mid-rule"/>
            <p className="logo-sub-kr">가엔 특허법률사무소</p>
            <div className="logo-bot-rule"/>
          </div>
          {searched && <p className="logo-hint">← 처음으로</p>}
          {!searched && <p className="subtitle">문서 통합 검색</p>}
        </div>

        <div className="search-wrap">
          <div className="search-box">
            <span className="icon">🔍</span>
            <input ref={inputRef} type="text" placeholder="문서명, 출원번호, 출원인, 대리인 코드..."
              value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus={typeof window !== "undefined" && window.innerWidth > 768} />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        <div className="results">
          {loading && <div className="loading"><div className="spinner"/><p>Notion DB 검색 중...</p></div>}

          {/* 노션 초기 로딩이 끝났는데(스피너 종료) 결과가 없고 실패한 경우 → 빈 화면 대신 안내 + 다시 시도 */}
          {!loading && results === null && loadError && (
            <div className="loading">
              <p style={{ color:"#dc2626", fontSize:15, marginBottom:2, fontWeight:600 }}>노션을 불러오지 못했어요</p>
              <p style={{ color:"#6b7280", fontSize:13 }}>잠시 후 다시 시도해 주세요.</p>
              <button onClick={() => fetchRecent()}
                style={{ marginTop:10, padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer",
                  background:"#13274F", color:"#fff", fontWeight:700, fontSize:14, fontFamily:"inherit" }}>
                ↻ 다시 시도
              </button>
            </div>
          )}
          {error   && <p className="error">⚠️ {error}</p>}
          {!loading && results !== null && (
            results.length === 0 ? (
              <div className={`fade-wrap${tableVisible?" visible":""}`}>
                <div className="no-result">
                  <p className="no-icon">📭</p><p className="no-text">검색 결과가 없습니다</p>
                  <p className="no-sub">다른 키워드로 시도해 보세요</p>
                </div>
              </div>
            ) : (
              <div className={`fade-wrap${tableVisible?" visible":""}`}>
                <div className="count-row">
                  {/* 왼쪽: 텍스트 2줄 세로 스택 */}
                  {isRecent ? (
                    <div className="count-left-stack">
                      <p className="count" style={{marginBottom:0}}>
                        🕐 최근 수정된 문서 20건&nbsp;
                        <span className="recent-hint">(여기에 없는 문서는 검색창을 이용해주세요)</span>
                      </p>
                    </div>
                  ) : (
                    <p className="count">{`검색 결과 ${results.length}건`}</p>
                  )}

                  {/* 오른쪽: 버튼들만 */}
                  {isRecent && (
                    <div className="count-btns">
                      <button className="nav-btn nav-btn-all"   onClick={()=>router.push("/all")}>📂 문서 전체 보기</button>
                      <button className="nav-btn nav-btn-guide" onClick={()=>router.push("/guide")}>📋 문서 작성 방법 및 양식</button>
                    </div>
                  )}
                </div>

                {/* ── 모바일(768px 이하) 기본 뷰 = 카드형 목록 ──
                    세로로 쌓이는 카드(.m-card). 보일지 말지는 아래 CSS(.mobile-cards)가 결정. PC에서는 숨김. */}
                <div className="mobile-cards" style={{
                opacity: fadeVisible ? 1 : 0, transition: "opacity 0.28s ease" }}>
                  {/* framer-motion 카드(아래 motion.div):
                      layout="position" = 위치(좌표)만 애니메이션 — 높이/크기 변화는 기존 CSS에 맡김
                      layoutDependency={results} = 목록(검색·폴링)이 바뀔 때만 동작 (댓글 열기/호버 등엔 미동작)
                      key={row.pageId} = 재정렬돼도 같은 카드로 인식 → 옛 위치에서 새 위치로 부드럽게 이동 */}
                  {results.map((row, i) => (
                    <motion.div className="m-card"
                      layout="position"
                      layoutDependency={results}
                      key={row.pageId || i}
                        ref={el => mobileCardRefs.current[i] = el}
                        style={{ background: dark ? (i%2===0?"#1e293b":"#172035") : (i%2===0?"#fff":"#f7f8ff") }}>
                        {/* 제목 행 */}
                        <div className="m-card-top">
                          <span className="m-card-icon">📄</span>
                          <span className="m-card-title" onClick={e=>handleTitleClick(e,row.url)} style={notionTextStyle(row.titleStyle,dark)}>{renderSingleLine(row.title)}</span>
                          <span onClick={e=>{e.stopPropagation();toggleUploadPanel(row.pageId)}}
                            title="파일 업로드"
                            style={{cursor:"pointer",flexShrink:0,display:"inline-flex",alignItems:"center",marginLeft:4,opacity:uploadPanels[row.pageId]?.open?1:0.45}}>
                            <span style={{display:"inline-flex",flexDirection:"column",alignItems:"center",lineHeight:1.05}}><span style={{fontSize:20}}>📎</span><span style={{fontSize:8,marginTop:1,fontWeight:600,color:dark?"#94a3b8":"#6b7280"}}>업로드</span></span>
                          </span>
                          <span onClick={e=>{e.stopPropagation();toggleCommentPanel(i,row.pageId)}}
                            style={{cursor:"pointer",flexShrink:0,position:"relative",display:"inline-flex",
                              alignItems:"center",marginLeft:4,
                              opacity:commentPanels[row.pageId]?.comments?.length>0?1:0.2}}>
                            <span style={{display:"inline-flex",flexDirection:"column",alignItems:"center",lineHeight:1.05}}><span style={{fontSize:20}}>💬</span><span style={{fontSize:8,marginTop:1,fontWeight:600,color:dark?"#94a3b8":"#6b7280"}}>댓글</span></span>
                            {commentPanels[row.pageId]?.comments?.length>0&&(
                              <span style={{position:"absolute",top:-4,right:-8,background:"#ef4444",color:"#fff",
                                fontSize:9,fontWeight:800,minWidth:15,height:15,borderRadius:9999,
                                display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
                                border:"1.5px solid #fff"}}>
                                {commentPanels[row.pageId].comments.length}
                              </span>
                            )}
                          </span>
                        </div>
                        {uploadPanels[row.pageId]?.open && (
                          <CardUploadPanel pageId={row.pageId} fileLinks={(row.fileLinks||"").split("\n").filter(Boolean)} dark={dark}
                            onChange={urls=>updateRowFiles(row.pageId,urls)} onClose={()=>toggleUploadPanel(row.pageId)} />
                        )}
                        {/* 배지 행 */}
                        <div className="m-card-badges">
                          {row.statusItem&&<span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>}
                          {row.docWorkStatusItem&&<span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>}
                          {row.typeItems?.map((t,k)=><span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>)}
                        </div>
                        {/* 출원번호 / 출원인 */}
                        {(row.appNum||row.appOwner)&&(
                          <div className="m-card-info">
                            {row.appNum&&(
                              <div className="m-info-row">
                                <span className="m-info-label">📋</span>
                                <div style={{flex:1}}>
                                  {row.appNum.split("\n").map((line,li)=>{
                                    const ck=`${i}-mn-${li}`;
                                    return (
                                    <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                      <span className="m-info-item" style={lineStyle(row,ck,li,dark)}>{displayLine(line)}</span>
                                      {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                      {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                        const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                        return (<>
                                          {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                          {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                          {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                        </>);
                                      })()}
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {row.appOwner&&(
                              <div className="m-info-row">
                                <span className="m-info-label">👤</span>
                                <div style={{flex:1}}>
                                  {row.appOwner.split("\n").map((line,li)=>{
                                    const ck=`${i}-mo-${li}`;
                                    return (
                                    <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                      <span className="m-info-item" style={lineStyle(row,ck,li,dark)}>{displayLine(line)}</span>
                                      {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                      {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                        const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                        return (<>
                                          {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                          {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                          {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                        </>);
                                      })()}
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {row.agentCode&&(
                              <div className="m-info-row">
                                <span className="m-info-label">🖊️</span>
                                <div style={{flex:1}}>
                                  {row.agentCode.split("\n").map((line,li)=>{
                                    const ck=`${i}-mc-${li}`;
                                    return (
                                    <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                      <span className="m-info-item" style={lineStyle(row,ck,li,dark)}>{displayLine(line)}</span>
                                      {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                      {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                        const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                        return (<>
                                          {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                          {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                          {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                        </>);
                                      })()}
                                    </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {/* 파일 - 팝업 포함 */}
                        {row.fileLinks&&(()=>{
                          const mFiles = row.fileLinks.split("\n").filter(Boolean);
                          const mLimit = 1;
                          const mExpanded = !!expandedRows[`m_${i}`];
                          const mShow = mExpanded ? mFiles : mFiles.slice(0, mLimit);
                          return (
                            <div className="m-card-files">
                              {mFiles.slice(0, mLimit).map((link, j) => {
                                const fn = decodeURIComponent(link.split("/").pop());
                                const mpk = `m_${i}_${j}`;
                                const isOpen = filePopup === mpk;
                                return (
                                  <div key={j} style={{ position:"relative" }}>
                                    <span className={`m-file-link${isOpen?" active":""}`}
                                      style={{ cursor:"pointer", userSelect:"none", display:"inline-block" }}
                                      onMouseDown={e => {
                                        e.stopPropagation();
                                        if (isOpen) { setFilePopup(null); return; }
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = Math.min(e.clientX, window.innerWidth - 160);
                                        const y = rect.bottom + 4;
                                        setPopupPos({ x, y });
                                        setFilePopup(mpk);
                                      }}>
                                      📄 {fn} ▾
                                    </span>
                                  </div>
                                );
                              })}
                              {mFiles.length > mLimit && (
                                <>
                                  <div style={{ overflow:"hidden",
                                    maxHeight: mExpanded ? `${(mFiles.length - mLimit) * 44}px` : "0px",
                                    opacity: mExpanded ? 1 : 0,
                                    transition: "max-height 0.55s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease" }}>
                                    {mFiles.slice(mLimit).map((link, j) => {
                                      const fn = decodeURIComponent(link.split("/").pop());
                                      const mpk = `m_${i}_${j+mLimit}`;
                                      const isOpen = filePopup === mpk;
                                      return (
                                        <div key={j} style={{ paddingTop:4 }}>
                                          <span className={`m-file-link${isOpen?" active":""}`}
                                            style={{ cursor:"pointer", userSelect:"none", display:"inline-block" }}
                                            onMouseDown={e => {
                                              e.stopPropagation();
                                              if (isOpen) { setFilePopup(null); return; }
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              const x = Math.min(e.clientX, window.innerWidth - 160);
                                              const y = rect.bottom + 4;
                                              setPopupPos({ x, y });
                                              setFilePopup(mpk);
                                            }}>
                                            📄 {fn} ▾
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <button className="expand-btn"
                                    style={{ marginTop:4, transition:"all 0.3s ease" }}
                                    onClick={e => { e.stopPropagation(); setExpandedRows(p => ({ ...p, [`m_${i}`]: !p[`m_${i}`] })); }}>
                                    {mExpanded ? "↑ 접기" : `+${mFiles.length - mLimit} 파일더보기`}
                                  </button>
                                </>
                              )}
                            </div>
                          );
                        })()}
                        {/* 댓글 패널 */}
                        {(() => {
                          const panel = commentPanels[row.pageId] || {};
                          const isOpen = panel.open && !panel.closing;
                          const isClosing = panel.closing;
                          return (
                            <div style={{ overflow:"hidden",
                              maxHeight:(isOpen||isClosing)?(isClosing?"0px":"600px"):"0px",
                              opacity:isOpen?1:0,
                              transition:"max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
                              marginTop: isOpen?"10px":0 }}>
                              <div style={{ borderTop:dark?"1px solid #334155":"1px solid #c7d2fe", paddingTop:10,
                                display:"flex", flexDirection:"column", gap:8,
                                maxHeight:380, overflow:"hidden" }}>
                                {panel.loading?(
                                  <div style={{fontSize:12,color:"#94a3b8"}}>불러오는 중...</div>
                                ):panel.comments?.length>0?(
                                  <div style={{display:"flex",flexDirection:"column",gap:6,
                                    flex:1, minHeight:0, overflowY:"auto",
                                    marginBottom:8,
                                    opacity:panel.commentsVisible?1:0,transition:"opacity 0.3s ease"}}>
                                    {panel.comments.map((c,ci)=>(
                                      <div key={ci} style={{background:dark?"#1e293b":"#fff",borderRadius:8,
                                        padding:"8px 10px",border:dark?"1px solid #334155":"1px solid #e0e7ff"}}>
                                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                                          <div style={{display:"flex",flexDirection:"column",gap:1}}>
                                            <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",fontWeight:600}}>[{c.nickname}] {c.createdAt}</span>
                                            {c.edited&&<span style={{fontSize:10,color:dark?"#6b7280":"#9ca3af"}}>[수정됨] {c.editedAt}</span>}
                                          </div>
                                          {(c.nickname===nickname||user?.primaryEmailAddress?.emailAddress==="dlaudwp90@gmail.com")&&(
                                            <div style={{display:"flex",gap:3}}>
                                              <button onClick={()=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editingId:c.id,editInput:c.content}}))}
                                                style={{fontSize:9,fontWeight:700,background:dark?"#14532d":"#f0fdf4",color:dark?"#86efac":"#166534",
                                                  border:dark?"1px solid #166534":"1px solid #bbf7d0",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit"}}>수정</button>
                                              <button onClick={async()=>{if(!confirm("삭제?"))return;
                                                await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",pageId:row.pageId,commentId:c.id})});
                                                const r2=await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get",pageId:row.pageId})});
                                                const d2=await r2.json();
                                                setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],comments:d2.comments||[]}}));}}
                                                style={{fontSize:9,fontWeight:700,background:dark?"#450a0a":"#fff1f2",color:dark?"#f87171":"#dc2626",
                                                  border:dark?"1px solid #dc2626":"1px solid #fecaca",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit"}}>삭제</button>
                                            </div>
                                          )}
                                        </div>
                                        <div style={{fontSize:13,color:dark?"#e2e8f0":"#1f2937",whiteSpace:"pre-wrap",
                                          borderTop:dark?"1px solid #334155":"1px solid #e0e7ff",paddingTop:4,marginTop:2}}>{c.content}</div>
                                        {panel.editingId===c.id&&(
                                          <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                                            <textarea value={panel.editInput||""} rows={2}
                                              onChange={e=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editInput:e.target.value}}))}
                                              style={{width:"100%",fontSize:12,border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                                borderRadius:6,padding:"6px 8px",outline:"none",fontFamily:"inherit",
                                                background:dark?"#0f172a":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                            <div style={{display:"flex",gap:4}}>
                                              <button onClick={()=>handleEditComment(i,row.pageId,c.id)}
                                                style={{fontSize:11,fontWeight:700,padding:"4px 10px",background:"#13274F",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>수정완료</button>
                                              <button onClick={()=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editingId:null}}))}
                                                style={{fontSize:11,padding:"4px 10px",background:"none",border:dark?"1px solid #334155":"1px solid #e5e7eb",borderRadius:6,cursor:"pointer",color:dark?"#94a3b8":"#6b7280",fontFamily:"inherit"}}>취소</button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ):(
                                  <div style={{fontSize:12,color:"#94a3b8"}}>댓글이 없습니다.</div>
                                )}
                                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                  <textarea value={panel.input||""} rows={2} placeholder="댓글 입력"
                                  enterKeyHint="enter"
                                  onKeyDown={e => { if(e.key==="Enter") e.stopPropagation(); }}
                                    onChange={e=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],input:e.target.value}}))}
                                    style={{width:"100%",fontSize:13,border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                      borderRadius:8,padding:"8px 10px",outline:"none",fontFamily:"inherit",
                                      background:dark?"#1e293b":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <button type="button" onClick={()=>{if(!panel.saving)handlePostComment(i,row.pageId);}} disabled={panel.saving}
                                      style={{padding:"6px 16px",background:"#13274F",color:"#fff",border:"none",borderRadius:8,
                                        fontSize:13,fontWeight:700,cursor:panel.saving?"not-allowed":"pointer",fontFamily:"inherit"}}>
                                      {panel.saving?"저장 중...":"등록"}
                                    </button>
                                    {panel.saved&&<span style={{fontSize:11,color:"#16a34a",fontWeight:700}}>✓ 저장됐습니다</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </motion.div>
                  ))}
                </div>

                {/* ── PC·태블릿(769px 이상) 기본 뷰 = 카드 그리드 ──
                    항상 렌더링하고, 보일지 말지는 아래 CSS(.pc-cards)가 화면 폭으로 결정함.
                    모바일에서는 .pc-cards 가 display:none 으로 숨겨짐. */}
              {(
                <div className="pc-cards" style={{
                  opacity: fadeVisible ? 1 : 0, transition: "opacity 0.28s ease" }}>
                  {/* framer-motion 카드(PC): 위치만 애니메이션 + 목록 바뀔 때만 동작 (모바일과 동일) */}
                  {results.map((row, i) => (
                    <motion.div layout="position" layoutDependency={results} key={row.pageId || i}
                      ref={el => pcCardRefs.current[i] = el}
                      style={{ background:dark?"#1e293b":"#fff",
                      border:dark?"1px solid #334155":"1px solid #e5e9f5",
                      borderRadius:14, padding:"14px 16px",
                      boxShadow:"0 2px 10px rgba(19,39,79,0.07)",
                      display:"flex", flexDirection:"column", gap:8 }}>
                      {/* Row1: 타입배지 + 말풍선 */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight:22 }}>
                        <div style={{display:"flex",flexWrap:"wrap",gap:3,flex:1}}>
                          {row.typeItems?.map((t,k)=><span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>)}
                        </div>
                        {/* 말풍선 - 표뷰와 동일 스타일 */}
                        <span onClick={e=>{e.stopPropagation();toggleUploadPanel(row.pageId)}}
                          title="파일 업로드"
                          style={{cursor:"pointer",flexShrink:0,display:"inline-flex",alignItems:"center",marginLeft:6,opacity:uploadPanels[row.pageId]?.open?1:0.45}}>
                          <span style={{display:"inline-flex",flexDirection:"column",alignItems:"center",lineHeight:1.05}}><span style={{fontSize:26}}>📎</span><span style={{fontSize:9,marginTop:1,fontWeight:600,color:dark?"#94a3b8":"#6b7280"}}>업로드</span></span>
                        </span>
                        <span onClick={e=>{e.stopPropagation();toggleCommentPanel(i,row.pageId)}}
                          style={{ cursor:"pointer", flexShrink:0, position:"relative",
                            display:"inline-flex", alignItems:"center", marginLeft:6,
                            opacity: commentPanels[row.pageId]?.comments?.length>0 ? 1 : 0.2,
                            transition:"opacity 0.15s" }}
                          title={commentPanels[row.pageId]?.comments?.length>0?"댓글 보기":"댓글 달기"}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
                          onMouseLeave={e=>e.currentTarget.style.opacity=commentPanels[row.pageId]?.comments?.length>0?"1":"0.2"}>
                          <span style={{display:"inline-flex",flexDirection:"column",alignItems:"center",lineHeight:1.05}}><span style={{fontSize:26}}>💬</span><span style={{fontSize:9,marginTop:1,fontWeight:600,color:dark?"#94a3b8":"#6b7280"}}>댓글</span></span>
                          {commentPanels[row.pageId]?.comments?.length>0&&(
                            <span style={{ position:"absolute", top:-6, right:-10,
                              background:"#ef4444", color:"#fff", fontSize:10, fontWeight:800,
                              minWidth:17, height:17, borderRadius:9999,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              padding:"0 4px", boxShadow:"0 1px 4px rgba(0,0,0,0.25)",
                              lineHeight:1, border:"1.5px solid #fff" }}>
                              {commentPanels[row.pageId].comments.length}
                            </span>
                          )}
                        </span>
                      </div>
                      {uploadPanels[row.pageId]?.open && (
                        <CardUploadPanel pageId={row.pageId} fileLinks={(row.fileLinks||"").split("\n").filter(Boolean)} dark={dark}
                          onChange={urls=>updateRowFiles(row.pageId,urls)} onClose={()=>toggleUploadPanel(row.pageId)} />
                      )}
                      {/* Row2: 📄 제목 */}
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{fontSize:14,flexShrink:0}}>📄</span>
                        <span onClick={e=>handleTitleClick(e,row.url)}
                          style={{ fontSize:13, fontWeight:700, color:dark?"#93c5fd":"#1a3a8f",
                            cursor:"pointer", textDecoration:"underline", lineHeight:1.3,
                            ...notionTextStyle(row.titleStyle,dark) }}>
                          {renderSingleLine(row.title)}
                        </span>
                      </div>
                      {/* Row4: 상태/서류작업 배지 */}
                      {(row.statusItem||row.docWorkStatusItem)&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                          {row.statusItem&&<span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>}
                          {row.docWorkStatusItem&&<span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>}
                        </div>
                      )}
                      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                        {row.appNum&&(
                          <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                            <span style={{fontSize:11,flexShrink:0}}>📋</span>
                            <div style={{flex:1}}>
                              {row.appNum.split("\n").map((line,li)=>{
                                const ck=`${i}-pn-${li}`;
                                return (
                                <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",...lineStyle(row,ck,li,dark)}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
                                      {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                      {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                      {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                    </>);
                                  })()}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {row.appOwner&&(
                          <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                            <span style={{fontSize:11,flexShrink:0}}>👤</span>
                            <div style={{flex:1}}>
                              {row.appOwner.split("\n").map((line,li)=>{
                                const ck=`${i}-po-${li}`;
                                return (
                                <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",...lineStyle(row,ck,li,dark)}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
                                      {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                      {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                      {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                    </>);
                                  })()}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {row.agentCode&&(
                          <div style={{display:"flex",alignItems:"flex-start",gap:4}}>
                            <span style={{fontSize:11,flexShrink:0}}>🖊️</span>
                            <div style={{flex:1}}>
                              {row.agentCode.split("\n").map((line,li)=>{
                                const ck=`${i}-pc-${li}`;
                                return (
                                <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",...lineStyle(row,ck,li,dark)}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const nk = `${ck}-nm`, yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
                                      {ex.name && <button className={`m-copy-btn name${copied[nk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.name,nk)}>{copied[nk]?"✓":"이름"}</button>}
                                      {ex.year && <button className={`m-copy-btn year${copied[yk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                      {ex.partial && <button className={`m-copy-btn partial${copied[pk]?" m-copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                    </>);
                                  })()}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* PC 카드 댓글 패널 */}
                      {(() => {
                        const panel = commentPanels[row.pageId] || {};
                        const isOpen = panel.open && !panel.closing;
                        const isClosing = panel.closing;
                        return (
                          <div style={{ overflow:"hidden",
                            maxHeight:(isOpen||isClosing)?(isClosing?"0px":"600px"):"0px",
                            opacity:isOpen?1:0,
                            transition:"max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
                            marginTop:isOpen?"8px":0 }}>
                            <div style={{ borderTop:dark?"1px solid #334155":"1px solid #c7d2fe", paddingTop:8,
                              display:"flex", flexDirection:"column", gap:8,
                              maxHeight:300, overflow:"hidden" }}>
                              {panel.loading?(
                                <div style={{fontSize:12,color:"#94a3b8"}}>불러오는 중...</div>
                              ):panel.comments?.length>0?(
                                <div className="comment-scroll" style={{display:"flex",flexDirection:"column",gap:6,
                                  flex:1, minHeight:0, overflowY:"auto", marginBottom:8,
                                  scrollbarWidth:"thin", scrollbarColor:dark?"#475569 #1e293b":"#94a3b8 #eef2ff",
                                  opacity:panel.commentsVisible?1:0, transition:"opacity 0.3s ease"}}>
                                  {panel.comments.map((c,ci)=>(
                                    <div key={ci} style={{background:dark?"#1e293b":"#fff",borderRadius:8,
                                      padding:"8px 10px",border:dark?"1px solid #334155":"1px solid #e0e7ff"}}>
                                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                                        <div style={{display:"flex",flexDirection:"column",gap:1}}>
                                          <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",fontWeight:600}}>[{c.nickname}] {c.createdAt}</span>
                                          {c.edited&&<span style={{fontSize:10,color:dark?"#6b7280":"#9ca3af"}}>[수정됨] {c.editedAt}</span>}
                                        </div>
                                        {(c.nickname===nickname||user?.primaryEmailAddress?.emailAddress==="dlaudwp90@gmail.com")&&(
                                          <div style={{display:"flex",gap:3}}>
                                            <button type="button"
                                              onClick={e=>{e.stopPropagation();setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editingId:prev[row.pageId]?.editingId===c.id?null:c.id,editInput:c.content}}));}}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#14532d":"#f0fdf4",color:dark?"#86efac":"#166534",border:"1px solid #bbf7d0",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>수정</button>
                                            <button type="button"
                                              onClick={async e=>{e.stopPropagation();if(!confirm("댓글을 삭제하시겠습니까?"))return;
                                              await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",pageId:row.pageId,commentId:c.id})});
                                              const r2=await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get",pageId:row.pageId})});
                                              const d2=await r2.json();
                                              setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],comments:d2.comments||[]}}));}}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#450a0a":"#fff1f2",color:dark?"#f87171":"#dc2626",border:"1px solid #fecaca",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>삭제</button>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{fontSize:13,color:dark?"#e2e8f0":"#1f2937",whiteSpace:"pre-wrap"}}>{c.content}</div>
                                      {panel.editingId===c.id&&(
                                        <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                                          <textarea value={panel.editInput||""} rows={2}
                                            onKeyDown={e=>{if(e.key==="Enter")e.stopPropagation();}}
                                            onChange={e=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editInput:e.target.value}}))}
                                            style={{width:"100%",fontSize:12,border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                              borderRadius:6,padding:"6px 8px",outline:"none",fontFamily:"inherit",
                                              background:dark?"#0f172a":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                          <div style={{display:"flex",gap:4}}>
                                            <button type="button"
                                              onClick={e=>{e.stopPropagation();handleEditComment(i,row.pageId,c.id);}}
                                              style={{fontSize:11,fontWeight:700,padding:"4px 10px",background:"#13274F",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>수정완료</button>
                                            <button type="button"
                                              onClick={e=>{e.stopPropagation();setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],editingId:null}}));}}
                                              style={{fontSize:11,padding:"4px 10px",background:"none",border:dark?"1px solid #334155":"1px solid #e5e7eb",borderRadius:6,cursor:"pointer",color:dark?"#94a3b8":"#6b7280",fontFamily:"inherit",position:"relative",zIndex:10}}>취소</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ):(
                                <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>댓글이 없습니다.</div>
                              )}
                              <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                                <textarea value={panel.input||""} rows={2} placeholder="댓글 입력"
                                  enterKeyHint="enter"
                                  onKeyDown={e=>{if(e.key==="Enter")e.stopPropagation();}}
                                  onChange={e=>setCommentPanels(prev=>({...prev,[row.pageId]:{...prev[row.pageId],input:e.target.value}}))}
                                  style={{width:"100%",fontSize:12,border:"1.5px solid #c7d2fe",borderRadius:8,
                                    padding:"6px 8px",outline:"none",fontFamily:"inherit",
                                    background:dark?"#1e293b":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <button type="button" onClick={()=>{if(!panel.saving)handlePostComment(i,row.pageId);}} disabled={panel.saving}
                                    style={{padding:"5px 14px",background:"#13274F",color:"#fff",border:"none",borderRadius:8,
                                      fontSize:12,fontWeight:700,cursor:panel.saving?"not-allowed":"pointer",fontFamily:"inherit"}}>
                                    {panel.saving?"저장 중...":"등록"}
                                  </button>
                                  {panel.saved&&<span style={{fontSize:11,color:"#16a34a",fontWeight:700}}>✓ 저장됐습니다</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {row.fileLinks&&(()=>{
                        const pcFiles = row.fileLinks.split("\n").filter(Boolean);
                        const pcLimit = 1;
                        const pcKey = `pc_${i}`;
                        const pcExpanded = !!expandedRows[pcKey];
                        return (
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            {pcFiles.slice(0,pcLimit).map((link,j)=>{
                              const fn=decodeURIComponent(link.split("/").pop());
                              const mpk=`pc_${i}_${j}`;
                              const isOpen=filePopup===mpk;
                              return (
                                <span key={j} className={`m-file-link${isOpen?" active":""}`}
                                  style={{cursor:"pointer",userSelect:"none",display:"inline-block",fontSize:11}}
                                  onMouseDown={e=>{
                                    e.stopPropagation();
                                    if(isOpen){setFilePopup(null);return;}
                                    const rect=e.currentTarget.getBoundingClientRect();
                                    const x=Math.min(e.clientX,window.innerWidth-160);
                                    const y=rect.bottom+4;
                                    setPopupPos({x,y});
                                    setFilePopup(mpk);
                                  }}>📄 {fn} ▾</span>
                              );
                            })}
                            {pcFiles.length>pcLimit&&(
                              <>
                                <div style={{overflow:"hidden",
                                  maxHeight:pcExpanded?`${(pcFiles.length-pcLimit)*28}px`:"0px",
                                  opacity:pcExpanded?1:0,
                                  transition:"max-height 0.55s cubic-bezier(0.4,0,0.2,1),opacity 0.4s ease"}}>
                                  {pcFiles.slice(pcLimit).map((link,j)=>{
                                    const fn=decodeURIComponent(link.split("/").pop());
                                    const mpk=`pc_${i}_${j+pcLimit}`;
                                    const isOpen=filePopup===mpk;
                                    return (
                                      <span key={j} className={`m-file-link${isOpen?" active":""}`}
                                        style={{cursor:"pointer",userSelect:"none",display:"inline-block",fontSize:11,marginTop:3}}
                                        onMouseDown={e=>{
                                          e.stopPropagation();
                                          if(isOpen){setFilePopup(null);return;}
                                          const rect=e.currentTarget.getBoundingClientRect();
                                          const x=Math.min(e.clientX,window.innerWidth-160);
                                          const y=rect.bottom+4;
                                          setPopupPos({x,y});
                                          setFilePopup(mpk);
                                        }}>📄 {fn} ▾</span>
                                    );
                                  })}
                                </div>
                                <button className="expand-btn"
                                  style={{marginTop:2,fontSize:10,padding:"2px 6px",transition:"all 0.3s ease"}}
                                  onClick={e=>{e.stopPropagation();setExpandedRows(p=>({...p,[pcKey]:!p[pcKey]}));}}>
                                  {pcExpanded?"↑ 접기":`+${pcFiles.length-pcLimit} 파일더보기`}
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </motion.div>
                  ))}
                </div>
              )}


                <div className="notion-db-wrap">
                  <button className="notion-db-btn"
                    onClick={()=>window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a","_blank")}>
                    📋 G&A IP 문서 DB 전체 보기 (Notion)
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {popup && (
        <div className="overlay" onClick={()=>setPopup(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <p className="modal-icon">📄</p>
            <p className="modal-title">노션에서 보시겠습니까?</p>
            <p className="modal-sub">Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div className="modal-btns">
              <button className="modal-btn primary"   onClick={openInNotion}>예 — Notion 앱으로 열기</button>
              <button className="modal-btn secondary" onClick={openInBrowser}>브라우저로 열기</button>
              <button className="modal-btn cancel"    onClick={()=>setPopup(null)}>아니오</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Noto Sans KR','Malgun Gothic',sans-serif; min-height:100vh; }
        @keyframes slideUpFade { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes commentFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes pollToastIn { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .comment-scroll::-webkit-scrollbar { width: 6px; }
        .comment-scroll::-webkit-scrollbar-track { background: #eef2ff; border-radius: 4px; }
        .comment-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .comment-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
        /* ── 모바일 카드 뷰 ── */
        .mobile-cards { display:none; flex-direction:column; gap:8px; width:100%; }
        .m-card { border-radius:12px; padding:12px 14px; border:1px solid #e5e9f5;
          box-shadow:0 1px 6px rgba(19,39,79,0.07); display:flex; flex-direction:column; gap:6px; }
        .dark .m-card { border-color:#334155; }
        .m-card-top { display:flex; align-items:center; gap:6px; }
        .m-card-icon { font-size:14px; flex-shrink:0; }
        .m-card-title { color:#1a3a8f; font-weight:700; font-size:14px; cursor:pointer;
          text-decoration:underline; flex:1; line-height:1.3; }
        .dark .m-card-title { color:#93c5fd; }
        .m-card-badges { display:flex; flex-wrap:wrap; gap:4px; }
        .m-card-info { display:flex; flex-direction:column; gap:2px; }
        .m-info-item { font-size:12px; color:#6b7280; }
        .m-info-row { display:flex; align-items:flex-start; gap:6px; }
        .m-info-label { font-size:14px; flex-shrink:0; margin-top:1px; }
        .m-copy-btn { background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:0 1.5px; font-size:8px; font-weight:700; cursor:pointer;
          font-family:inherit; flex-shrink:0; min-width:14px; height:19px;
          letter-spacing:-0.4px; line-height:19px;
          display:inline-flex; align-items:center; justify-content:center; }
        .dark .m-copy-btn { background:#1e3a6e; color:#93c5fd; }
        .m-copy-btn.m-copied { background:#dcfce7; color:#166634; transition:background .15s; }
        .m-copy-btn.partial { background:#ede9fe; color:#6d28d9; }
        .m-copy-btn.year { background:#fce7f3; color:#be185d; }
        .m-copy-btn.name { background:#fef9c3; color:#854d0e; }
        .m-copy-btn.name:hover { background:#fef08a; }
        .m-copy-btn.name.m-copied { background:#dcfce7; color:#166634; }
        .dark .m-copy-btn.name { background:#422006; color:#fde68a; }
        .dark .m-copy-btn.name.m-copied { background:#14532d; color:#86efac; }
        .m-copy-btn.year:hover { background:#fbcfe8; }
        .m-copy-btn.year.m-copied { background:#dcfce7; color:#166634; }
        .dark .m-copy-btn.year { background:#500724; color:#f9a8d4; }
        .dark .m-copy-btn.year.m-copied { background:#14532d; color:#86efac; }
        .m-copy-btn.partial:hover { background:#ddd6fe; }
        .m-copy-btn.partial.m-copied { background:#dcfce7; color:#166634; }
        .dark .m-copy-btn.partial { background:#3b0764; color:#c4b5fd; }
        .dark .m-copy-btn.partial.m-copied { background:#14532d; color:#86efac; }
        .dark .m-copy-btn.m-copied { background:#14532d; color:#86efac; }
        .dark .m-info-item { color:#94a3b8; }
        .m-card-files { display:flex; flex-direction:column; gap:3px; }
        .m-file-link { font-size:12px; color:#1a3a8f; background:#eef1fb; border-radius:5px;
          padding:3px 8px; text-decoration:none; display:inline-block; }
        .dark .m-file-link { background:#1e3a6e; color:#93c5fd; }
        /* ── [중요] 기기별 단일 뷰 규칙 ──
           모바일(<=768px) = 카드형 목록(.mobile-cards)만,  PC·태블릿(>=769px) = 카드 그리드(.pc-cards)만.
           이 미디어쿼리가 "어떤 뷰가 보이는가"의 단일 기준입니다. 함부로 바꾸지 말 것. */
        /* PC·태블릿(769px 이상): 카드 그리드만 표시 */
        @media (min-width: 769px) {
          .pc-cards     { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
          .mobile-cards { display:none; }
        }
        /* 모바일(768px 이하): 카드형 목록만 표시 */
        @media (max-width: 768px) {
          .pc-cards     { display:none; }
          .mobile-cards { display:flex; }
          .count-btns   { flex-wrap:wrap; }
        }
        @keyframes spin { to{transform:rotate(360deg)} }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box; animation:slideUpFade .7s ease both; }
        .dark .comment-scroll::-webkit-scrollbar-track { background: #1e293b; }
        .dark .comment-scroll::-webkit-scrollbar-thumb { background: #475569; }
        .dark .comment-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }

        .theme-toggle { position:absolute; top:20px; right:20px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .theme-toggle { border-color:#475569; }
        .upload-btn { position:absolute; top:20px; right:70px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .upload-btn { border-color:#475569; }
        
        .user-icon-btn { background:none; border:2px solid #d0d9f0; border-radius:50%;
          width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .user-icon-btn:hover { background:#f1f5f9; }
        .dark .user-icon-btn { border-color:#475569; }
        .dark .user-icon-btn:hover { background:#1e293b; }

        .logo-area { margin-top:10vh; margin-bottom:32px; text-align:center; transition:margin .3s; }
        .searched .logo-area { margin-top:24px; margin-bottom:16px; }
        .searched .logo-area:hover .logo-hint { opacity:1; }
        .logo-wrap { display:inline-block; text-align:center; }
        .logo-top-rule { width:520px; height:1px; background:#13274F; margin:0 auto 18px; }
        .logo-main { font-family:'EB Garamond',serif; font-size:56px; font-weight:700; color:#13274F; letter-spacing:-0.5px; line-height:1.1; margin:0; }
        .dark .logo-main { color:#e2e8f0; }
        .logo-sub-en { font-size:13px; color:#13274F; letter-spacing:6px; margin:10px 0 14px; text-transform:uppercase; }
        .dark .logo-sub-en { color:#94a3b8; }
        .logo-mid-rule { width:300px; height:1px; background:#13274F; margin:0 auto 14px; }
        .dark .logo-mid-rule { background:#475569; }
        .logo-sub-kr { font-family:'Noto Serif KR',serif; font-size:26px; font-weight:700; color:#13274F; letter-spacing:2px; margin:0 0 14px; }
        .dark .logo-sub-kr { color:#e2e8f0; }
        .logo-bot-rule { width:520px; height:1px; background:#13274F; margin:0 auto; }
        .dark .logo-top-rule,.dark .logo-mid-rule,.dark .logo-bot-rule { background:#475569; }
        .logo-hint { font-size:11px; color:#94a3b8; margin-top:6px; opacity:0; transition:opacity .2s; }
        .subtitle  { color:#6b7280; font-size:13px; margin-top:12px; letter-spacing:3px; text-transform:uppercase; }
        .searched .logo-main { font-size:30px; }
        .searched .logo-sub-en { font-size:10px; letter-spacing:4px; margin:6px 0 8px; }
        .searched .logo-sub-kr { font-size:15px; margin-bottom:8px; }
        .searched .logo-top-rule,.searched .logo-bot-rule { width:300px; }
        .searched .logo-mid-rule { width:170px; }

        .search-wrap { width:100%; max-width:600px; margin-bottom:24px; transition:max-width .3s; }
        .searched .search-wrap { max-width:100%; }
        .search-box { display:flex; align-items:center; background:#f8faff; border:1.5px solid #cbd5e1;
          border-radius:10px; padding:6px 6px 6px 16px; box-shadow:0 2px 12px rgba(19,39,79,0.08); gap:8px; }
        .dark .search-box { background:#1e293b; border-color:#334155; }
        .icon { font-size:17px; flex-shrink:0; }
        input { flex:1; border:none; outline:none; font-size:16px; color:#1f2937; background:transparent; font-family:inherit; min-width:0; }
        .dark input { color:#e2e8f0; }
        .clear-btn  { background:none; border:none; cursor:pointer; color:#9ca3af; font-size:15px; padding:0 2px; flex-shrink:0; }
        .search-btn { background:#13274F; color:#fff; border:none; border-radius:8px; padding:9px 18px;
          font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; }
        .search-btn:hover { background:#0d1e3d; }

        .results { width:100%; max-width:1300px; padding-bottom:60px; }
        .loading  { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner  { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f; border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error    { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon  { font-size:48px; } .no-text { font-size:18px; font-weight:600; margin-top:12px; }
        .no-sub   { color:#9ca3af; font-size:14px; margin-top:6px; }

        .count-row  { display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:12px; gap:10px; flex-wrap:wrap; }
        .count      { color:#6b7280; font-size:13px; margin-bottom:0; }
        /* 왼쪽 텍스트 세로 스택 */
        .count-left-stack { display:flex; flex-direction:column; gap:3px; }
        /* 잠금 해제 안내 */
        .recent-hint { font-style:italic; text-decoration:underline; color:#16a34a; font-size:12px; }
        .dark .recent-hint { color:#4ade80; }
        .count-btns { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .nav-btn    { border:none; border-radius:8px; padding:7px 14px; font-size:12px; font-weight:700;
          cursor:pointer; font-family:inherit; white-space:nowrap; transition:background .15s; }
        .nav-btn-all   { background:#1a3a8f; color:#fff; }
        .nav-btn-all:hover   { background:#0d1e3d; }
        .dark .nav-btn-all   { background:#1e3a6e; }
        .nav-btn-guide { background:#13274F; color:#fff; }
        .nav-btn-guide:hover { background:#0d1e3d; }
        .dark .nav-btn-guide { background:#1e3a6e; }


        .cell-inner { display:flex; align-items:center; justify-content:center; gap:6px; }
        .doc-icon   { font-size:14px; flex-shrink:0; }
        .doc-title  { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:0.75; }
        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .dash  { color:#d1d5db; }

        .file-expand-wrap { display:flex; width:100%; align-items:flex-start; justify-content:space-between; gap:8px; }
        .expand-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:2px 6px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; white-space:nowrap; }
        .expand-btn:hover { background:#d0d9f0; }
        .expand-btn.expanded { background:#e0f2fe; color:#0369a1; }
        .dark .expand-btn { background:#1e3a6e; color:#93c5fd; }
        .copy-wrap  { display:inline-flex; align-items:flex-start; gap:6px; }
        .cell-text  { font-size:12px; color:#6b7280; white-space:nowrap; }
        .dark .cell-text { color:#94a3b8; }
        .indent-block { display:flex; flex-direction:column; gap:3px; text-align:left; }
        .first-line,.indent-line { font-size:12px; color:#6b7280; white-space:nowrap; }
        .indent-line { padding-left:16px; }
        .dark .first-line,.dark .indent-line { color:#94a3b8; }
        .copy-btn   { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:0 1.5px; font-size:8px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s;
          min-width:14px; height:19px; letter-spacing:-0.4px; line-height:19px;
          display:inline-flex; align-items:center; justify-content:center; }
        .copy-btn:hover { background:#d0d9f0; }
        .copy-btn.copied { background:#dcfce7; color:#166634; }
        .copy-btn.partial { background:#ede9fe; color:#6d28d9; }
        .copy-btn.year { background:#fce7f3; color:#be185d; }
        .copy-btn.name { background:#fef9c3; color:#854d0e; }
        .copy-btn.name:hover { background:#fef08a; }
        .copy-btn.name.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn.name { background:#422006; color:#fde68a; }
        .dark .copy-btn.name.copied { background:#14532d; color:#86efac; }
        .copy-btn.year:hover { background:#fbcfe8; }
        .copy-btn.year.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn.year { background:#500724; color:#f9a8d4; }
        .dark .copy-btn.year.copied { background:#14532d; color:#86efac; }
        .copy-btn.partial:hover { background:#ddd6fe; }
        .copy-btn.partial.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn.partial { background:#3b0764; color:#c4b5fd; }
        .dark .copy-btn.partial.copied { background:#14532d; color:#86efac; }
        .dark .copy-btn { background:#1e3a6e; color:#93c5fd; }
        .dark .copy-btn.copied { background:#14532d; color:#86efac; }
        .file-links { display:flex; flex-direction:column; gap:4px; }
        .file-link-wrap { position:relative; display:inline-block; }
        .file-link  { font-size:12px; color:#1a3a8f; padding:3px 8px; background:#eef1fb; border-radius:5px;
          white-space:nowrap; display:inline-block; cursor:pointer; user-select:none; transition:background .15s; }
        .file-link:hover,.file-link.active { background:#d0d9f0; }
        .dark .file-link { background:#1e3a6e; color:#93c5fd; }
        .dark .file-link:hover,.dark .file-link.active { background:#2a4a8e; }

        .notion-db-wrap { text-align:center; margin-top:24px; padding-bottom:20px; }
        .notion-db-btn  { background:#fff; color:#1e3a8a; border:2px solid #c7d2fe; border-radius:28px;
          padding:12px 28px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;
          box-shadow:0 2px 10px rgba(99,102,241,0.12); transition:all .2s; }
        .notion-db-btn:hover { background:#eef2ff; border-color:#4f46e5; }
        .dark .notion-db-btn { background:#1e293b; color:#818cf8; border-color:#334155; }

        .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:999; }
        .modal   { background:#fff; border-radius:20px; padding:32px 36px; max-width:360px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.25); text-align:center; }
        .dark .modal { background:#1e293b; color:#e2e8f0; }
        .modal-icon  { font-size:40px; margin-bottom:12px; }
        .modal-title { font-size:18px; font-weight:800; margin-bottom:6px; }
        .modal-sub   { font-size:13px; color:#6b7280; margin-bottom:24px; }
        .modal-btns  { display:flex; flex-direction:column; gap:10px; }
        .modal-btn   { border:none; border-radius:12px; padding:13px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
        .modal-btn:hover { opacity:0.82; }
        .modal-btn.primary   { background:#1a3a8f; color:#fff; }
        .modal-btn.secondary { background:#eef1fb; color:#1a3a8f; }
        .modal-btn.cancel    { background:#f3f4f6; color:#6b7280; }
        .dark .modal-btn.secondary { background:#1e3a6e; color:#93c5fd; }
        .dark .modal-btn.cancel    { background:#334155; color:#94a3b8; }

        @media (max-width:480px) {
          .logo-main { font-size:36px; }
          .logo-top-rule,.logo-bot-rule { width:300px; }
          .logo-sub-kr { font-size:18px; }
          .logo-sub-en { font-size:11px; letter-spacing:4px; }
          .searched .logo-main { font-size:22px; }
          .searched .logo-top-rule,.searched .logo-bot-rule { width:200px; }
          .search-btn { padding:9px 14px; font-size:13px; }
          input { font-size:16px; }
        }
      `}</style>
    </>
  );
}
