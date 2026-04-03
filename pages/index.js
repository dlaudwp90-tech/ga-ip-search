import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// ─── 상태 옵션 (추후 항목 추가 가능) ───────────────────────────────────────
// 새 항목 추가: 이 배열에 객체 하나만 추가하면 UI에 자동 반영
const STATUS_OPTIONS = [
  { key: "confirmed",  label: "대표확인", color: "#16a34a", bg: "#f0fdf4", darkColor: "#4ade80", darkBg: "#14532d" },
  { key: "rejected",   label: "대표반려", color: "#dc2626", bg: "#fff1f2", darkColor: "#f87171", darkBg: "#450a0a" },
  { key: "reviewing",  label: "대표검토", color: "#d97706", bg: "#fffbeb", darkColor: "#fbbf24", darkBg: "#451a03" },
  // 예시) { key: "pending", label: "검토대기", color: "#7c3aed", bg: "#f5f3ff", darkColor: "#c4b5fd", darkBg: "#3b0764" },
];

const LOCK_SECONDS = 600; // 자동 잠금: 10분

function fmtCountdown(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────
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
  default: { bg:"#e5e7eb",text:"#374151",darkBg:"#374151",darkText:"#d1d5db" },
  gray:    { bg:"#f3f4f6",text:"#4b5563",darkBg:"#374151",darkText:"#d1d5db" },
  brown:   { bg:"#f5e6d8",text:"#7c3f1e",darkBg:"#3b1506",darkText:"#e2b48a" },
  orange:  { bg:"#ffedd5",text:"#9a3412",darkBg:"#431407",darkText:"#fdba74" },
  yellow:  { bg:"#fef9c3",text:"#854d0e",darkBg:"#422006",darkText:"#fde68a" },
  green:   { bg:"#dcfce7",text:"#166534",darkBg:"#14532d",darkText:"#86efac" },
  blue:    { bg:"#dbeafe",text:"#1e40af",darkBg:"#1e3a6e",darkText:"#93c5fd" },
  purple:  { bg:"#ede9fe",text:"#5b21b6",darkBg:"#3b0764",darkText:"#c4b5fd" },
  pink:    { bg:"#fce7f3",text:"#9d174d",darkBg:"#500724",darkText:"#f9a8d4" },
  red:     { bg:"#fee2e2",text:"#991b1b",darkBg:"#450a0a",darkText:"#fca5a5" },
};

function notionBadgeStyle(color, dark) {
  const c = NOTION_COLOR[color] || NOTION_COLOR.default;
  return dark ? { background: c.darkBg, color: c.darkText } : { background: c.bg, color: c.text };
}

// ─── 상태 열 헤더 ────────────────────────────────────────────────────────
function StatusHeader({ locked, countdown, kvAvailable, onToggle }) {
  return (
    <th className="th-check">
      <div className="check-header-inner">
        <button
          className={`lock-btn${locked ? " is-locked" : " is-unlocked"}`}
          onClick={onToggle}
          title={locked
            ? "클릭하여 잠금 해제 (10분 후 자동 잠금)"
            : `잠금 해제 중 — ${fmtCountdown(countdown)} 후 자동 잠금`}
        >
          {locked ? "🔒" : "🔓"}
        </button>
        {!locked && countdown > 0 && (
          <span className="lock-cd">{fmtCountdown(countdown)}</span>
        )}
        <span className="check-col-title">대표 검토</span>
        {!kvAvailable && (
          <span className="kv-warn" title="Vercel KV 미설정 — 상태가 저장되지 않습니다">⚠</span>
        )}
      </div>
    </th>
  );
}

