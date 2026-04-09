import React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import Head from "next/head";
import { useRouter } from "next/router";

// ─── index.js와 동일한 상수 ───────────────────────────────────────────────
const STATUS_OPTIONS = [
  { key: "confirmed", label: "대표확인", short: "확인다운", color: "#16a34a", bg: "#f0fdf4", darkColor: "#4ade80", darkBg: "#14532d" },
  { key: "rejected",  label: "대표반려", short: "반려",    color: "#dc2626", bg: "#fff1f2", darkColor: "#f87171", darkBg: "#450a0a" },
  { key: "reviewing", label: "대표검토", short: "검토",    color: "#d97706", bg: "#fffbeb", darkColor: "#fbbf24", darkBg: "#451a03" },
];
const LOCK_SECONDS  = 600;
const COL_CHECK_W   = 160;
const COL_TITLE_L   = COL_CHECK_W;

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

function rowBg(i, dark, hover = false) {
  if (hover) return dark ? "#1e3a5f" : "#f0f4ff";
  if (i % 2 === 0) return dark ? "#1e293b" : "#fff";
  return dark ? "#172035" : "#f7f8ff";
}

export default function AllPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const [tableVisible, setTableVisible] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [filePopup, setFilePopup] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState({});
  const [copied, setCopied] = useState({});
  const [notionPopup, setNotionPopup] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);

  // ── 대표 검토 상태 ──
  const [reviewStates, setReviewStates] = useState({});
  const [savingUrl,    setSavingUrl]    = useState(null);
  const [kvAvailable,  setKvAvailable]  = useState(true);
  const [saveResult,   setSaveResult]   = useState(null); // null | "ok" | "fail"

  // ── 잠금 상태 ──
  const [checkLocked,   setCheckLocked]   = useState(true);
  const [lockCountdown, setLockCountdown] = useState(0);
  const lockIntervalRef = useRef(null);
  const lockTimeoutRef  = useRef(null);

  const tableOuterRef = useRef(null);
  const filePopupRef  = useRef(null);
  const bottomRef     = useRef(null);

  const { signOut } = useClerk();
  const { user } = useUser();
  const [nickname, setNickname] = useState(null);
  const [commentPanels, setCommentPanels] = useState({});

  // ── 유저 팝업 ──
  const [userPopup,    setUserPopup]    = useState(false);
  const [userBtnPos,   setUserBtnPos]   = useState({ x: 0, y: 0 });
  const [nickInput,    setNickInput]    = useState("");
  const [nickEditing,  setNickEditing]  = useState(false);
  const [nickSaving,   setNickSaving]   = useState(false);
  const userBtnRef     = useRef(null);

  // ── 알림 ──
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifList,    setNotifList]    = useState([]);
  const [lastRead,     setLastRead]     = useState(0);
  const [notifPos,     setNotifPos]     = useState({ x: 0, y: 0 });
  const [nowTs,        setNowTs]        = useState(Date.now());
  const notifBtnRef    = useRef(null);
  const rowRefs        = useRef({});
  const mobileCardRefs = useRef({});

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress }),
    }).then(r => r.json()).then(d => { setNickname(d.nickname || null); setNickInput(d.nickname || ""); });
  }, [user]);

  const loadNotifications = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    const r = await fetch("/api/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", email: user.primaryEmailAddress.emailAddress }),
    });
    const d = await r.json();
    setNotifList(d.notifications || []);
    setLastRead(Number(d.lastRead) || 0);
  };
  useEffect(() => { loadNotifications(); }, [user]);

  const markNotifRead = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    await fetch("/api/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markRead", email: user.primaryEmailAddress.emailAddress }),
    });
    setLastRead(Date.now());
  };

  const handleSaveNick = async () => {
    if (!nickInput.trim()) return;
    setNickSaving(true);
    await fetch("/api/nickname", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress, nickname: nickInput.trim() }),
    });
    setNickname(nickInput.trim());
    setNickEditing(false);
    setNickSaving(false);
  };

  // id 기반 스크롤 함수
  const scrollToIdx = (idx) => {
    const isMobile = window.innerWidth <= 768;
    const id = isMobile ? `m-card-${idx}` : `pc-row-${idx}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    return false;
  };

  // 알림 클릭 → 해당 행 스크롤 + 댓글 패널
  const handleNotifClick = async (notif) => {
    setNotifOpen(false);
    const idx = results?.findIndex(r => r.pageId === notif.pageId);
    if (idx !== undefined && idx >= 0) {
      await toggleCommentPanel(idx, notif.pageId);
      // id 기반 스크롤 - 즉시 + 재시도
      if (!scrollToIdx(idx)) {
        let tries = 0;
        const retry = setInterval(() => {
          if (scrollToIdx(idx) || ++tries >= 10) clearInterval(retry);
        }, 150);
      }
    }
  };

  // openComment 쿼리 파라미터 처리 (index.js에서 넘어올 때)
  const [jumpTarget, setJumpTarget] = useState(null); // 모바일용 이동 배너

  useEffect(() => {
    const { openComment } = router.query;
    if (!openComment || !results?.length) return;
    const idx = results.findIndex(r => r.pageId === openComment);
    if (idx < 0) return;

    // 댓글 패널 먼저 오픈
    toggleCommentPanel(idx, openComment);

    // id 기반 스크롤 시도
    const tryScroll = (attempt = 0) => {
      const isMobile = window.innerWidth <= 768;
      const id = isMobile ? `m-card-${idx}` : `pc-row-${idx}`;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setJumpTarget(null);
      } else if (attempt < 12) {
        setTimeout(() => tryScroll(attempt + 1), 150);
      } else {
        const row = results[idx];
        setJumpTarget({ idx, pageId: openComment, title: row?.title || "문서" });
      }
    };
    setTimeout(() => tryScroll(), 300);
  }, [router.query, results]);

  useEffect(() => {
    if (!userPopup) return;
    const h = e => { if (userBtnRef.current?.contains(e.target)) return; setUserPopup(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [userPopup]);

  useEffect(() => {
    if (!notifOpen) return;
    const h = e => { if (notifBtnRef.current?.contains(e.target)) return; setNotifOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [notifOpen]);

  const toggleCommentPanel = async (idx, pageId) => {
    const isOpen = commentPanels[idx]?.open;
    if (isOpen) {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], closing: true } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], open: false, closing: false } })), 380);
      return;
    }
    setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), open: true, loading: true, commentsVisible: false } }));
    try {
      const r = await fetch("/api/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId }),
      });
      const d = await r.json();
      setTimeout(() => {
        setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), loading: false, comments: d.comments || [], commentsVisible: true } }));
      }, 320);
    } catch {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...(prev[idx]||{}), loading: false, comments: [], commentsVisible: true } }));
    }
  };

  const handlePostComment = async (idx, pageId) => {
    const panel = commentPanels[idx] || {};
    if (!panel.input?.trim()) return;
    setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: true } }));
    const r = await fetch("/api/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post", pageId, nickname: nickname || "익명", content: panel.input }),
    });
    const d = await r.json();
    if (d.ok) {
      const r2 = await fetch("/api/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", pageId }),
      });
      const d2 = await r2.json();
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false, saved: true, input: "", comments: d2.comments || [] } }));
      setTimeout(() => setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saved: false } })), 3000);
    } else {
      setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false } }));
    }
  };

  const handleEditComment = async (idx, pageId, commentId) => {
    const panel = commentPanels[idx] || {};
    if (!panel.editInput?.trim()) return;
    await fetch("/api/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", pageId, commentId, nickname: nickname || "익명", content: panel.editInput.trim() }),
    });
    const r2 = await fetch("/api/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", pageId }),
    });
    const d2 = await r2.json();
    setCommentPanels(prev => ({ ...prev, [idx]: { ...prev[idx], comments: d2.comments || [], editingId: null } }));
  };

  const toggleRow = (idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));

  // ── 잠금 타이머 ──
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

  // ── Redis API 조회 — Redis가 단일 진실 원천 ──
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

  // ── 결과 변경 시 Redis에서 상태 로드 ──
  useEffect(() => {
    if (results?.length) fetchReviewStates(results.map(r => r.url));
  }, [results, fetchReviewStates]);

  // ── 댓글 수 미리 조회 (새로고침 후 즉시 표시)
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

  // ── 30초 폴링: 다른 기기 변경사항 실시간 반영 ──
  useEffect(() => {
    if (!results?.length) return;
    const urls = results.map(r => r.url);
    const id = setInterval(() => fetchReviewStates(urls), 30000);
    return () => clearInterval(id);
  }, [results, fetchReviewStates]);

  // ── 버튼 클릭 처리 ──
  const handleStatusSelect = useCallback(async (url, newStatus) => {
    if (checkLocked) return;
    const prevStatus = reviewStates[url] ?? null;
    setReviewStates(p => ({ ...p, [url]: newStatus }));
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
      setTimeout(() => setSaveResult(null), 3000);
    }
    startLockTimer();
  }, [checkLocked, startLockTimer, reviewStates]);

  // ── 초기 로드 ──
  useEffect(() => {
    fetchPage(null, true);
    fetchTotalCount();
  }, []);

  const fetchPage = async (cursor, isInitial = false) => {
    if (isInitial) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch("/api/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor, mode: "page" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      if (isInitial) {
        setResults(data.results);
        setTimeout(() => setTableVisible(true), 50);
      } else {
        setResults(prev => [...prev, ...data.results]);
      }
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) { setError(err.message); }
    finally { if (isInitial) setLoading(false); else setLoadingMore(false); }
  };

  const fetchAllRemaining = async () => {
    if (!nextCursor) return;
    setLoadingAll(true);
    try {
      const res = await fetch("/api/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor: nextCursor, mode: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      setResults(prev => [...prev, ...data.results]);
      setHasMore(false);
      setNextCursor(null);
    } catch (err) { setError(err.message); }
    finally { setLoadingAll(false); }
  };

  const fetchTotalCount = async () => {
    try {
      const res = await fetch("/api/count");
      const data = await res.json();
      if (res.ok) setTotalCount(data.count);
    } catch {}
  };

  // ── 파일 팝업 외부 클릭 닫기 ──
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

  const handleTitleClick = (e, url) => { e.stopPropagation(); setFilePopup(null); setNotionPopup({ url }); };

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
      const res = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = { pdf:"application/pdf",hwpx:"application/octet-stream",hwp:"application/octet-stream",
          pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
          docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",htl:"application/octet-stream" };
        const fh = await window.showSaveFilePicker({ suggestedName: fileName,
          types:[{ description:"파일", accept:{ [mimeMap[ext]||"application/octet-stream"]:[`.${ext}`] } }] });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const bUrl = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=bUrl; a.download=fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(bUrl);
      }
    } catch (err) { if (err.name !== "AbortError") alert("다운로드 실패: "+err.message); }
    finally { setDownloading(p => ({ ...p, [key]: false })); setFilePopup(null); }
  };

  // ─── 대표 검토 헤더 (인라인 스타일) ────────────────────────────────────
  const thBg = dark ? "#1e3a6e" : "#1a3a8f";
  const reviewTh = (
    <th style={{
      position:"sticky", left:0, top:0, zIndex:10,
      width:COL_CHECK_W, minWidth:COL_CHECK_W,
      padding:"8px 10px",
      background:thBg, color:"#fff",
      borderRight:"2px solid rgba(255,255,255,0.4)",
      verticalAlign:"middle", textAlign:"center",
      whiteSpace:"nowrap", fontWeight:700,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <button
            style={{
              background:"none",
              border:`1.5px solid ${checkLocked ? "rgba(255,255,255,0.6)" : "#fbbf24"}`,
              borderRadius:7, padding:"4px 7px", fontSize:16, cursor:"pointer",
              lineHeight:1, color:"#fff",
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
        </div>
        <span style={{ fontSize:10, color:"#fff", fontWeight:700, letterSpacing:"0.3px" }}>대표 검토</span>
        {saveResult === "ok"   && <span style={{fontSize:10,color:"#4ade80",fontWeight:700}}>✓저장</span>}
        {saveResult === "fail" && <span style={{fontSize:10,color:"#f87171",fontWeight:700}}>✗저장실패</span>}
      </div>
    </th>
  );

  // ─── 대표 검토 셀 (인라인 스타일, 가로 1행 배치) ─────────────────────
  const reviewTd = (row, i) => {
    const status  = reviewStates[row.url] ?? null;
    const saving  = savingUrl === row.url;
    const bg      = rowBg(i, dark, hoveredRow === i);
    return (
      <td style={{
        position:"sticky", left:0, zIndex:2,
        width:COL_CHECK_W, minWidth:COL_CHECK_W,
        padding:"6px 8px",
        borderBottom:`1.5px solid ${dark ? "#2a3a55" : "#dde3f5"}`,
        borderRight:`2px solid ${dark ? "#2a3a55" : "#dde3f5"}`,
        verticalAlign:"middle", background:bg,
        transition:"background 0.12s",
      }}>
        <div style={{ display:"flex", flexDirection:"row", gap:3, opacity: saving ? 0.6 : 1 }}>
          {STATUS_OPTIONS.map(opt => {
            const isActive = status === opt.key;
            const c   = dark ? opt.darkColor : opt.color;
            const obg = dark ? opt.darkBg    : opt.bg;
            return (
              <button key={opt.key}
                onClick={() => handleStatusSelect(row.url, isActive ? null : opt.key)}
                disabled={checkLocked || saving}
                title={checkLocked ? "🔒 잠금을 해제하고 클릭하세요" : opt.label}
                style={{
                  display:"flex", alignItems:"center", justifyContent:"center", gap:3,
                  background: isActive ? obg : "transparent",
                  border:`1.5px solid ${isActive ? c : (dark ? "#334155" : "#e5e7eb")}`,
                  borderRadius:5, padding:"3px 4px",
                  cursor:(checkLocked||saving) ? "not-allowed" : "pointer",
                  fontFamily:"inherit", flex:1, minWidth:0,
                  opacity: checkLocked ? 0.6 : 1,
                  transition:"all 0.15s",
                }}
              >
                <span style={{
                  width:7, height:7, borderRadius:"50%",
                  border:`1.5px solid ${c}`, flexShrink:0,
                  background: isActive ? c : "transparent",
                  display:"inline-block", transition:"background 0.15s",
                }} />
                <span style={{
                  fontSize:9, fontWeight:700,
                  color: isActive ? c : (dark ? "#94a3b8" : "#6b7280"),
                  whiteSpace:"nowrap", lineHeight:1.3,
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

  const remainingCount = totalCount !== null ? Math.max(0, totalCount - results.length) : null;

  return (
    <>
      <Head>
        <title>문서 전체 보기 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* 파일 팝업 */}
      {filePopup && results && (() => {
        const [ri, ci] = filePopup.split("-").map(Number);
        const row = results[ri];
        if (!row?.fileLinks) return null;
        const links = row.fileLinks.split("\n").filter(Boolean);
        const link = links[ci];
        if (!link) return null;
        const fileName = decodeURIComponent(link.split("/").pop());
        const dlKey = `dl-${filePopup}`;
        return (
          <div ref={filePopupRef}
            style={{ position:"fixed", left:popupPos.x+14, top:popupPos.y-10, zIndex:500,
              background:dark?"#1e293b":"#fff", border:`1.5px solid ${dark?"#334155":"#e5e9f5"}`,
              borderRadius:10, boxShadow:"0 8px 24px rgba(19,39,79,0.18)", padding:6,
              minWidth:140, display:"flex", flexDirection:"column", gap:4 }}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            <a href={link} target="_blank" rel="noreferrer"
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textDecoration:"none",
                textAlign:"center", background:dark?"#1e3a6e":"#eef1fb", color:dark?"#93c5fd":"#1a3a8f", display:"block" }}
              onClick={()=>setFilePopup(null)}>🔍 미리보기</a>
            <button
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textAlign:"center",
                background:downloading[dlKey]?(dark?"#1e293b":"#f3f4f6"):(dark?"#14532d":"#f0fdf4"),
                color:downloading[dlKey]?"#9ca3af":(dark?"#86efac":"#166534"),
                border:"none", cursor:downloading[dlKey]?"not-allowed":"pointer", fontFamily:"inherit" }}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
              onClick={e=>handleDownload(e,link,fileName,dlKey)} disabled={downloading[dlKey]}>
              {downloading[dlKey]?"⏳ 준비 중...":"⬇ 다운로드"}
            </button>
          </div>
        );
      })()}

      {/* Notion 팝업 */}
      {notionPopup && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:999 }} onClick={()=>setNotionPopup(null)}>
          <div style={{ background:dark?"#1e293b":"#fff",borderRadius:20,padding:"32px 36px",
            maxWidth:360,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",textAlign:"center",
            color:dark?"#e2e8f0":"#1f2937" }} onClick={e=>e.stopPropagation()}>
            <p style={{fontSize:40,marginBottom:12}}>📄</p>
            <p style={{fontSize:18,fontWeight:800,marginBottom:6}}>노션에서 보시겠습니까?</p>
            <p style={{fontSize:13,color:"#6b7280",marginBottom:24}}>Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button style={{background:"#1a3a8f",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{ window.location.href=notionPopup.url.replace("https://www.notion.so/","notion://www.notion.so/"); setNotionPopup(null); }}>
                예 — Notion 앱으로 열기
              </button>
              <button style={{background:dark?"#1e3a6e":"#eef1fb",color:dark?"#93c5fd":"#1a3a8f",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{ window.open(notionPopup.url,"_blank"); setNotionPopup(null); }}>
                브라우저로 열기
              </button>
              <button style={{background:dark?"#334155":"#f3f4f6",color:dark?"#94a3b8":"#6b7280",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>setNotionPopup(null)}>아니오</button>
            </div>
          </div>
        </div>
      )}

      <div className={`page${dark?" dark":""}`}>

        {/* 댓글 이동 배너 (모바일 스크롤 실패 시) */}
        {jumpTarget && (
          <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:700,
            background:"#13274F", color:"#fff", padding:"10px 16px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            boxShadow:"0 2px 12px rgba(0,0,0,0.3)" }}>
            <span style={{ fontSize:13 }}>
              💬 <strong>{jumpTarget.title}</strong>의 댓글
            </span>
            <button
              onClick={() => {
                const isMobile = window.innerWidth <= 768;
                const id = isMobile ? `m-card-${jumpTarget.idx}` : `pc-row-${jumpTarget.idx}`;
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                setJumpTarget(null);
              }}
              style={{ background:"#fff", color:"#13274F", border:"none", borderRadius:8,
                padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              댓글로 이동 ↓
            </button>
            <button onClick={() => setJumpTarget(null)}
              style={{ background:"none", border:"none", color:"#fff", fontSize:18, cursor:"pointer", padding:"0 4px" }}>✕</button>
          </div>
        )}

        {/* ── 우측 상단 버튼 묶음 ── */}
        <div style={{ position:"fixed", top:14, right:12, zIndex:400,
          display:"flex", alignItems:"center", gap:8 }}>

          {/* 알림 벨 */}
          <div style={{ display:"inline-flex" }}>
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
                padding:"0 4px", border:"2px solid #fff", lineHeight:1 }}>N</span>
            )}
          </button>
          </div>

          {/* 유저 버튼 */}
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

          {/* 테마 버튼 */}
          <button onClick={()=>setDark(!dark)} title={dark?"라이트 모드":"다크 모드"}
            style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
              width:40, height:40, fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"border-color .2s", flexShrink:0 }}>
            {dark?"☀️":"🌙"}
          </button>

        </div>{/* ── 우측 버튼 묶음 끝 ── */}

        {notifOpen && (
          <div style={{ position:"fixed", right:16, top:notifPos.y+6, zIndex:600,
            background:dark?"#1e293b":"#fff", border:dark?"1.5px solid #334155":"1.5px solid #e5e9f5",
            borderRadius:12, boxShadow:"0 8px 32px rgba(19,39,79,0.18)",
            width:300, maxHeight:420, overflowY:"auto", display:"flex", flexDirection:"column" }}
            onMouseDown={e=>e.stopPropagation()}>
            <div style={{ padding:"12px 16px 8px", borderBottom:dark?"1px solid #334155":"1px solid #f1f5f9",
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:700, color:dark?"#e2e8f0":"#13274F" }}>댓글 알림</span>
              <button onClick={() => setNotifOpen(false)}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#94a3b8" }}>✕</button>
            </div>
            {notifList.length === 0 ? (
              <div style={{ padding:24, textAlign:"center", fontSize:13, color:"#94a3b8" }}>알림이 없습니다</div>
            ) : notifList.map((n, ni) => {
              const isNew = (nowTs - n.ts) < 3600000;
              return (
                <div key={n.id} onClick={() => handleNotifClick(n)}
                  style={{ padding:"10px 16px", cursor:"pointer",
                    borderBottom:dark?"1px solid #1e293b":"1px solid #f8faff",
                    background: isNew ? (dark?"rgba(30,58,110,0.2)":"#eef2ff") : "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = dark?"#334155":"#f1f5f9"}
                  onMouseLeave={e => e.currentTarget.style.background = isNew?(dark?"rgba(30,58,110,0.2)":"#eef2ff"):"transparent"}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:dark?"#93c5fd":"#1a3a8f" }}>{n.docTitle}</span>
                    {isNew && <span style={{ background:"#ef4444", color:"#fff", fontSize:10, fontWeight:900,
                      borderRadius:9999, padding:"1px 5px", lineHeight:1.4, flexShrink:0 }}>N</span>}
                  </div>
                  <div style={{ fontSize:12, color:dark?"#94a3b8":"#6b7280", marginBottom:2 }}>
                    <span style={{ fontWeight:600 }}>{n.nickname}</span> · {n.createdAt}
                  </div>
                  <div style={{ fontSize:12, color:dark?"#cbd5e1":"#374151",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.content}</div>
                </div>
              );
            })}
          </div>
        )}

        {userPopup && (
          <div style={{ position:"fixed", right:16, top:userBtnPos.y+6, zIndex:500,
            background:dark?"#1e293b":"#fff", border:dark?"1.5px solid #334155":"1.5px solid #e5e9f5",
            borderRadius:10, boxShadow:"0 8px 24px rgba(19,39,79,0.18)",
            padding:6, minWidth:200, maxWidth:260, display:"flex", flexDirection:"column", gap:4 }}
            onMouseDown={e=>e.stopPropagation()}>
            {user?.primaryEmailAddress?.emailAddress && (
              <div style={{ fontSize:11, color:dark?"#94a3b8":"#6b7280", padding:"6px 10px 4px",
                borderBottom:dark?"1px solid #334155":"1px solid #e5e9f5", marginBottom:2, wordBreak:"break-all" }}>
                {user.primaryEmailAddress.emailAddress}
              </div>
            )}
            {nickEditing ? (
              <div style={{ display:"flex", gap:4, padding:"4px 6px" }}>
                <input autoFocus value={nickInput} onChange={e => setNickInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter") handleSaveNick(); if(e.key==="Escape") setNickEditing(false); }}
                  style={{ flex:1, fontSize:12, border:"1.5px solid #cbd5e1", borderRadius:6,
                    padding:"4px 8px", outline:"none", fontFamily:"inherit",
                    background:dark?"#0f172a":"#f8faff", color:dark?"#e2e8f0":"#13274F" }} placeholder="닉네임 입력" />
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
                    padding:"2px 7px", cursor:"pointer", color:dark?"#94a3b8":"#6b7280", fontFamily:"inherit" }}>변경</button>
              </div>
            )}
            <button onClick={() => { setUserPopup(false); signOut({ redirectUrl: "/login" }); }}
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textAlign:"center",
                background:dark?"#450a0a":"#fff1f2", color:dark?"#f87171":"#dc2626",
                border:"none", cursor:"pointer", fontFamily:"inherit" }}>🚪 로그아웃</button>
          </div>
        )}
        <button className="back-btn" onClick={()=>router.push("/")} title="홈으로">←</button>

        <div className="logo-area" onClick={()=>router.push("/")} style={{cursor:"pointer"}}>
          <div className="logo-wrap">
            <div className="logo-top-rule" />
            <h1 className="logo-main">Guardian &amp; Angel</h1>
            <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
            <div className="logo-mid-rule" />
            <p className="logo-sub-kr">가엔 특허법률사무소</p>
            <div className="logo-bot-rule" />
          </div>
        </div>

        <div className="page-title-wrap">
          <h2 className="page-title">📂 문서 전체 보기</h2>
          <p className="page-subtitle">생성 순서 기준 · 전체 DB 조회
            {totalCount !== null && <span className="total-badge"> 총 {totalCount}건</span>}
          </p>
        </div>

        <div className="results">
          {loading && (
            <div className="loading"><div className="spinner"/><p>Notion DB 불러오는 중...</p></div>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          {!loading && results.length === 0 && !error && (
            <div className="no-result">
              <p className="no-icon">📭</p><p className="no-text">문서가 없습니다</p>
            </div>
          )}
          {results.length > 0 && (
            <div className={`fade-wrap${tableVisible?" visible":""}`}>
              <div className="count-row">
                <p className="count">📄 {results.length}건 표시 중{hasMore ? ` (전체 ${totalCount??'…'}건)` : ` / 전체 ${results.length}건`}</p>
                <p className="lock-guide">🔓 잠금 표시를 해제하고 버튼을 눌러주세요</p>
              </div>
              {/* ── 모바일 카드 뷰 ── */}
              <div className="mobile-cards">
                {results.map((row, i) => (
                  <React.Fragment key={i}>
                    <div className="m-card"
                      id={`m-card-${i}`}
                      ref={el => mobileCardRefs.current[i] = el}
                      style={{ background: dark ? (i%2===0?"#1e293b":"#172035") : (i%2===0?"#fff":"#f7f8ff") }}>
                      {/* 제목 행 */}
                      <div className="m-card-top">
                        <span className="m-card-icon">📄</span>
                        <span className="m-card-title" onClick={e=>handleTitleClick(e,row.url)}>{renderSingleLine(row.title)}</span>
                        <span onClick={e=>{e.stopPropagation();toggleCommentPanel(i,row.pageId)}}
                          style={{cursor:"pointer",flexShrink:0,position:"relative",display:"inline-flex",
                            alignItems:"center",marginLeft:4,opacity:commentPanels[i]?.comments?.length>0?1:0.2}}>
                          <span style={{fontSize:20}}>💬</span>
                          {commentPanels[i]?.comments?.length>0&&(
                            <span style={{position:"absolute",top:-4,right:-8,background:"#ef4444",color:"#fff",
                              fontSize:9,fontWeight:800,minWidth:15,height:15,borderRadius:9999,
                              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
                              border:"1.5px solid #fff"}}>
                              {commentPanels[i].comments.length}
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 대표검토 버튼 */}
                      <div className="m-review-row">
                        {STATUS_OPTIONS.map(opt => {
                          const isActive = (reviewStates[row.url] ?? null) === opt.key;
                          const c = dark ? opt.darkColor : opt.color;
                          const obg = dark ? opt.darkBg : opt.bg;
                          return (
                            <button key={opt.key}
                              onClick={() => handleStatusSelect(row.url, isActive ? null : opt.key)}
                              disabled={checkLocked || savingUrl === row.url}
                              title={checkLocked ? "🔒 잠금 해제 후 선택" : opt.label}
                              style={{ display:"flex", alignItems:"center", gap:4, flex:1,
                                background: isActive ? obg : "transparent",
                                border:`1.5px solid ${isActive ? c : (dark?"#334155":"#e5e7eb")}`,
                                borderRadius:7, padding:"5px 6px", cursor:(checkLocked||savingUrl===row.url)?"not-allowed":"pointer",
                                fontFamily:"inherit", opacity:checkLocked?0.6:1, transition:"all 0.15s" }}>
                              <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                                border:`1.5px solid ${c}`, background:isActive?c:"transparent", display:"inline-block" }}/>
                              <span style={{ fontSize:11, fontWeight:700,
                                color:isActive?c:(dark?"#94a3b8":"#6b7280") }}>{opt.short}</span>
                            </button>
                          );
                        })}
                        <button onClick={handleLockToggle}
                          style={{ background:"none", border:`1.5px solid ${checkLocked?"#e5e7eb":"#fbbf24"}`,
                            borderRadius:7, padding:"5px 8px", cursor:"pointer", fontSize:14, lineHeight:1,
                            backgroundColor:checkLocked?"transparent":"rgba(251,191,36,0.1)" }}>
                          {checkLocked?"🔒":"🔓"}
                        </button>
                      </div>
                      {/* 배지 행 */}
                      <div className="m-card-badges">
                        {row.statusItem&&<span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>}
                        {row.docWorkStatusItem&&<span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>}
                        {row.typeItems?.map((t,k)=><span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>)}
                      </div>
                      {/* 출원번호 / 출원인 */}
                      {(row.appNum||row.appOwner)&&(
                        <div className="m-card-info">
                          {row.appNum&&<span className="m-info-item">📋 {renderSingleLine(row.appNum)}</span>}
                          {row.appOwner&&<span className="m-info-item">👤 {renderSingleLine(row.appOwner)}</span>}
                        </div>
                      )}
                      {/* 파일 */}
                      {row.fileLinks&&(
                        <div className="m-card-files">
                          {row.fileLinks.split("\n").filter(Boolean).slice(0,2).map((link,j)=>{
                            const fn=decodeURIComponent(link.split("/").pop());
                            return <a key={j} href={link} target="_blank" rel="noreferrer" className="m-file-link">📄 {fn}</a>;
                          })}
                        </div>
                      )}
                      {/* 댓글 패널 */}
                      {(() => {
                        const panel = commentPanels[i] || {};
                        const isOpen = panel.open && !panel.closing;
                        const isClosing = panel.closing;
                        return (
                          <div style={{ overflow:"hidden",
                            maxHeight:(isOpen||isClosing)?(isClosing?"0px":"600px"):"0px",
                            opacity:isOpen?1:0,
                            transition:"max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
                            marginTop:isOpen?"10px":0 }}>
                            <div style={{ borderTop:dark?"1px solid #334155":"1px solid #c7d2fe", paddingTop:10,
                              display:"flex", flexDirection:"column", gap:8 }}>
                              {panel.loading?(
                                <div style={{fontSize:12,color:"#94a3b8"}}>불러오는 중...</div>
                              ):panel.comments?.length>0?(
                                <div style={{display:"flex",flexDirection:"column",gap:6,
                                  opacity:panel.commentsVisible?1:0,transition:"opacity 0.3s ease"}}>
                                  {panel.comments.map((c,ci)=>(
                                    <div key={ci} style={{background:dark?"#1e293b":"#fff",borderRadius:8,
                                      padding:"8px 10px",border:dark?"1px solid #334155":"1px solid #e0e7ff"}}>
                                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                                        <div style={{display:"flex",flexDirection:"column",gap:1}}>
                                          <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280",fontWeight:600}}>[{c.nickname}] {c.createdAt}</span>
                                          {c.edited&&<span style={{fontSize:10,color:"#9ca3af"}}>[수정됨] {c.editedAt}</span>}
                                        </div>
                                        {(c.nickname===nickname||user?.primaryEmailAddress?.emailAddress==="dlaudwp90@gmail.com")&&(
                                          <div style={{display:"flex",gap:3}}>
                                            <button onClick={()=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],editingId:c.id,editInput:c.content}}))}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#14532d":"#f0fdf4",color:dark?"#86efac":"#166534",
                                                border:"1px solid #bbf7d0",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit"}}>수정</button>
                                            <button onClick={async()=>{if(!confirm("삭제?"))return;
                                              await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",pageId:row.pageId,commentId:c.id})});
                                              const r2=await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get",pageId:row.pageId})});
                                              const d2=await r2.json();
                                              setCommentPanels(prev=>({...prev,[i]:{...prev[i],comments:d2.comments||[]}}));}}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#450a0a":"#fff1f2",color:dark?"#f87171":"#dc2626",
                                                border:"1px solid #fecaca",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit"}}>삭제</button>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{fontSize:13,color:dark?"#e2e8f0":"#1f2937",whiteSpace:"pre-wrap",
                                        borderTop:dark?"1px solid #334155":"1px solid #e0e7ff",paddingTop:4,marginTop:2}}>{c.content}</div>
                                      {panel.editingId===c.id&&(
                                        <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                                          <textarea value={panel.editInput||""} rows={2}
                                            onChange={e=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],editInput:e.target.value}}))}
                                            style={{width:"100%",fontSize:12,border:"1.5px solid #c7d2fe",borderRadius:6,
                                              padding:"6px 8px",outline:"none",fontFamily:"inherit",
                                              background:dark?"#0f172a":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                          <div style={{display:"flex",gap:4}}>
                                            <button onClick={()=>handleEditComment(i,row.pageId,c.id)}
                                              style={{fontSize:11,fontWeight:700,padding:"4px 10px",background:"#13274F",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>수정완료</button>
                                            <button onClick={()=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],editingId:null}}))}
                                              style={{fontSize:11,padding:"4px 10px",background:"none",border:"1px solid #e5e7eb",borderRadius:6,cursor:"pointer",color:"#6b7280",fontFamily:"inherit"}}>취소</button>
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
                                <textarea value={panel.input||""} rows={2} placeholder="댓글 입력 (Enter 등록 / Shift+Enter 줄바꿈)"
                                  onChange={e=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],input:e.target.value}}))}
                                  onKeyDown={e => { /* Enter=줄바꿈, 등록은 버튼으로만 */ }}
                                  style={{width:"100%",fontSize:13,border:"1.5px solid #c7d2fe",borderRadius:8,
                                    padding:"8px 10px",outline:"none",fontFamily:"inherit",
                                    background:dark?"#1e293b":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <button onClick={()=>{if(!panel.saving)handlePostComment(i,row.pageId);}} disabled={panel.saving}
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
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* ── PC 테이블 뷰 ── */}
              <div className="table-outer" ref={tableOuterRef}>
                <table>
                  <thead>
                    <tr>
                      {reviewTh}
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
                      <React.Fragment key={i}>
                      <tr
                        id={`pc-row-${i}`}
                        ref={el => rowRefs.current[i] = el}
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
                                style={{ cursor:"pointer", flexShrink:0, fontSize:14, color:dark?"#818cf8":"#4f46e5",
                                  fontWeight:800, marginLeft:6, userSelect:"none" }}>▲</span>
                            ) : (
                              <span onClick={e => { e.stopPropagation(); toggleCommentPanel(i, row.pageId); }}
                                style={{ cursor:"pointer", flexShrink:0, position:"relative", display:"inline-flex",
                                  alignItems:"center", marginLeft:6,
                                  opacity: commentPanels[i]?.comments?.length > 0 ? 1 : 0.2, transition:"opacity 0.15s" }}
                                title={commentPanels[i]?.comments?.length > 0 ? "댓글 보기" : "댓글 달기"}
                                onMouseEnter={e => e.currentTarget.style.opacity="0.75"}
                                onMouseLeave={e => e.currentTarget.style.opacity = commentPanels[i]?.comments?.length > 0 ? "1" : "0.2"}>
                                <span style={{ fontSize:26, lineHeight:1 }}>💬</span>
                                {commentPanels[i]?.comments?.length > 0 && (
                                  <span style={{ position:"absolute", top:-6, right:-10, background:"#ef4444", color:"#fff",
                                    fontSize:10, fontWeight:800, minWidth:17, height:17, borderRadius:9999,
                                    display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px",
                                    boxShadow:"0 1px 4px rgba(0,0,0,0.25)", lineHeight:1, border:"1.5px solid #fff" }}>
                                    {commentPanels[i].comments.length}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="td-nowrap">
                          {row.typeItems?.length>0 ? (
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                              {row.typeItems.map((t,k)=>(
                                <span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>
                              ))}
                            </div>
                          ) : <span className="dash">—</span>}
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
                            const isExpanded = !!expandedRows[i];
                            const LIMIT = 1;
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
                                            if(isOpen) setFilePopup(null);
                                            else { setPopupPos({x:e.clientX,y:e.clientY}); setFilePopup(pk); }
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
                                    {isExpanded?"↑ 접기":`+${files.length-LIMIT} 더보기`}
                                  </button>
                                )}
                              </div>
                            );
                          })() : <span className="dash">—</span>}
                        </td>

                        <td className={isMultiLine(row.appNum)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.appNum)}
                            {row.appNum && (
                              <button className={`copy-btn${copied[`${i}-a`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.appNum,`${i}-a`)}>
                                {copied[`${i}-a`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className={isMultiLine(row.appOwner)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.appOwner)}
                            {row.appOwner && (
                              <button className={`copy-btn${copied[`${i}-o`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.appOwner,`${i}-o`)}>
                                {copied[`${i}-o`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className={isMultiLine(row.agentCode)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.agentCode)}
                            {row.agentCode && (
                              <button className={`copy-btn${copied[`${i}-c`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.agentCode,`${i}-c`)}>
                                {copied[`${i}-c`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="td-nowrap">
                          <span className="cell-text">{row.deadline||"—"}</span>
                        </td>

                        <td className="td-nowrap">
                          {row.categoryItems?.length>0 ? (
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                              {row.categoryItems.map((c,k)=>(
                                <span key={k} className="badge" style={notionBadgeStyle(c.color,dark)}>{c.name}</span>
                              ))}
                            </div>
                          ) : <span className="dash">—</span>}
                        </td>

                      </tr>

                          {(() => {
                            const panel = commentPanels[i] || {};
                            const isOpen = panel.open && !panel.closing;
                            const isClosing = panel.closing;
                            return (
                              <tr>
                                <td colSpan={11} style={{ padding:0, background:"transparent",
                                  borderBottom: (panel.open || isClosing) ? (dark?"2px solid #1e3a6e":"2px solid #c7d2fe") : "none",
                                  transition:"border-bottom 0.1s ease" }}>
                                  <div style={{ position:"sticky", left:0, width: COL_CHECK_W + 250,
                                    background:dark?"#0f172a":"#eef2ff", borderRadius:"0 0 10px 10px",
                                    overflow:"hidden",
                                    maxHeight: (isOpen || isClosing) ? (isClosing ? "0px" : "900px") : "0px",
                                    opacity: isOpen ? 1 : 0,
                                    transition: "max-height 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease, padding 0.42s ease",
                                    padding: isOpen ? "12px 16px" : "0 16px",
                                    display:"flex", flexDirection:"column", gap:10,
                                    boxShadow: isOpen ? "0 4px 12px rgba(19,39,79,0.08)" : "none" }}>
                                    {panel.loading ? (
                                      <div style={{ fontSize:12, color:"#94a3b8" }}>불러오는 중...</div>
                                    ) : panel.comments?.length > 0 ? (
                                      <div style={{ display:"flex", flexDirection:"column", gap:8,
                                        opacity: panel.commentsVisible ? 1 : 0,
                                        transform: panel.commentsVisible ? "translateY(0)" : "translateY(-6px)",
                                        transition: "opacity 0.3s ease, transform 0.3s ease" }}>
                                        {panel.comments.map((c, ci) => {
                                          const body = c.content;
                                          return (
                                            <div key={ci} style={{ background:dark?"#1e293b":"#fff", borderRadius:8,
                                              padding:"8px 12px", border:dark?"1px solid #334155":"1px solid #e0e7ff", textAlign:"left" }}>
                                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                                                <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                                                  <span style={{ fontSize:11, color:dark?"#94a3b8":"#6b7280", fontWeight:600 }}>[{c.nickname}] {c.createdAt}</span>
                                                  {c.edited && <span style={{ fontSize:10, color:dark?"#6b7280":"#9ca3af" }}>[수정됨] {c.editedAt}</span>}
                                                </div>
                                                {(c.nickname === nickname || user?.primaryEmailAddress?.emailAddress === "dlaudwp90@gmail.com") && (
                                                  <div style={{ display:"flex", gap:4 }}>
                                                    <button onClick={() => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], editingId: c.id, editInput: c.content } }))}
                                                      style={{ fontSize:10, fontWeight:700, background:dark?"#14532d":"#f0fdf4", color:dark?"#86efac":"#166534",
                                                        border:dark?"1px solid #166534":"1px solid #bbf7d0", borderRadius:4, padding:"2px 7px", cursor:"pointer", fontFamily:"inherit" }}>수정</button>
                                                    <button onClick={async () => { if (!confirm("삭제하시겠습니까?")) return;
                                                        await fetch("/api/comments", { method:"POST", headers:{"Content-Type":"application/json"},
                                                          body: JSON.stringify({ action:"delete", pageId:row.pageId, commentId:c.id }) });
                                                        const r2 = await fetch("/api/comments", { method:"POST", headers:{"Content-Type":"application/json"},
                                                          body: JSON.stringify({ action:"get", pageId:row.pageId }) });
                                                        const d2 = await r2.json();
                                                        setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], comments: d2.comments || [] } })); }}
                                                      style={{ fontSize:10, fontWeight:700, background:dark?"#450a0a":"#fff1f2", color:dark?"#f87171":"#dc2626",
                                                        border:dark?"1px solid #dc2626":"1px solid #fecaca", borderRadius:4, padding:"2px 7px", cursor:"pointer", fontFamily:"inherit" }}>삭제</button>
                                                  </div>
                                                )}
                                              </div>
                                              <div style={{ fontSize:13, color:dark?"#e2e8f0":"#1f2937", whiteSpace:"pre-wrap", textAlign:"left",
                                                borderTop:dark?"1px solid #334155":"1px solid #e0e7ff", paddingTop:6, marginTop:2 }}>{body}</div>
                                              {commentPanels[i]?.editingId === c.id && (
                                                <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                                                  <textarea value={commentPanels[i]?.editInput || ""}
                                                    onChange={e => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], editInput: e.target.value } }))}
                                                    onKeyDown={e => { /* Enter=줄바꿈 */ }}
                                                    rows={2} style={{ width:"100%", fontSize:13, border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                                      borderRadius:8, padding:"6px 10px", outline:"none", fontFamily:"inherit",
                                                      background:dark?"#0f172a":"#fff", color:dark?"#e2e8f0":"#1f2937", boxSizing:"border-box" }} />
                                                  <div style={{ display:"flex", gap:6 }}>
                                                    <button onClick={() => handleEditComment(i, row.pageId, c.id)}
                                                      style={{ fontSize:11, fontWeight:700, padding:"4px 12px", background:"#13274F", color:"#fff", border:"none", borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>수정 완료</button>
                                                    <button onClick={() => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], editingId: null } }))}
                                                      style={{ fontSize:11, fontWeight:700, padding:"4px 12px", background:"none", border:dark?"1px solid #334155":"1px solid #e5e7eb", borderRadius:6, cursor:"pointer", color:dark?"#94a3b8":"#6b7280", fontFamily:"inherit" }}>취소</button>
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
                                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                      <textarea value={panel.input || ""}
                                        onChange={e => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], input: e.target.value } }))}
                                        onKeyDown={e => { /* Enter=줄바꿈, 등록은 버튼으로만 */ }}
                                        placeholder="댓글 입력 (Enter 등록 / Shift+Enter 줄바꿈)" rows={2}
                                        style={{ width:"100%", fontSize:13, border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                          borderRadius:8, padding:"8px 10px", outline:"none", resize:"vertical",
                                          fontFamily:"inherit", background:dark?"#1e293b":"#fff", color:dark?"#e2e8f0":"#1f2937", boxSizing:"border-box" }} />
                                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                        <button onClick={() => handlePostComment(i, row.pageId)} disabled={panel.saving}
                                          style={{ padding:"6px 18px", background:"#13274F", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700,
                                            cursor:panel.saving?"not-allowed":"pointer", fontFamily:"inherit" }}>
                                          {panel.saving ? "저장 중..." : "등록"}
                                        </button>
                                        {panel.saved && <span style={{ fontSize:11, color:"#16a34a", fontWeight:700 }}>✓ 저장됐습니다</span>}
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

              {/* 더보기 버튼 */}
              {hasMore && (
                <div className="load-more-area" ref={bottomRef}>
                  <div className="load-more-info">
                    <span className="lm-loaded">{results.length}건 표시 중</span>
                    {remainingCount !== null && (
                      <span className="lm-remaining">/ 남은 문서 {remainingCount}건</span>
                    )}
                  </div>
                  <div className="load-more-btns">
                    <button className="lm-btn lm-btn-page" onClick={()=>fetchPage(nextCursor)} disabled={loadingMore||loadingAll}>
                      {loadingMore ? <><span className="lm-spin"/>불러오는 중...</> : <>⬇ 25개 더 불러오기</>}
                    </button>
                    <button className="lm-btn lm-btn-all" onClick={fetchAllRemaining} disabled={loadingMore||loadingAll}>
                      {loadingAll ? <><span className="lm-spin"/>전체 불러오는 중...</> : <>⬇ 남은 {remainingCount!==null?`${remainingCount}개 `:""}전체 보기</>}
                    </button>
                  </div>
                </div>
              )}

              {!hasMore && results.length > 0 && (
                <p className="all-loaded">✅ 전체 {results.length}건 모두 표시되었습니다</p>
              )}

              <div className="notion-db-wrap">
                <button className="notion-db-btn"
                  onClick={()=>window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a","_blank")}>
                  📋 G&A IP 문서 DB 전체 보기 (Notion)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Noto Sans KR','Malgun Gothic',sans-serif; min-height:100vh; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .mobile-cards { display:none; flex-direction:column; gap:8px; width:100%; }
        .m-card { border-radius:12px; padding:12px 14px; border:1px solid #e5e9f5;
          box-shadow:0 1px 6px rgba(19,39,79,0.07); display:flex; flex-direction:column; gap:6px; }
        .dark .m-card { border-color:#334155; }
        .m-card-top { display:flex; align-items:center; gap:6px; }
        .m-card-icon { font-size:14px; flex-shrink:0; }
        .m-card-title { color:#1a3a8f; font-weight:700; font-size:14px; cursor:pointer;
          text-decoration:underline; flex:1; line-height:1.3; }
        .dark .m-card-title { color:#93c5fd; }
        .m-review-row { display:flex; gap:4px; align-items:center; }
        .m-card-badges { display:flex; flex-wrap:wrap; gap:4px; }
        .m-card-info { display:flex; flex-direction:column; gap:2px; }
        .m-info-item { font-size:12px; color:#6b7280; }
        .dark .m-info-item { color:#94a3b8; }
        .m-card-files { display:flex; flex-direction:column; gap:3px; }
        .m-file-link { font-size:12px; color:#1a3a8f; background:#eef1fb; border-radius:5px;
          padding:3px 8px; text-decoration:none; display:inline-block; }
        .dark .m-file-link { background:#1e3a6e; color:#93c5fd; }
        @media (max-width: 768px) {
          .mobile-cards { display:flex; }
          .table-outer { display:none; }
        }
        @keyframes slideUpFade { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box;
          animation:slideUpFade .7s ease both; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }

        .theme-toggle { position:fixed; top:16px; right:20px; z-index:400; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .theme-toggle { border-color:#475569; }
        .back-btn { position:absolute; top:20px; left:20px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s;
          font-weight:700; color:#1a3a8f; font-family:inherit; }
        .dark .back-btn { border-color:#475569; color:#93c5fd; }
        .back-btn:hover { border-color:#1a3a8f; }
        .dark .back-btn:hover { border-color:#93c5fd; }

        .logo-area { margin-top:8vh; margin-bottom:8px; text-align:center; }
        .logo-wrap { display:inline-block; text-align:center; }
        .logo-top-rule { width:380px; height:1px; background:#13274F; margin:0 auto 12px; }
        .logo-main { font-family:'EB Garamond',serif; font-size:38px; font-weight:700; color:#13274F; letter-spacing:-0.5px; line-height:1.1; margin:0; }
        .dark .logo-main { color:#e2e8f0; }
        .logo-sub-en { font-size:11px; color:#13274F; letter-spacing:6px; margin:6px 0 10px; text-transform:uppercase; }
        .dark .logo-sub-en { color:#94a3b8; }
        .logo-mid-rule { width:220px; height:1px; background:#13274F; margin:0 auto 10px; }
        .dark .logo-mid-rule { background:#475569; }
        .logo-sub-kr { font-family:'Noto Serif KR',serif; font-size:18px; font-weight:700; color:#13274F; letter-spacing:2px; margin:0 0 10px; }
        .dark .logo-sub-kr { color:#e2e8f0; }
        .logo-bot-rule { width:380px; height:1px; background:#13274F; margin:0 auto; }
        .dark .logo-top-rule,.dark .logo-bot-rule { background:#475569; }

        .page-title-wrap { text-align:center; margin:20px 0 16px; }
        .page-title { font-size:22px; font-weight:800; color:#13274F; margin-bottom:8px; }
        .dark .page-title { color:#e2e8f0; }
        .page-subtitle { font-size:13px; color:#6b7280; }
        .total-badge { background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:5px; font-weight:700; font-size:12px; margin-left:6px; }
        .dark .total-badge { background:#1e3a6e; color:#93c5fd; }

        .results { width:100%; max-width:1300px; padding-bottom:60px; }
        .loading { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f; border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon { font-size:48px; } .no-text { font-size:18px; font-weight:600; margin-top:12px; }

        .count-row { display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:12px; gap:10px; flex-wrap:wrap; }
        .count { color:#6b7280; font-size:13px; margin-bottom:0; }
        .lock-guide { font-size:12px; font-weight:700; color:#d97706; }
        .dark .lock-guide { color:#fbbf24; }

        /* ── 테이블: 양방향 스크롤 + sticky 고정 ── */
        .table-outer { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(26,58,143,0.08);
          overflow:auto; height:65vh; min-height:280px; border:1px solid #e5e9f5; }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }

        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700;
          font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15);
          position:sticky; top:0; z-index:3; }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }

        /* 문서 제목 th — left:COL_CHECK_W sticky */
        .th-title { position:sticky; left:${COL_CHECK_W}px; top:0; z-index:5;
          background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.3) !important; }
        .dark .th-title { background:#1e3a6e; }

        .result-row { transition:background .12s; }
        .result-row:hover td { background:#f0f4ff; }
        .dark .result-row:hover td { background:#1e3a5f; }

        td { padding:10px 16px; border-bottom:1.5px solid #dde3f5; border-right:1px solid #edf0fb;
          white-space:nowrap; text-align:center; vertical-align:middle; background:inherit; }
        td:last-child { border-right:none; }
        .dark td { border-bottom-color:#2a3a55; border-right-color:#222e42; }

        /* 문서 제목 td — left:COL_CHECK_W sticky */
        .td-title-col { position:sticky; left:${COL_CHECK_W}px; z-index:2;
          border-right:2px solid #dde3f5 !important; }
        .dark .td-title-col { border-right-color:#2a3a55 !important; }
        .row-even .td-title-col { background:#fff; }
        .row-odd  .td-title-col { background:#f7f8ff; }
        .dark .row-even .td-title-col { background:#1e293b; }
        .dark .row-odd  .td-title-col { background:#172035; }
        .result-row:hover .td-title-col { background:#f0f4ff !important; }
        .dark .result-row:hover .td-title-col { background:#1e3a5f !important; }

        .row-odd  { background:#f7f8ff; }
        .row-even { background:#fff; }
        .dark .row-odd  { background:#172035; }
        .dark .row-even { background:#1e293b; }

        .td-nowrap { vertical-align:middle; text-align:center; }
        .td-top { vertical-align:top; padding-top:10px; text-align:left; }
        .td-files { vertical-align:middle; text-align:left; min-width:200px; }
        .cell-inner { display:flex; align-items:center; justify-content:center; gap:6px; }
        .doc-icon { font-size:14px; flex-shrink:0; }
        .doc-title { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:0.75; }
        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .dash { color:#d1d5db; }

        .file-expand-wrap { display:flex; width:100%; align-items:flex-start; justify-content:space-between; gap:8px; }
        .expand-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:2px 6px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit;
          transition:background .15s; white-space:nowrap; }
        .expand-btn:hover { background:#d0d9f0; }
        .expand-btn.expanded { background:#e0f2fe; color:#0369a1; }
        .dark .expand-btn { background:#1e3a6e; color:#93c5fd; }

        .copy-wrap { display:inline-flex; align-items:flex-start; gap:6px; }
        .cell-text { font-size:12px; color:#6b7280; white-space:nowrap; }
        .dark .cell-text { color:#94a3b8; }
        .indent-block { display:flex; flex-direction:column; gap:3px; text-align:left; }
        .first-line,.indent-line { font-size:12px; color:#6b7280; white-space:nowrap; }
        .indent-line { padding-left:16px; }
        .dark .first-line,.dark .indent-line { color:#94a3b8; }
        .copy-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:2px 7px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
        .copy-btn:hover { background:#d0d9f0; }
        .copy-btn.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn { background:#1e3a6e; color:#93c5fd; }
        .dark .copy-btn.copied { background:#14532d; color:#86efac; }
        .file-links { display:flex; flex-direction:column; gap:4px; }
        .file-link-wrap { position:relative; display:inline-block; }
        .file-link { font-size:12px; color:#1a3a8f; padding:3px 8px; background:#eef1fb; border-radius:5px;
          white-space:nowrap; display:inline-block; cursor:pointer; user-select:none; transition:background .15s; }
        .file-link:hover,.file-link.active { background:#d0d9f0; }
        .dark .file-link { background:#1e3a6e; color:#93c5fd; }
        .dark .file-link:hover,.dark .file-link.active { background:#2a4a8e; }

        .load-more-area { margin-top:20px; padding:20px; background:#fff; border-radius:16px;
          border:1px solid #e5e9f5; box-shadow:0 2px 12px rgba(26,58,143,0.06); text-align:center; }
        .dark .load-more-area { background:#1e293b; border-color:#334155; }
        .load-more-info { margin-bottom:14px; font-size:13px; color:#6b7280; display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap; }
        .lm-loaded { font-weight:600; color:#374151; }
        .dark .lm-loaded { color:#d1d5db; }
        .lm-remaining { color:#1a3a8f; font-weight:600; }
        .dark .lm-remaining { color:#93c5fd; }
        .load-more-btns { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .lm-btn { display:flex; align-items:center; gap:7px; border:none; border-radius:12px; padding:12px 22px;
          font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; white-space:nowrap; }
        .lm-btn:disabled { opacity:0.55; cursor:not-allowed; }
        .lm-btn-page { background:#eef1fb; color:#1a3a8f; border:2px solid #c7d2fe; }
        .lm-btn-page:hover:not(:disabled) { background:#dde5fb; border-color:#818cf8; }
        .dark .lm-btn-page { background:#1e3a6e; color:#93c5fd; border-color:#334155; }
        .lm-btn-all { background:#1a3a8f; color:#fff; box-shadow:0 2px 10px rgba(26,58,143,0.25); }
        .lm-btn-all:hover:not(:disabled) { background:#0d1e3d; }
        .dark .lm-btn-all { background:#2a4a8e; }
        .lm-spin { width:14px; height:14px; border:2px solid rgba(255,255,255,0.4); border-top:2px solid #fff;
          border-radius:50%; animation:spin .7s linear infinite; display:inline-block; flex-shrink:0; }
        .lm-btn-page .lm-spin { border-color:rgba(26,58,143,0.25); border-top-color:#1a3a8f; }

        .all-loaded { text-align:center; margin-top:16px; color:#16a34a; font-size:13px; font-weight:600; padding:10px; }
        .dark .all-loaded { color:#4ade80; }

        .notion-db-wrap { text-align:center; margin-top:24px; padding-bottom:20px; }
        .notion-db-btn { background:#fff; color:#1e3a8a; border:2px solid #c7d2fe; border-radius:28px;
          padding:12px 28px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;
          box-shadow:0 2px 10px rgba(99,102,241,0.12); transition:all .2s; }
        .notion-db-btn:hover { background:#eef2ff; border-color:#4f46e5; }
        .dark .notion-db-btn { background:#1e293b; color:#818cf8; border-color:#334155; }

        @media (max-width:480px) {
          .logo-main { font-size:28px; }
          .logo-top-rule,.logo-bot-rule { width:260px; }
          .logo-sub-kr { font-size:14px; }
          .back-btn { top:12px; left:12px; width:34px; height:34px; font-size:15px; }
          .theme-toggle { top:12px; right:12px; width:34px; height:34px; font-size:15px; }
          .dark .theme-toggle { border-color:#475569; }
        }
      `}</style>
    </>
  );
}
