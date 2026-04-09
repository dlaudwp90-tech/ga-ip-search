import React from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// ─── 상태 옵션 ──
const STATUS_OPTIONS = [
  { key: "confirmed", label: "대표확인", short: "확인다운", color: "#16a34a", bg: "#f0fdf4", darkColor: "#4ade80", darkBg: "#14532d" },
  { key: "rejected",  label: "대표반려", short: "반려", color: "#dc2626", bg: "#fff1f2", darkColor: "#f87171", darkBg: "#450a0a" },
  { key: "reviewing", label: "대표검토", short: "검토", color: "#d97706", bg: "#fffbeb", darkColor: "#fbbf24", darkBg: "#451a03" },
];

const LOCK_SECONDS = 600;
const COL_CHECK_W  = 160; // 대표검토 열 너비 (px)
const COL_TITLE_L  = COL_CHECK_W; // 문서제목 sticky left 값

function fmtCountdown(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

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

export default function Home() {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [searched,     setSearched]     = useState(false);
  const [dark,         setDark]         = useState(false);
  const [popup,        setPopup]        = useState(null);
  const [copied,       setCopied]       = useState({});
  const [filePopup,    setFilePopup]    = useState(null);
  const [popupPos,     setPopupPos]     = useState({ x: 0, y: 0 });
  const [downloading,  setDownloading]  = useState({});
  const [tableVisible, setTableVisible] = useState(false);
  const [isRecent,     setIsRecent]     = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [hoveredRow,   setHoveredRow]   = useState(null);

  const [reviewStates, setReviewStates] = useState({});
  const [savingUrl,    setSavingUrl]    = useState(null);
  const [kvAvailable,  setKvAvailable]  = useState(true);
  const [saveResult,   setSaveResult]   = useState(null); // null | "ok" | "fail"

  const [checkLocked,   setCheckLocked]   = useState(true);
  const [lockCountdown, setLockCountdown] = useState(0);
  const lockIntervalRef = useRef(null);
  const lockTimeoutRef  = useRef(null);

  // ── 닉네임 ──
  const [nickname,      setNickname]      = useState(null);
  const [nickInput,     setNickInput]     = useState("");
  const [nickEditing,   setNickEditing]   = useState(false);
  const [nickSaving,    setNickSaving]    = useState(false);

  // ── 댓글 ──
  const [commentPanels, setCommentPanels] = useState({}); // { idx: { open, comments, loading, input, saving, saved } }

  const toggleRow = (idx) => setExpandedRows(p => ({ ...p, [idx]: !p[idx] }));
  const inputRef      = useRef(null);
  const tableOuterRef = useRef(null);
  const filePopupRef  = useRef(null);
  const router        = useRouter();
  const { signOut }   = useClerk();
  const { user }      = useUser();
  const [userPopup,   setUserPopup]   = useState(false);
  const [userBtnPos,  setUserBtnPos]  = useState({ x: 0, y: 0 });
  const userBtnRef    = useRef(null);

  const startLockTimer = useCallback(() => {
    if (lockIntervalRef.current) clearInterval(lockIntervalRef.current);
    if (lockTimeoutRef.current)  clearTimeout(lockTimeoutRef.current);
    setLockCountdown(LOCK_SECONDS);
    lockIntervalRef.current = setInterval(() => {
      setLockCountdown(p => Math.max(0, p - 1));
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

  useEffect(() => () => stopLockTimer(), [stopLockTimer]);

  const handleLockToggle = () => {
    if (checkLocked) { setCheckLocked(false); startLockTimer(); }
    else             { setCheckLocked(true);  stopLockTimer();  }
  };

  const fetchReviewStates = useCallback(async (urls) => {
    if (!urls?.length) return;
    try {
      const res  = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", urls }),
      });
      const data = await res.json();
      setKvAvailable(data.kvAvailable !== false);
      if (data.states) {
        // Redis 값으로 머지: Redis에 값이 있으면 업데이트, null이면 기존 유지
        setReviewStates(prev => {
          const next = { ...prev };
          Object.entries(data.states).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== "") {
              next[k] = v;
            }
            // Redis가 null 반환해도 기존 값 유지 (SET 실패 방어)
          });
          return next;
        });
      }
    } catch { setKvAvailable(false); }
  }, []);

  // ── 검색 결과가 바뀔 때마다 Redis에서 상태 로드 ──
  useEffect(() => {
    if (results?.length) fetchReviewStates(results.map(r => r.url));
  }, [results, fetchReviewStates]);

  // ── 30초 폴링: 다른 기기 변경사항 실시간 반영 ──
  useEffect(() => {
    if (!results?.length) return;
    const urls = results.map(r => r.url);
    const id = setInterval(() => fetchReviewStates(urls), 30000);
    return () => clearInterval(id);
  }, [results, fetchReviewStates]);

  const handleStatusSelect = useCallback(async (url, newStatus) => {
    if (checkLocked) return;

    // 1. UI 즉시 반영 (낙관적 업데이트)
    const prevStatus = reviewStates[url] ?? null;
    setReviewStates(p => ({ ...p, [url]: newStatus }));

    // 2. Redis에 저장 (크로스 디바이스 동기화)
    setSavingUrl(url);
    try {
      const res  = await fetch("/api/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", url, status: newStatus }),
      });
      const data = await res.json();
      setKvAvailable(data.kvAvailable !== false);
      if (data.ok) {
        setSaveResult("ok");
      } else {
        setSaveResult("fail");
        setReviewStates(p => ({ ...p, [url]: prevStatus })); // 롤백
      }
    } catch {
      setSaveResult("fail");
      setReviewStates(p => ({ ...p, [url]: prevStatus })); // 롤백
    }
    finally {
      setSavingUrl(null);
      setTimeout(() => setSaveResult(null), 3000); // 3초 후 알림 숨김
    }

    startLockTimer();
  }, [checkLocked, startLockTimer, reviewStates]);

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

  useEffect(() => { fetchRecent(); }, []);

  // 결과 로드 시 댓글 수 미리 조회
  useEffect(() => {
    if (!results?.length) return;
    results.forEach((row, i) => {
      if (!row.pageId) return;
      fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId: row.pageId }),
      }).then(r => r.json()).then(d => {
        if (d.comments?.length > 0) {
          setCommentPanels(prev => ({
            ...prev,
            [i]: { ...(prev[i] || {}), comments: d.comments }
          }));
        }
      }).catch(() => {});
    });
  }, [results]);
  const fetchRecent = async () => {
    setLoading(true); setTableVisible(false);
    try {
      const res  = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent" }),
      });
      const data = await res.json();
      if (res.ok) { setResults(data.results); setIsRecent(true); setTimeout(() => setTableVisible(true), 50); }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!filePopup) return;
    const handle = (e) => {
      if (filePopupRef.current?.contains(e.target)) return;
      if (e.target.closest(".file-link-wrap")) return;
      if (tableOuterRef.current) {
        const r = tableOuterRef.current.getBoundingClientRect();
        if (e.clientX > r.right - 20 || e.clientY > r.bottom - 20) return;
        if (e.target === tableOuterRef.current) return;
      }
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
    const isOpen = commentPanels[idx]?.open;
    if (isOpen) {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], closing: true } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], open: false, closing: false } })), 340);
      return;
    }
    setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), open: true, loading: true } }));
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId }),
      });
      const d = await r.json();
      setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), loading: false, comments: d.comments || [] } }));
    } catch {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), loading: false, comments: [] } }));
    }
  };

  // ── 댓글 작성 ──
  const handleEditComment = async (idx, pageId, commentId) => {
    const panel = commentPanels[idx] || {};
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
    setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], comments: d2.comments || [], editingId: null } }));
  };

  const handlePostComment = async (idx, pageId) => {
    const panel = commentPanels[idx] || {};
    if (!panel.input?.trim()) return;
    setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: true } }));
    const r = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post", pageId, nickname: nickname || "익명", content: panel.input }),
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
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false, saved: true, input: "", comments: d2.comments || [] } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saved: false } })), 3000);
    } else {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false } }));
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

  // ─── 검토 열 헤더 — 인라인 스타일로 sticky 직접 적용 ───────────────────
  const thBg = dark ? "#1e3a6e" : "#1a3a8f";
  const reviewTh = (
    <th style={{
      position: "sticky",
      left: 0,
      top: 0,
      zIndex: 10,
      width: COL_CHECK_W,
      minWidth: COL_CHECK_W,
      padding: "8px 10px",
      background: thBg,
      color: "#fff",
      borderRight: "2px solid rgba(255,255,255,0.4)",
      borderBottom: "none",
      verticalAlign: "middle",
      textAlign: "center",
      whiteSpace: "nowrap",
      fontWeight: 700,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <button
            style={{
              background: "none",
              border: `1.5px solid ${checkLocked ? "rgba(255,255,255,0.6)" : "#fbbf24"}`,
              borderRadius: 7,
              padding: "4px 7px",
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
              color: "#fff",
              backgroundColor: checkLocked ? "transparent" : "rgba(255,255,255,0.15)",
            }}
            onClick={handleLockToggle}
            title={checkLocked ? "클릭하여 잠금 해제 (10분 후 자동 잠금)" : `잠금 해제 중 — ${fmtCountdown(lockCountdown)} 후 자동 잠금`}
          >
            {checkLocked ? "🔒" : "🔓"}
          </button>
          {!checkLocked && lockCountdown > 0 && (
            <span style={{ fontSize:10, color:"#fbbf24", fontWeight:700 }}>{fmtCountdown(lockCountdown)}</span>
          )}
          {!kvAvailable && (
            <span title="⚠ Upstash Redis 미설정 — 이 기기에서만 표시됩니다 (Vercel 환경변수 확인 필요)" style={{fontSize:11,color:"#ef4444",cursor:"help",fontWeight:700}}>⚠</span>
          )}
        </div>
        <span style={{ fontSize:10, color:"#fff", fontWeight:700, letterSpacing:"0.3px" }}>대표 검토</span>
        {saveResult === "ok"   && <span style={{fontSize:10,color:"#4ade80",fontWeight:700,marginLeft:4}}>✓저장</span>}
        {saveResult === "fail" && <span style={{fontSize:10,color:"#f87171",fontWeight:700,marginLeft:4}}>✗저장실패</span>}
      </div>
    </th>
  );

  // ─── 검토 pill 셀 — 버튼 가로 1행 배치 ─────────────────────────────────
  const reviewTd = (row, i) => {
    const status  = reviewStates[row.url] ?? null;
    const saving  = savingUrl === row.url;
    const bg      = rowBg(i, dark, hoveredRow === i);
    const borderR = dark ? "#2a3a55" : "#dde3f5";

    return (
      <td
        style={{
          position: "sticky", left: 0, zIndex: 2,
          width: COL_CHECK_W, minWidth: COL_CHECK_W,
          padding: "6px 8px",
          borderBottom: `1.5px solid ${dark ? "#2a3a55" : "#dde3f5"}`,
          borderRight:  `2px solid ${borderR}`,
          verticalAlign: "middle",
          background: bg,
          transition: "background 0.12s",
        }}
      >
        {/* 가로 1행 배치 */}
        <div style={{ display:"flex", flexDirection:"row", gap:3, opacity: saving ? 0.6 : 1 }}>
          {STATUS_OPTIONS.map(opt => {
            const isActive = status === opt.key;
            const c   = dark ? opt.darkColor : opt.color;
            const obg = dark ? opt.darkBg    : opt.bg;
            return (
              <button
                key={opt.key}
                onClick={() => handleStatusSelect(row.url, isActive ? null : opt.key)}
                disabled={checkLocked || saving}
                title={checkLocked ? "🔒 헤더의 자물쇠를 클릭하여 잠금 해제 후 선택하세요" : opt.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                  background: isActive ? obg : "transparent",
                  border: `1.5px solid ${isActive ? c : (dark ? "#334155" : "#e5e7eb")}`,
                  borderRadius: 5,
                  padding: "3px 4px",
                  cursor: (checkLocked || saving) ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  flex: 1,
                  minWidth: 0,
                  opacity: checkLocked ? 0.6 : 1,
                  transition: "all 0.15s",
                }}
              >
                {/* 라디오 도트 */}
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  border: `1.5px solid ${c}`,
                  flexShrink: 0,
                  background: isActive ? c : "transparent",
                  display: "inline-block",
                  transition: "background 0.15s",
                }} />
                {/* 축약 라벨 (확인/반려/검토) */}
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: isActive ? c : (dark ? "#94a3b8" : "#6b7280"),
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}>
                  {opt.short}
                </span>
              </button>
            );
          })}
        </div>
      </td>
    );
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

      {/* 파일 팝업 */}
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
        <button className="theme-toggle" onClick={()=>setDark(!dark)} title={dark?"라이트":"다크"}>{dark?"☀️":"🌙"}</button>
        <button className="upload-btn" onClick={()=>router.push("/upload")} title="파일 업로드">📁</button>
        <div className="user-btn-wrap">
          <button
            ref={userBtnRef}
            className="user-icon-btn"
            title="계정"
            onClick={e => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setUserBtnPos({ x: rect.left, y: rect.bottom });
              setUserPopup(p => !p);
            }}
          >
            👤
          </button>
        </div>

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
              value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        <div className="results">
          {loading && <div className="loading"><div className="spinner"/><p>Notion DB 검색 중...</p></div>}
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
                      <p className="lock-guide">🔓 잠금 표시를 해제하고 버튼을 눌러주세요</p>
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

                <div className="table-outer" ref={tableOuterRef}>
                  <table>
                    <thead>
                      <tr>
                        {reviewTh}
                        <th className="th-title">문서 제목</th>
                        <th>유형</th><th>상태</th><th>서류작업상태</th>
                        <th>파일</th><th>출원번호</th><th>출원인(특허고객번호)</th>
                        <th>대리인 코드</th><th>마감일</th><th>카테고리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <React.Fragment key={i}>
                        <tr
                          className={`result-row ${i%2===0?"row-even":"row-odd"}`}
                          onMouseEnter={()=>setHoveredRow(i)}
                          onMouseLeave={()=>setHoveredRow(null)}
                        >
                          {reviewTd(row, i)}

                          <td className="td-title-col td-nowrap">
                            <div className="cell-inner">
                              <span className="doc-icon">📄</span>
                              <span className="doc-title" onClick={e=>handleTitleClick(e,row.url)}>
                                {renderSingleLine(row.title)}
                              </span>
                              {commentPanels[i]?.open ? (
                                <span onClick={e => { e.stopPropagation(); toggleCommentPanel(i, row.pageId); }}
                                  title="댓글 접기"
                                  style={{ cursor:"pointer", flexShrink:0, fontSize:14,
                                    color:dark?"#818cf8":"#4f46e5", fontWeight:800,
                                    marginLeft:6, userSelect:"none", transition:"all 0.2s",
                                    display:"inline-flex", alignItems:"center" }}>
                                  ▲
                                </span>
                              ) : (
                                <span onClick={e => { e.stopPropagation(); toggleCommentPanel(i, row.pageId); }}
                                  style={{ cursor:"pointer", flexShrink:0, position:"relative",
                                    display:"inline-flex", alignItems:"center", marginLeft:6,
                                    opacity: commentPanels[i]?.comments?.length > 0 ? 1 : 0.2,
                                    transition:"opacity 0.15s" }}
                                  title={commentPanels[i]?.comments?.length > 0 ? "댓글 보기" : "댓글 달기"}
                                  onMouseEnter={e => e.currentTarget.style.opacity="0.75"}
                                  onMouseLeave={e => e.currentTarget.style.opacity = commentPanels[i]?.comments?.length > 0 ? "1" : "0.2"}>
                                  <span style={{ fontSize:26, lineHeight:1 }}>💬</span>
                                  {commentPanels[i]?.comments?.length > 0 && (
                                    <span style={{
                                      position:"absolute", top:-6, right:-10,
                                      background:"#ef4444",
                                      color:"#fff",
                                      fontSize:10, fontWeight:800,
                                      minWidth:17, height:17,
                                      borderRadius:9999,
                                      display:"flex", alignItems:"center", justifyContent:"center",
                                      padding:"0 4px",
                                      boxShadow:"0 1px 4px rgba(0,0,0,0.25)",
                                      lineHeight:1,
                                      border:"1.5px solid #fff"
                                    }}>
                                      {commentPanels[i].comments.length}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="td-nowrap">
                            {row.typeItems?.length>0
                              ? <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                                  {row.typeItems.map((t,k)=><span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>)}
                                </div>
                              : <span className="dash">—</span>}
                          </td>

                          <td className="td-nowrap">
                            {row.statusItem
                              ? <span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>
                              : <span className="dash">—</span>}
                          </td>

                          <td className="td-nowrap">
                            {row.docWorkStatusItem
                              ? <span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>
                              : <span className="dash">—</span>}
                          </td>

                          <td className="td-files">
                            {row.fileLinks ? (() => {
                              const files = row.fileLinks.split("\n").filter(Boolean);
                              const LIMIT = 1;
                              const isExpanded = !!expandedRows[i];
                              const show = isExpanded ? files : files.slice(0,LIMIT);
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
                                  {files.length>LIMIT && (
                                    <button className={`expand-btn${isExpanded?" expanded":""}`}
                                      onClick={e=>{e.stopPropagation();toggleRow(i);}}>
                                      {isExpanded?"↑ 접기":`+${files.length-LIMIT} 파일더보기`}
                                    </button>
                                  )}
                                </div>
                              );
                            })() : <span className="dash">—</span>}
                          </td>

                          <td className={isMultiLine(row.appNum)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appNum)}
                              {row.appNum&&<button className={`copy-btn${copied[`${i}-n`]?" copied":""}`} onClick={e=>handleCopy(e,row.appNum,`${i}-n`)}>{copied[`${i}-n`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          <td className={isMultiLine(row.appOwner)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appOwner)}
                              {row.appOwner&&<button className={`copy-btn${copied[`${i}-o`]?" copied":""}`} onClick={e=>handleCopy(e,row.appOwner,`${i}-o`)}>{copied[`${i}-o`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          <td className={isMultiLine(row.agentCode)?"td-top":"td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.agentCode)}
                              {row.agentCode&&<button className={`copy-btn${copied[`${i}-c`]?" copied":""}`} onClick={e=>handleCopy(e,row.agentCode,`${i}-c`)}>{copied[`${i}-c`]?"✓":"복사"}</button>}
                            </div>
                          </td>

                          <td className="td-nowrap"><span className="cell-text">{row.deadline||"—"}</span></td>

                          <td className="td-nowrap">
                            {row.categoryItems?.length>0
                              ? <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                                  {row.categoryItems.map((c,k)=><span key={k} className="badge" style={notionBadgeStyle(c.color,dark)}>{c.name}</span>)}
                                </div>
                              : <span className="dash">—</span>}
                          </td>
                        </tr>

                          {/* 댓글 패널 */}
                          {commentPanels[i]?.open && (() => {
                            const panel = commentPanels[i] || {};
                            return (
                              <tr>
                                <td colSpan={11} style={{ padding:0, background:"transparent", transition:"all 0.35s ease", borderBottom: commentPanels[i]?.open ? (dark?"2px solid #1e3a6e":"2px solid #c7d2fe") : "none" }}>
                                  <div style={{ position:"sticky", left:0, width: COL_CHECK_W + 250,
                                    background:dark?"#0f172a":"#eef2ff", borderRadius:"0 0 10px 10px",
                                    overflow:"hidden",
                                    maxHeight: commentPanels[i]?.closing ? "0" : "800px",
                                    opacity: commentPanels[i]?.closing ? 0 : 1,
                                    transition: "max-height 0.38s ease, opacity 0.3s ease",
                                    padding: commentPanels[i]?.closing ? "0 16px" : "12px 16px",
                                    display:"flex", flexDirection:"column", gap:10,
                                    boxShadow:"0 4px 12px rgba(19,39,79,0.08)" }}>
                                    {/* 댓글 목록 */}
                                    {panel.loading ? (
                                      <div style={{ fontSize:12, color:"#94a3b8" }}>불러오는 중...</div>
                                    ) : panel.comments?.length > 0 ? (
                                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                        {panel.comments.map((c, ci) => {
                                          const header = `[${c.nickname}] ${c.createdAt}${c.edited ? " [수정됨] "+c.editedAt : ""}`;
                                          const body = c.content;
                                          return (
                                            <div key={ci} style={{ background:dark?"#1e293b":"#fff", borderRadius:8,
                                              padding:"8px 12px", border:dark?"1px solid #334155":"1px solid #e0e7ff",
                                              textAlign:"left" }}>
                                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                                <span style={{ fontSize:11, color:dark?"#94a3b8":"#6b7280", fontWeight:600 }}>{header}</span>
                                                {/* 작성자 또는 관리자만 삭제 가능 */}
                                                {(c.nickname === nickname || user?.primaryEmailAddress?.emailAddress === "dlaudwp90@gmail.com") && (
                                                  <div style={{ display:"flex", gap:4 }}>
                                                    <button
                                                      onClick={() => {
                                                        setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i],
                                                          editingId: commentPanels[i]?.editingId === c.id ? null : c.id,
                                                          editInput: c.content,
                                                        }}));
                                                      }}
                                                      style={{ fontSize:10, fontWeight:700, background:dark?"#14532d":"#f0fdf4",
                                                        color:dark?"#86efac":"#166534", border:dark?"1px solid #166534":"1px solid #bbf7d0",
                                                        borderRadius:4, padding:"2px 7px", cursor:"pointer", fontFamily:"inherit" }}>
                                                      수정
                                                    </button>
                                                    <button
                                                      onClick={async () => {
                                                        if (!confirm("댓글을 삭제하시겠습니까?")) return;
                                                        await fetch("/api/comments", {
                                                          method: "POST",
                                                          headers: { "Content-Type": "application/json" },
                                                          body: JSON.stringify({ action: "delete", pageId: row.pageId, commentId: c.id }),
                                                        });
                                                        const r2 = await fetch("/api/comments", {
                                                          method: "POST",
                                                          headers: { "Content-Type": "application/json" },
                                                          body: JSON.stringify({ action: "get", pageId: row.pageId }),
                                                        });
                                                        const d2 = await r2.json();
                                                        setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], comments: d2.comments || [] } }));
                                                      }}
                                                      style={{ fontSize:10, fontWeight:700, background:dark?"#450a0a":"#fff1f2",
                                                        color:dark?"#f87171":"#dc2626", border:dark?"1px solid #dc2626":"1px solid #fecaca",
                                                        borderRadius:4, padding:"2px 7px", cursor:"pointer", fontFamily:"inherit" }}>
                                                      삭제
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                              <div style={{ fontSize:13, color:dark?"#e2e8f0":"#1f2937", whiteSpace:"pre-wrap", textAlign:"left",
                                                borderTop:dark?"1px solid #334155":"1px solid #e0e7ff",
                                                paddingTop:6, marginTop:2 }}>{body}</div>
                                              {commentPanels[i]?.editingId === c.id && (
                                                <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                                                  <textarea
                                                    value={commentPanels[i]?.editInput || ""}
                                                    onChange={e => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], editInput: e.target.value } }))}
                                                    onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handleEditComment(i, row.pageId, c.id); }}}
                                                    rows={2}
                                                    style={{ width:"100%", fontSize:13, border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                                      borderRadius:8, padding:"6px 10px", outline:"none", fontFamily:"inherit",
                                                      background:dark?"#0f172a":"#fff", color:dark?"#e2e8f0":"#1f2937", boxSizing:"border-box" }}
                                                  />
                                                  <div style={{ display:"flex", gap:6 }}>
                                                    <button onClick={() => handleEditComment(i, row.pageId, c.id)}
                                                      style={{ fontSize:11, fontWeight:700, padding:"4px 12px", background:"#13274F",
                                                        color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>
                                                      수정 완료
                                                    </button>
                                                    <button onClick={() => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], editingId: null } }))}
                                                      style={{ fontSize:11, fontWeight:700, padding:"4px 12px", background:"none",
                                                        border:dark?"1px solid #334155":"1px solid #e5e7eb", borderRadius:6, cursor:"pointer",
                                                        color:dark?"#94a3b8":"#6b7280", fontFamily:"inherit" }}>
                                                      취소
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize:12, color:"#94a3b8" }}>댓글이 없습니다.</div>
                                    )}
                                    {/* 입력창 */}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                      <textarea
                                        value={panel.input || ""}
                                        onChange={e => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], input: e.target.value } }))}
                                        onKeyDown={e => {
                                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePostComment(i, row.pageId); }
                                        }}
                                        placeholder={"댓글 입력 (Enter 등록 / Shift+Enter 줄바꿈)"}
                                        rows={2}
                                        style={{ width:"100%", fontSize:13, border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                          borderRadius:8, padding:"8px 10px", outline:"none", resize:"vertical",
                                          fontFamily:"inherit", background:dark?"#1e293b":"#fff", color:dark?"#e2e8f0":"#1f2937",
                                          boxSizing:"border-box" }}
                                      />
                                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                        <button
                                          onClick={() => handlePostComment(i, row.pageId)}
                                          disabled={panel.saving}
                                          style={{ padding:"6px 18px", background:"#13274F", color:"#fff",
                                            border:"none", borderRadius:8, fontSize:13, fontWeight:700,
                                            cursor:panel.saving?"not-allowed":"pointer", fontFamily:"inherit" }}>
                                          {panel.saving ? "저장 중..." : "등록"}
                                        </button>
                                        {panel.saved && (
                                          <span style={{ fontSize:11, color:"#16a34a", fontWeight:700 }}>✓ 저장됐습니다</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </React.Fragment>
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
        @keyframes spin { to{transform:rotate(360deg)} }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
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
        .user-btn-wrap { position:absolute; top:20px; right:120px;
          display:flex; align-items:center; justify-content:center; }
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
        .lock-guide { font-size:12px; font-weight:700; color:#d97706; letter-spacing:0.2px; }
        .dark .lock-guide { color:#fbbf24; }
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

        /* ── 테이블 컨테이너 ── */
        /* overflow:auto(양방향) + height → 내부에서 X/Y 모두 스크롤 → sticky 작동 보장 */
        .table-outer {
          background:#fff; border-radius:16px;
          box-shadow:0 2px 16px rgba(26,58,143,0.08);
          overflow:auto;
          height: 65vh;
          min-height: 280px;
          border:1px solid #e5e9f5;
        }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }

        /* ── thead sticky top — table-outer 기준 ── */
        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700;
          font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15);
          position:sticky; top:0; z-index:3; }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }

        /* ── 대표 검토 th — 좌상단 코너 고정 (top:0 + left:0 동시) ── */
        .th-check {
          position:sticky !important; left:0 !important; top:0 !important; z-index:10 !important;
          width:${COL_CHECK_W}px; min-width:${COL_CHECK_W}px;
          padding:8px 10px;
          background:#1a3a8f !important;
          border-right:2px solid rgba(255,255,255,0.4) !important;
          vertical-align:middle;
        }
        .dark .th-check { background:#1e3a6e !important; }

        /* th 내부 flex 래퍼 */
        .th-check-inner {
          display:flex; flex-direction:column; align-items:center; gap:4px;
        }
        .th-check-top {
          display:flex; align-items:center; gap:5px;
        }

        .lock-btn { background:none; border:1.5px solid rgba(255,255,255,0.6); border-radius:7px;
          padding:4px 7px; font-size:16px; cursor:pointer; line-height:1; transition:all .15s; color:#fff; }
        .lock-btn.is-locked   { border-color:rgba(255,255,255,0.6); }
        .lock-btn.is-unlocked { background:rgba(255,255,255,0.15); border-color:#fbbf24; }
        .lock-btn:hover       { background:rgba(255,255,255,0.2); }
        .lock-cd       { font-size:10px; color:#fbbf24; font-weight:700; letter-spacing:0.5px; }
        .check-col-title { font-size:10px; color:#fff; font-weight:700; letter-spacing:0.3px; }

        /* ── 문서 제목 th — left:COL_CHECK_W sticky ── */
        .th-title {
          position:sticky; left:${COL_TITLE_L}px; top:0; z-index:5;
          background:#1a3a8f;
          border-right:2px solid rgba(255,255,255,0.3) !important;
        }
        .dark .th-title { background:#1e3a6e; }

        /* ── 행 ── */
        .result-row { transition:background .12s; }
        .result-row:hover td { background:#f0f4ff; }
        .dark .result-row:hover td { background:#1e3a5f; }
        td { padding:10px 16px; border-bottom:1.5px solid #dde3f5; border-right:1px solid #edf0fb;
          white-space:nowrap; text-align:center; vertical-align:middle; background:inherit; }
        td:last-child { border-right:none; }
        .dark td { border-bottom-color:#2a3a55; border-right-color:#222e42; }

        /* ── 문서 제목 td — left:COL_TITLE_L sticky ── */
        .td-title-col { position:sticky; left:${COL_TITLE_L}px; z-index:2;
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