// ─── 상태 pill 선택 셀 ──────────────────────────────────────────────────
function StatusPillCell({ url, status, locked, saving, onSelect, dark }) {
  return (
    <td className="td-check">
      <div className={`pill-stack${saving ? " pill-saving" : ""}`}>
        {STATUS_OPTIONS.map(opt => {
          const isActive = status === opt.key;
          const c  = dark ? opt.darkColor : opt.color;
          const bg = dark ? opt.darkBg   : opt.bg;
          return (
            <button
              key={opt.key}
              className={`status-pill${isActive ? " pill-active" : ""}${locked ? " pill-locked" : ""}`}
              style={{
                "--pc":  c,
                "--pbg": isActive ? bg       : "transparent",
                "--pbd": isActive ? c        : (dark ? "#334155" : "#e5e7eb"),
              }}
              onClick={() => !locked && onSelect(url, isActive ? null : opt.key)}
              disabled={locked || saving}
              title={locked ? "🔒 잠금 해제 후 선택 가능" : opt.label}
            >
              <span className="pill-dot" />
              <span className="pill-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </td>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────
export default function Home() {
  const [query,         setQuery]         = useState("");
  const [results,       setResults]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [searched,      setSearched]      = useState(false);
  const [dark,          setDark]          = useState(false);
  const [popup,         setPopup]         = useState(null);
  const [copied,        setCopied]        = useState({});
  const [filePopup,     setFilePopup]     = useState(null);
  const [popupPos,      setPopupPos]      = useState({ x: 0, y: 0 });
  const [downloading,   setDownloading]   = useState({});
  const [tableVisible,  setTableVisible]  = useState(false);
  const [isRecent,      setIsRecent]      = useState(false);
  const [expandedRows,  setExpandedRows]  = useState({});

  // ── 검토 상태 (Vercel KV 기반 크로스 디바이스) ──
  const [reviewStates,  setReviewStates]  = useState({});   // { url: "confirmed"|"rejected"|"reviewing"|null }
  const [savingUrl,     setSavingUrl]     = useState(null); // 현재 저장 중인 url
  const [kvAvailable,   setKvAvailable]   = useState(true); // KV 설정 여부
  const localFallback   = useRef({});     // KV 미설정 시 인메모리 fallback

  // ── 잠금 ──
  const [checkLocked,   setCheckLocked]   = useState(true);
  const [lockCountdown, setLockCountdown] = useState(0);
  const lockIntervalRef = useRef(null);
  const lockTimeoutRef  = useRef(null);

  const toggleRow = (idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  const inputRef      = useRef(null);
  const tableOuterRef = useRef(null);
  const filePopupRef  = useRef(null);
  const router        = useRouter();

  // ── 잠금 타이머 ──
  const startLockTimer = useCallback(() => {
    if (lockIntervalRef.current) clearInterval(lockIntervalRef.current);
    if (lockTimeoutRef.current)  clearTimeout(lockTimeoutRef.current);
    setLockCountdown(LOCK_SECONDS);
    lockIntervalRef.current = setInterval(() => {
      setLockCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    lockTimeoutRef.current = setTimeout(() => {
      setCheckLocked(true);
      clearInterval(lockIntervalRef.current);
      setLockCountdown(0);
    }, LOCK_SECONDS * 1000);
  }, []);

  const stopLockTimer = useCallback(() => {
    if (lockIntervalRef.current) clearInterval(lockIntervalRef.current);
    if (lockTimeoutRef.current)  clearTimeout(lockTimeoutRef.current);
    setLockCountdown(0);
  }, []);

  useEffect(() => () => { stopLockTimer(); }, [stopLockTimer]);

  const handleLockToggle = () => {
    if (checkLocked) { setCheckLocked(false); startLockTimer(); }
    else             { setCheckLocked(true);  stopLockTimer();  }
  };

  // ── 검토 상태 일괄 조회 ──
  const fetchReviewStates = useCallback(async (urls) => {
    if (!urls || urls.length === 0) return;
    try {
      const res  = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", urls }),
      });
      const data = await res.json();
      setKvAvailable(data.kvAvailable !== false);
      if (data.states) setReviewStates(prev => ({ ...prev, ...data.states }));
    } catch (e) {
      setKvAvailable(false);
    }
  }, []);

  // results 변경 시 검토 상태 조회
  useEffect(() => {
    if (results && results.length > 0) {
      fetchReviewStates(results.map(r => r.url));
    }
  }, [results, fetchReviewStates]);

  // ── 검토 상태 변경 ──
  const handleStatusSelect = useCallback(async (url, newStatus) => {
    if (checkLocked) return;

    // 낙관적 업데이트
    setReviewStates(prev => ({ ...prev, [url]: newStatus }));
    setSavingUrl(url);

    try {
      const res  = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", url, status: newStatus }),
      });
      const data = await res.json();
      setKvAvailable(data.kvAvailable !== false);
      if (!data.ok && !data.kvAvailable) {
        // KV 미설정 — 인메모리 저장
        localFallback.current[url] = newStatus;
      }
    } catch (e) {
      // 네트워크 실패 시 상태 유지 (낙관적 업데이트 그대로)
    } finally {
      setSavingUrl(null);
    }
    startLockTimer(); // 조작마다 타이머 리셋
  }, [checkLocked, startLockTimer]);

  // ── 최근 문서 ──
  useEffect(() => { fetchRecent(); }, []);

  const fetchRecent = async () => {
    setLoading(true); setTableVisible(false);
    try {
      const res  = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent" }),
      });
      const data = await res.json();
      if (res.ok) { setResults(data.results); setIsRecent(true); setTimeout(() => setTableVisible(true), 50); }
    } catch (e) {}
    finally { setLoading(false); }
  };

  // ── 파일 팝업 외부 클릭 ──
  useEffect(() => {
    if (!filePopup) return;
    const handle = (e) => {
      if (filePopupRef.current?.contains(e.target)) return;
      if (e.target.closest(".file-link-wrap")) return;
      if (tableOuterRef.current) {
        const rect = tableOuterRef.current.getBoundingClientRect();
        if (e.clientX > rect.right - 20 || e.clientY > rect.bottom - 20) return;
        if (e.target === tableOuterRef.current) return;
      }
      setFilePopup(null);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("touchstart", handle); };
  }, [filePopup]);

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

  const handleClear = () => {
    setQuery(""); setSearched(false); setResults(null); setError(null); setFilePopup(null);
    setTableVisible(false); setIsRecent(false); fetchRecent();
    inputRef.current?.focus();
  };

  const handleTitleClick = (e, url) => {
    e.stopPropagation(); setFilePopup(null); setPopup({ url });
  };

  const openInNotion = () => {
    if (!popup?.url) return;
    window.location.href = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    setPopup(null);
  };
  const openInBrowser = () => {
    if (!popup?.url) return;
    window.open(popup.url, "_blank"); setPopup(null);
  };

  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500);
    });
  };

  const isMultiLine = (text) => text && text.includes("\n");

  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation(); e.preventDefault();
    setDownloading(p => ({ ...p, [key]: true }));
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = {
          pdf:"application/pdf", hwpx:"application/octet-stream", hwp:"application/octet-stream",
          pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
          docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", htl:"application/octet-stream",
        };
        const fh = await window.showSaveFilePicker({ suggestedName: fileName,
          types:[{ description:"파일", accept:{ [mimeMap[ext]||"application/octet-stream"]:[`.${ext}`] } }] });
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

      {/* ── 파일 팝업 ── */}
      {filePopup && results && (() => {
        const [ri, ci] = filePopup.split("-").map(Number);
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
              background:dark?"#1e293b":"#fff",border:`1.5px solid ${dark?"#334155":"#e5e9f5"}`,
              borderRadius:10,boxShadow:"0 8px 24px rgba(19,39,79,0.18)",padding:6,
              minWidth:140,display:"flex",flexDirection:"column",gap:4 }}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            <a href={link} target="_blank" rel="noreferrer"
              style={{ fontSize:12,fontWeight:700,padding:"8px 14px",borderRadius:7,textDecoration:"none",
                textAlign:"center",background:dark?"#1e3a6e":"#eef1fb",color:dark?"#93c5fd":"#1a3a8f",display:"block" }}
              onClick={()=>setFilePopup(null)}>🔍 미리보기</a>
            <button
              style={{ fontSize:12,fontWeight:700,padding:"8px 14px",borderRadius:7,textAlign:"center",
                background:downloading[dlKey]?(dark?"#1e293b":"#f3f4f6"):(dark?"#14532d":"#f0fdf4"),
                color:downloading[dlKey]?"#9ca3af":(dark?"#86efac":"#166534"),
                border:"none",cursor:downloading[dlKey]?"not-allowed":"pointer",fontFamily:"inherit" }}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
              onClick={e=>handleDownload(e,link,fileName,dlKey)} disabled={downloading[dlKey]}>
              {downloading[dlKey]?"⏳ 준비 중...":"⬇ 다운로드"}
            </button>
          </div>
        );
      })()}

      <div className={`page${searched?" searched":""}${dark?" dark":""}`}>
        <button className="theme-toggle" onClick={()=>setDark(!dark)} title={dark?"라이트":"다크"}>{dark?"☀️":"🌙"}</button>
        <button className="upload-btn" onClick={()=>router.push("/upload")} title="파일 업로드">📁</button>

        {/* ── 로고 ── */}
        <div className="logo-area" onClick={searched?handleClear:undefined} style={searched?{cursor:"pointer"}:{}}>
          <div className="logo-wrap">
            <div className="logo-top-rule" />
            <h1 className="logo-main">Guardian &amp; Angel</h1>
            <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
            <div className="logo-mid-rule" />
            <p className="logo-sub-kr">가엔 특허법률사무소</p>
            <div className="logo-bot-rule" />
          </div>
          {searched && <p className="logo-hint">← 처음으로</p>}
          {!searched && <p className="subtitle">문서 통합 검색</p>}
        </div>

        {/* ── 검색창 ── */}
        <div className="search-wrap">
          <div className="search-box">
            <span className="icon">🔍</span>
            <input ref={inputRef} type="text"
              placeholder="문서명, 출원번호, 출원인, 대리인 코드..."
              value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        {/* ── 결과 ── */}
        <div className="results">
          {loading && <div className="loading"><div className="spinner"/><p>Notion DB 검색 중...</p></div>}
          {error   && <p className="error">⚠️ {error}</p>}
          {!loading && results !== null && (
            results.length === 0 ? (
              <div className={`fade-wrap${tableVisible?" visible":""}`}>
                <div className="no-result">
                  <p className="no-icon">📭</p>
                  <p className="no-text">검색 결과가 없습니다</p>
                  <p className="no-sub">다른 키워드로 시도해 보세요</p>
                </div>
              </div>
            ) : (
              <div className={`fade-wrap${tableVisible?" visible":""}`}>

                {/* count-row */}
                <div className="count-row">
                  <p className="count" style={{marginBottom:0}}>
                    {isRecent
                      ? <>🕐 최근 수정된 문서 20건 <span className="recent-hint">(여기에 없는 문서는 검색창을 이용해주세요)</span></>
                      : `검색 결과 ${results.length}건`}
                  </p>
                  {isRecent && (
                    <div className="count-btns">
                      <button className="nav-btn nav-btn-all"   onClick={()=>router.push("/all")}>📂 문서 전체 보기</button>
                      <button className="nav-btn nav-btn-guide" onClick={()=>router.push("/guide")}>📋 문서 작성 방법 및 양식</button>
                    </div>
                  )}
                </div>

                {/* 테이블 */}
                <div className="table-outer" ref={tableOuterRef}>
                  <table>
                    <thead>
                      <tr>
                        <StatusHeader
                          locked={checkLocked}
                          countdown={lockCountdown}
                          kvAvailable={kvAvailable}
                          onToggle={handleLockToggle}
                        />
                        <th className="th-title">문서 제목</th>
                        <th>유형</th>
                        <th>상태</th>
                        <th>서류작업상태</th>
                        <th>파일</th>
                        <th>출원번호</th>
                        <th>출원인(특허고객번호)</th>
                        <th>대리인 코드</th>
                        <th>마감일</th>
                        <th>카테고리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} className={`result-row ${i%2===0?"row-even":"row-odd"}`}>

                          {/* 검토 상태 pill */}
                          <StatusPillCell
                            url={row.url}
                            status={reviewStates[row.url] ?? null}
                            locked={checkLocked}
                            saving={savingUrl === row.url}
                            onSelect={handleStatusSelect}
                            dark={dark}
                          />

                          {/* 문서 제목 */}
                          <td className="td-title-col td-nowrap">
                            <div className="cell-inner">
                              <span className="doc-icon">📄</span>
                              <span className="doc-title" onClick={e=>handleTitleClick(e,row.url)}>
                                {renderSingleLine(row.title)}
                              </span>
                            </div>
                          </td>

                          {/* 유형 */}
                          <td className="td-nowrap">
                            {row.typeItems?.length>0
                              ? <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                                  {row.typeItems.map((t,k)=><span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>)}
                                </div>
                              : <span className="dash">—</span>}
                          </td>

                          {/* 상태 */}
                          <td className="td-nowrap">
                            {row.statusItem
                              ? <span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>
                              : <span className="dash">—</span>}
                          </td>

                          {/* 서류작업상태 */}
                          <td className="td-nowrap">
                            {row.docWorkStatusItem
                              ? <span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>
                              : <span className="dash">—</span>}
                          </td>

                          {/* 파일 */}
                          <td className="td-files">
                            {row.fileLinks ? (() => {
                              const files = row.fileLinks.split("\n").filter(Boolean);
                              const LIMIT = 1;
                              const isExpanded = !!expandedRows[i];
                              const show = isExpanded ? files : files.slice(0,LIMIT);
                              const hasMore = files.length > LIMIT;
                              return (
                                <div className="file-expand-wrap">
                                  <div className="file-links">
                                    {show.map((link,j)=>{
                                      const fileName = decodeURIComponent(link.split("/").pop());
                                      const pk = `${i}-${j}`;
                                      const isOpen = filePopup===pk;
                                      return (
                                        <div key={j} className="file-link-wrap">
                                          <span className={`file-link${isOpen?" active":""}`}
                                            onMouseDown={e=>{
                                              e.stopPropagation();
                                              if(isOpen)setFilePopup(null);
                                              else{setPopupPos({x:e.clientX,y:e.clientY});setFilePopup(pk);}
                                            }}>
                                            📄 {fileName} ▾
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {hasMore && (
                                    <button className={`expand-btn${isExpanded?" expanded":""}`}
                                      onClick={e=>{e.stopPropagation();toggleRow(i);}}>
                                      {isExpanded?"↑ 접기":`+${files.length-LIMIT} 파일더보기`}
                                    </button>
                                  )}
                                </div>
                              );
                            })() : <span className="dash">—</span>}
                          </td>

                          {/* 출원번호 */}
                          <td className={isMultiLine(row.appNum)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appNum)}
                              {row.appNum && <button className={`copy-btn${copied[`${i}-appNum`]?" copied":""}`} onClick={e=>handleCopy(e,row.appNum,`${i}-appNum`)}>{copied[`${i}-appNum`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          {/* 출원인 */}
                          <td className={isMultiLine(row.appOwner)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appOwner)}
                              {row.appOwner && <button className={`copy-btn${copied[`${i}-appOwner`]?" copied":""}`} onClick={e=>handleCopy(e,row.appOwner,`${i}-appOwner`)}>{copied[`${i}-appOwner`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          {/* 대리인 코드 */}
                          <td className={isMultiLine(row.agentCode)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.agentCode)}
                              {row.agentCode && <button className={`copy-btn${copied[`${i}-agentCode`]?" copied":""}`} onClick={e=>handleCopy(e,row.agentCode,`${i}-agentCode`)}>{copied[`${i}-agentCode`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          {/* 마감일 */}
                          <td className="td-nowrap"><span className="cell-text">{row.deadline||"—"}</span></td>

                          {/* 카테고리 */}
                          <td className="td-nowrap">
                            {row.categoryItems?.length>0
                              ? <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                                  {row.categoryItems.map((c,k)=><span key={k} className="badge" style={notionBadgeStyle(c.color,dark)}>{c.name}</span>)}
                                </div>
                              : <span className="dash">—</span>}
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

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

      {/* ── Notion 팝업 ── */}
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
        @keyframes spin { to { transform:rotate(360deg); } }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        /* ── 페이지 ── */
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box; animation:slideUpFade .7s ease both; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }

        .theme-toggle { position:absolute; top:20px; right:20px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .theme-toggle { border-color:#475569; }
        .upload-btn { position:absolute; top:20px; right:70px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .upload-btn { border-color:#475569; }

        /* ── 로고 ── */
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

        /* ── 검색창 ── */
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

        /* ── 결과 ── */
        .results   { width:100%; max-width:1300px; padding-bottom:60px; }
        .loading   { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner   { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f; border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error     { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon   { font-size:48px; }
        .no-text   { font-size:18px; font-weight:600; margin-top:12px; }
        .no-sub    { color:#9ca3af; font-size:14px; margin-top:6px; }

        /* count-row */
        .count-row   { display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:12px; gap:10px; flex-wrap:wrap; }
        .count       { color:#6b7280; font-size:13px; margin-bottom:0; }
        .recent-hint { font-style:italic; text-decoration:underline; color:#16a34a; font-size:12px; }
        .dark .recent-hint { color:#4ade80; }
        .count-btns  { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .nav-btn     { border:none; border-radius:8px; padding:7px 14px; font-size:12px; font-weight:700;
          cursor:pointer; font-family:inherit; white-space:nowrap; transition:background .15s; }
        .nav-btn-all   { background:#1a3a8f; color:#fff; }
        .nav-btn-all:hover   { background:#0d1e3d; }
        .dark .nav-btn-all   { background:#1e3a6e; }
        .dark .nav-btn-all:hover   { background:#2a4a8e; }
        .nav-btn-guide { background:#13274F; color:#fff; }
        .nav-btn-guide:hover { background:#0d1e3d; }
        .dark .nav-btn-guide { background:#1e3a6e; }
        .dark .nav-btn-guide:hover { background:#2a4a8e; }

        /* ── 테이블 ── */
        .table-outer { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(26,58,143,0.08); overflow-x:auto; border:1px solid #e5e9f5; }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }

        /* thead 전체 sticky top */
        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700;
          font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15);
          position:sticky; top:0; z-index:3; }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }

        /* 검토 열 th — sticky left:0 + top:0 */
        .th-check { position:sticky; left:0; top:0; z-index:6;
          width:130px; min-width:130px; padding:8px 10px;
          background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.4) !important; vertical-align:middle; }
        .dark .th-check { background:#1e3a6e; }

        /* 문서 제목 th — sticky left:130px + top:0 */
        .th-title { position:sticky; left:130px; top:0; z-index:5;
          background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.3) !important; }
        .dark .th-title { background:#1e3a6e; }

        /* ── 행 ── */
        .result-row { transition:background .12s; }
        .result-row:hover td { background:#f0f4ff; }
        .dark .result-row:hover td { background:#1e3a5f; }

        td { padding:10px 16px; border-bottom:1.5px solid #dde3f5; border-right:1px solid #edf0fb;
          white-space:nowrap; text-align:center; vertical-align:middle; background:inherit; }
        td:last-child { border-right:none; }
        .dark td { border-bottom-color:#2a3a55; border-right-color:#222e42; }

        /* 검토 열 td — sticky left:0 */
        .td-check { position:sticky; left:0; z-index:2;
          width:130px; min-width:130px; padding:7px 10px;
          border-right:2px solid #dde3f5 !important; }
        .dark .td-check { border-right-color:#2a3a55 !important; }
        .row-even .td-check { background:#fff; }
        .row-odd  .td-check { background:#f7f8ff; }
        .dark .row-even .td-check { background:#1e293b; }
        .dark .row-odd  .td-check { background:#172035; }
        .result-row:hover .td-check { background:#f0f4ff !important; }
        .dark .result-row:hover .td-check { background:#1e3a5f !important; }

        /* 문서 제목 td — sticky left:130px */
        .td-title-col { position:sticky; left:130px; z-index:2;
          border-right:2px solid #dde3f5 !important; }
        .dark .td-title-col { border-right-color:#2a3a55 !important; }
        .row-even .td-title-col { background:#fff; }
        .row-odd  .td-title-col { background:#f7f8ff; }
        .dark .row-even .td-title-col { background:#1e293b; }
        .dark .row-odd  .td-title-col { background:#172035; }
        .result-row:hover .td-title-col { background:#f0f4ff !important; }
        .dark .result-row:hover .td-title-col { background:#1e3a5f !important; }

        .td-nowrap { vertical-align:middle; text-align:center; }
        .td-top    { vertical-align:top; padding-top:10px; text-align:left; }
        .td-files  { vertical-align:middle; text-align:left; min-width:200px; }
        .cell-inner { display:flex; align-items:center; justify-content:center; gap:6px; }
        .doc-icon  { font-size:14px; flex-shrink:0; }
        .doc-title { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:0.75; }
        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .dash  { color:#d1d5db; }

        /* ── 검토 헤더 내부 ── */
        .check-header-inner { display:flex; flex-direction:column; align-items:center; gap:3px; }
        .lock-btn { background:none; border:1.5px solid rgba(255,255,255,0.45); border-radius:7px;
          padding:4px 7px; font-size:16px; cursor:pointer; line-height:1; transition:all .15s; }
        .lock-btn.is-locked   { border-color:rgba(255,255,255,0.5); }
        .lock-btn.is-unlocked { background:rgba(255,255,255,0.15); border-color:#fbbf24; }
        .lock-btn:hover { background:rgba(255,255,255,0.2); }
        .lock-cd      { font-size:10px; color:#fbbf24; font-weight:700; letter-spacing:0.5px; }
        .check-col-title { font-size:10px; color:rgba(255,255,255,0.75); letter-spacing:0.3px; }
        .kv-warn { font-size:12px; color:#fbbf24; cursor:help; }

        /* ── 검토 상태 pill 스택 ── */
        /* 세로 스택 — 항목 추가 시 자동 확장 */
        .pill-stack { display:flex; flex-direction:column; gap:3px; width:100%; }
        .pill-saving { opacity:0.7; pointer-events:none; }

        /* pill 버튼 개별 */
        .status-pill { display:flex; align-items:center; gap:5px;
          background:var(--pbg); border:1.5px solid var(--pbd); border-radius:7px;
          padding:4px 8px; cursor:pointer; font-family:inherit; text-align:left; width:100%;
          transition:background .15s, border-color .15s, opacity .15s; }
        .status-pill:hover:not(.pill-locked):not(.pill-active) { background:rgba(0,0,0,0.04); border-color:#d1d5db; }
        .dark .status-pill:hover:not(.pill-locked):not(.pill-active) { background:rgba(255,255,255,0.06); border-color:#475569; }
        .status-pill.pill-locked { cursor:not-allowed; opacity:0.55; }

        /* 라디오 도트 */
        .pill-dot { width:10px; height:10px; border-radius:50%; border:2px solid var(--pc);
          flex-shrink:0; transition:background .15s; background:transparent; }
        .pill-active .pill-dot { background:var(--pc); }

        /* 라벨 */
        .pill-label { font-size:10px; font-weight:700; color:var(--pc); white-space:nowrap; line-height:1.2; }
        .status-pill:not(.pill-active) .pill-label { color:#6b7280; }
        .dark .status-pill:not(.pill-active) .pill-label { color:#94a3b8; }
        .dark .status-pill:not(.pill-active) { border-color:#334155; }

        /* ── 파일 ── */
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
          padding:2px 7px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
        .copy-btn:hover { background:#d0d9f0; }
        .copy-btn.copied { background:#dcfce7; color:#166634; }
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

        /* ── 팝업 ── */
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
