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

// ─── 그룹 이름 번역 (영어 → 한글) ───
const GROUP_NAME_KR = {
  "To-do": "할 일", "To Do": "할 일",
  "In progress": "진행 중", "In Progress": "진행 중",
  "Complete": "완료", "Completed": "완료", "Done": "완료",
  "할 일": "할 일", "진행 중": "진행 중", "완료": "완료",
};
const translateGroup = (name) => GROUP_NAME_KR[name] || name;

// ─── 정렬 옵션 ───
const SORT_OPTIONS = [
  { key: "created_desc", label: "생성 순서 (최신순)" },
  { key: "edited_desc",  label: "최근 편집 순 (최신순)" },
  { key: "deadline_asc", label: "마감일 (가까운순)" },
];

function fmtCountdown(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── 부분복사 + 연도복사: 필드별 핵심 숫자 추출 ───────────────────────────
// appNum(출원번호)   "40-2026-0075516 (26.04.16)" → 연도 "2026" / 부분 "0075516"
// appOwner(출원인)   "김은희(4-2026-030277-6)"    → 연도 "2026" / 부분 "030277"
// agentCode(대리인)  "2026-017894-2"              → 연도 "2026" / 부분 "017894"
// 추출 실패 시 각 값은 null — 버튼 미표시
const extractCopyExtras = (line, field) => {
  if (!line) return { year: null, partial: null };
  const t = line.trim();
  let m = null;
  if (field === "appNum") {
    m = t.match(/\d{2}-(\d{4})-(\d{7})\b/);
  } else if (field === "appOwner") {
    m = t.match(/\(\s*\d-(\d{4})-(\d{6})-\d\s*\)/);
  } else if (field === "agentCode") {
    m = t.match(/\b(\d{4})-(\d{6})-\d\b/);
  }
  return m ? { year: m[1], partial: m[2] } : { year: null, partial: null };
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
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [tabView, setTabView] = useState("auto");
  const [viewType, setViewType] = useState("table");
  const [fadeVisible, setFadeVisible] = useState(true);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const [tableVisible, setTableVisible] = useState(false);

  // ─── 필터 상태 ───
  const [sortKey, setSortKey] = useState("created_desc");
  const [filters, setFilters] = useState({
    types: [], statuses: [], docWorkStates: [], categories: [], productClasses: [],
  });
  const [dbOptions, setDbOptions] = useState({
    types: [], statuses: [], statusGroups: [],
    docWorkStates: [], docWorkStateGroups: [],
    categories: [], productClasses: [],
  });
  // ── 상품류별 건수 (count.js에서 집계) ──
  const [classCounts, setClassCounts] = useState({});
  const [dbOptionsStatus, setDbOptionsStatus] = useState("loading"); // "loading" | "ok" | "error"
  const [dbOptionsError, setDbOptionsError] = useState("");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterBarCollapsed, setFilterBarCollapsed] = useState(false);
  const sortDropdownRef = useRef(null);
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

  // ── 실시간 폴링 ──
  const resultsRef   = useRef([]);
  const isPollingRef = useRef(false);
  const [pollToast, setPollToast] = useState(null); // { text, type: "update"|"new" }

  // 시스템 다크모드 변경 자동 감지
  const switchViewType = (next) => {
    if (next === viewType) return;
    setFadeVisible(false);
    setTimeout(() => { setViewType(next); setFadeVisible(true); }, 280);
  };

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

  useEffect(() => {
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.primaryEmailAddress.emailAddress }),
    }).then(r => r.json()).then(d => { setNickname(d.nickname || null); setNickInput(d.nickname || ""); });
  }, [user]);

  // ── 개인 설정 (viewType / dark / tabView) 로드·저장 ──
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
          if (typeof d.prefs.viewType === "string") setViewType(d.prefs.viewType);
          if (typeof d.prefs.dark === "boolean")    setDark(d.prefs.dark);
          if (typeof d.prefs.tabView === "string")  setTabView(d.prefs.tabView);
        }
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!prefsLoaded) return;
    if (!user?.primaryEmailAddress?.emailAddress) return;
    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.primaryEmailAddress.emailAddress,
        prefs: { viewType, dark, tabView },
      }),
    }).catch(() => {});
  }, [viewType, dark, tabView, prefsLoaded, user]);

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
    let id;
    if (isMobile) id = `m-card-${idx}`;
    else if (viewType === "card") id = `pc-card-${idx}`;
    else id = `pc-row-${idx}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    return false;
  };

  // 알림 클릭 → 해당 행 스크롤 + 댓글 패널 (없으면 자동으로 더 불러오기)
  const handleNotifClick = (notif) => {
    setNotifOpen(false);
    setTargetPageId(notif.pageId);
  };

  // 찾고 있는 pageId (알림 클릭 또는 openComment 쿼리)
  const [targetPageId, setTargetPageId] = useState(null);

  // 이동 배너 (모두 불러왔는데도 못 찾은 경우)
  const [jumpTarget, setJumpTarget] = useState(null);

  // 라우터 쿼리의 openComment를 targetPageId로 승격
  useEffect(() => {
    const { openComment } = router.query || {};
    if (openComment) setTargetPageId(openComment);
  }, [router.query]);

  // targetPageId가 설정되면 results에서 찾고, 없으면 다음 페이지 자동 로드
  useEffect(() => {
    if (!targetPageId || !results?.length) return;

    const idx = results.findIndex(r => r.pageId === targetPageId);

    if (idx >= 0) {
      // 찾음 - 댓글 패널 열고 스크롤
      const pid = targetPageId;
      setTargetPageId(null); // 중복 실행 방지
      toggleCommentPanel(idx, pid);
      const tryScroll = (attempt = 0) => {
        if (scrollToIdx(idx)) {
          setJumpTarget(null);
        } else if (attempt < 12) {
          setTimeout(() => tryScroll(attempt + 1), 150);
        } else {
          const row = results[idx];
          setJumpTarget({ idx, pageId: pid, title: row?.title || "문서" });
        }
      };
      setTimeout(() => tryScroll(), 300);
    } else if (hasMore && !loadingMore && !loadingAll && nextCursor) {
      // 못 찾음 + 더 있음 → 자동으로 다음 페이지 로드 (다시 이 useEffect가 재실행됨)
      fetchPage(nextCursor);
    } else if (!hasMore) {
      // 전부 불러왔는데도 없음 → 포기
      setTargetPageId(null);
    }
  }, [targetPageId, results, hasMore, loadingMore, loadingAll]);

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

  // ── resultsRef: 폴링 클로저에서 최신 results 참조 ──
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // ── 노션 데이터 실시간 폴링 (30초) ──
  useEffect(() => {
    if (loading) return; // 초기 로드 중엔 폴링 불필요

    const pollNotionData = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch("/api/all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "page",
            sort: "edited_desc",  // 최근 편집 순으로 변경사항 탐지
            filters,              // 현재 필터 그대로 적용
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const polled = data.results || [];
        if (!polled.length) return;

        const current = resultsRef.current;
        if (!current.length) return;

        // pageId → {row, idx} 맵
        const currentMap = new Map(current.map((r, i) => [r.pageId, { row: r, idx: i }]));

        let updatedCount = 0;
        const newItems = [];

        for (const polledRow of polled) {
          const existing = currentMap.get(polledRow.pageId);
          if (existing) {
            // lastEditedTime 비교 — 더 최신이면 업데이트
            if (polledRow.lastEditedTime && polledRow.lastEditedTime > (existing.row.lastEditedTime || "")) {
              updatedCount++;
            }
          } else {
            // 현재 목록에 없는 신규 항목
            newItems.push(polledRow);
          }
        }

        if (updatedCount === 0 && newItems.length === 0) return;

        // results 업데이트
        setResults(prev => {
          const prevMap = new Map(prev.map((r, i) => [r.pageId, i]));
          const updated = [...prev];

          // 기존 항목 데이터 in-place 업데이트
          for (const polledRow of polled) {
            const idx = prevMap.get(polledRow.pageId);
            if (idx !== undefined) {
              if (polledRow.lastEditedTime && polledRow.lastEditedTime > (updated[idx].lastEditedTime || "")) {
                updated[idx] = { ...updated[idx], ...polledRow };
              }
            }
          }

          // 신규 항목 맨 위에 추가
          return newItems.length > 0 ? [...newItems, ...updated] : updated;
        });

        // 토스트 표시
        const toastText = newItems.length > 0
          ? `✦ ${newItems.length}건 새로 추가됨`
          : `↻ ${updatedCount}건 업데이트됨`;
        const toastType = newItems.length > 0 ? "new" : "update";
        setPollToast({ text: toastText, type: toastType });
        setTimeout(() => setPollToast(null), 3500);

      } catch {
        // 폴링 실패는 무시 (사용자 방해 없이)
      } finally {
        isPollingRef.current = false;
      }
    };

    const id = setInterval(pollNotionData, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filters]);

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

  // ── DB 옵션 로드 (최초 1회 + 재시도 가능) ──
  const loadDbOptions = useCallback(() => {
    setDbOptionsStatus("loading");
    setDbOptionsError("");
    fetch("/api/db-options")
      .then(async r => {
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${text.slice(0, 120)}`);
        try { return JSON.parse(text); }
        catch { throw new Error(`JSON 파싱 실패 — 응답이 HTML일 수 있음 (api 배포 확인): ${text.slice(0, 80)}`); }
      })
      .then(d => {
        if (d.error) throw new Error(d.error);
        setDbOptions(d);
        setDbOptionsStatus("ok");
        console.log("[db-options] loaded:", d);
      })
      .catch(err => {
        console.error("[db-options] error:", err);
        setDbOptionsError(err.message || String(err));
        setDbOptionsStatus("error");
      });
  }, []);

  useEffect(() => { loadDbOptions(); }, [loadDbOptions]);

  // ── 최초 로드 + 필터/정렬 변경 시 재조회 ──
  useEffect(() => {
    // 기존 결과 초기화
    setResults([]);
    setHasMore(false);
    setNextCursor(null);
    setTableVisible(false);
    setExpandedRows({});
    setCommentPanels({});
    fetchPage(null, true);
  }, [sortKey, filters]);

  // ── totalCount는 DB 전체 기준이므로 최초 1회만 ──
  useEffect(() => {
    fetchTotalCount();
  }, []);

  // ── 정렬 드롭다운 외부 클릭 닫기 ──
  useEffect(() => {
    if (!sortDropdownOpen) return;
    const h = e => {
      if (sortDropdownRef.current?.contains(e.target)) return;
      setSortDropdownOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [sortDropdownOpen]);

  // ── 필터 토글 헬퍼 ──
  const toggleFilter = (category, value) => {
    setFilters(prev => {
      const cur = prev[category] || [];
      const next = cur.includes(value)
        ? cur.filter(v => v !== value)
        : [...cur, value];
      return { ...prev, [category]: next };
    });
  };

  const clearFilterCategory = (category) => {
    setFilters(prev => ({ ...prev, [category]: [] }));
  };

  const clearAllFilters = () => {
    setFilters({ types: [], statuses: [], docWorkStates: [], categories: [], productClasses: [] });
  };

  const hasAnyFilter =
    filters.types.length || filters.statuses.length ||
    filters.docWorkStates.length || filters.categories.length || filters.productClasses.length;

  // 상표 선택된 경우에만 상품류 하위 필터 노출
  const showProductClass = filters.types.includes("상표");

  const fetchPage = async (cursor, isInitial = false) => {
    if (isInitial) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch("/api/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor, mode: "page", sort: sortKey, filters }),
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
        body: JSON.stringify({ cursor: nextCursor, mode: "all", sort: sortKey, filters }),
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
      if (res.ok) {
        setTotalCount(data.count);
        if (data.classCounts) setClassCounts(data.classCounts);
      }
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
                scrollToIdx(jumpTarget.idx);
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
                padding:"0 4px", border:"2px solid #fff", lineHeight:1 }}>N</span>
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

          {/* 테마 버튼 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <button onClick={()=>setDark(!dark)} title={dark?"라이트 모드":"다크 모드"}
            style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
              width:40, height:40, fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"border-color .2s", flexShrink:0 }}>
            {dark?"☀️":"🌙"}
          </button>
          <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>{dark?"라이트모드":"다크모드"}</span>
          </div>

          {/* 태블릿 뷰 토글 */}
          <button
            className="view-toggle-btn"
            title={tabView==="mobile"?"PC 뷰로 전환":tabView==="pc"?"자동 전환":"모바일 뷰로 전환"}
            onClick={() => setTabView(v => v==="auto"?"mobile":v==="mobile"?"pc":"auto")}
            style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:"50%",
              width:40, height:40, fontSize:18, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"border-color .2s", flexShrink:0 }}>
            {tabView==="mobile"?"🖥️":tabView==="pc"?"📱":"⇄"}
          </button>

          {/* 카드/표 전환 버튼 - 가장 오른쪽 */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <button
            title={viewType==="table"?"카드 뷰로 전환":"표 뷰로 전환"}
            onClick={() => switchViewType(viewType==="table"?"card":"table")}
            style={{ background:"none", border:"2px solid #d0d9f0", borderRadius:8,
              width:40, height:40, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:dark?"#94a3b8":"#6b7280", transition:"all .2s", flexShrink:0 }}>
            {viewType==="table" ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor"/>
              <rect x="10" y="1" width="7" height="7" rx="1.5" fill="currentColor"/>
              <rect x="1" y="10" width="7" height="7" rx="1.5" fill="currentColor"/>
              <rect x="10" y="10" width="7" height="7" rx="1.5" fill="currentColor"/>
            </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="2" width="16" height="2.5" rx="1" fill="currentColor"/>
              <rect x="1" y="7" width="16" height="2.5" rx="1" fill="currentColor"/>
              <rect x="1" y="12" width="16" height="2.5" rx="1" fill="currentColor"/>
            </svg>
            )}
          </button>
          <span style={{ fontSize:9, color:dark?"#94a3b8":"#9ca3af", fontWeight:500, whiteSpace:"nowrap", letterSpacing:"0.02em" }}>{viewType==="table"?"카드 뷰":"테이블 뷰"}</span>
          </div>

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

            {/* ── 개인 설정 ── */}
            <div style={{ borderTop:dark?"1px solid #334155":"1px solid #e5e9f5",
              marginTop:4, paddingTop:8 }}>
              <div style={{ fontSize:10, color:dark?"#94a3b8":"#9ca3af", fontWeight:600,
                padding:"0 10px 6px", letterSpacing:"0.04em" }}>
                기본 설정 (자동 저장)
              </div>

              {/* 기본 뷰 */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"4px 10px", fontSize:11, color:dark?"#e2e8f0":"#13274F" }}>
                <span>기본 뷰</span>
                <div style={{ display:"flex", gap:2, border:dark?"1px solid #334155":"1px solid #cbd5e1",
                  borderRadius:6, padding:1, background:dark?"#0f172a":"#f8faff" }}>
                  {[
                    { v:"table", label:"표" },
                    { v:"card",  label:"카드" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setViewType(o.v)}
                      style={{ fontSize:10, fontWeight:600, padding:"3px 8px", borderRadius:4,
                        border:"none", cursor:"pointer", fontFamily:"inherit",
                        background: viewType===o.v ? (dark?"#334155":"#13274F") : "transparent",
                        color: viewType===o.v ? "#fff" : (dark?"#94a3b8":"#6b7280") }}>
                      {o.label}
                    </button>
                  ))}
                </div>
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

              {/* 기기 뷰 */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"4px 10px 8px", fontSize:11, color:dark?"#e2e8f0":"#13274F" }}>
                <span>기기 뷰</span>
                <div style={{ display:"flex", gap:2, border:dark?"1px solid #334155":"1px solid #cbd5e1",
                  borderRadius:6, padding:1, background:dark?"#0f172a":"#f8faff" }}>
                  {[
                    { v:"auto",   label:"자동" },
                    { v:"mobile", label:"모바일" },
                    { v:"pc",     label:"PC" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setTabView(o.v)}
                      style={{ fontSize:10, fontWeight:600, padding:"3px 7px", borderRadius:4,
                        border:"none", cursor:"pointer", fontFamily:"inherit",
                        background: tabView===o.v ? (dark?"#334155":"#13274F") : "transparent",
                        color: tabView===o.v ? "#fff" : (dark?"#94a3b8":"#6b7280") }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
          <p className="page-subtitle">
            {SORT_OPTIONS.find(s => s.key === sortKey)?.label || "생성 순서"} 기준 · 전체 DB 조회
            {totalCount !== null && <span className="total-badge"> 총 {totalCount}건</span>}
          </p>
        </div>

        {/* ─── 필터 바 ─── */}
        <div className="filter-bar">
          <div className="filter-bar-header">
            <button className="filter-collapse-btn"
              onClick={() => setFilterBarCollapsed(v => !v)}
              title={filterBarCollapsed ? "필터 펼치기" : "필터 접기"}>
              {filterBarCollapsed ? "▸" : "▾"} 필터 / 정렬
              {hasAnyFilter ? <span className="filter-dot">●</span> : null}
            </button>
            {hasAnyFilter && !filterBarCollapsed && (
              <button className="filter-clear-all-btn" onClick={clearAllFilters}>전체 해제</button>
            )}
          </div>

          {!filterBarCollapsed && (
            <div className="filter-body">
              {dbOptionsStatus === "error" && (
                <div className="db-error-banner">
                  <div className="db-error-title">⚠ 필터 옵션을 불러오지 못했습니다</div>
                  <div className="db-error-msg">{dbOptionsError}</div>
                  <div className="db-error-hint">
                    1) <code>pages/api/db-options.js</code> 파일이 배포됐는지 확인<br/>
                    2) 브라우저에서 <code>/api/db-options</code>를 직접 열어 응답 확인<br/>
                    3) Vercel 환경변수(NOTION_API_KEY, NOTION_DB_ID) 확인
                  </div>
                  <button className="db-error-retry" onClick={loadDbOptions}>🔄 다시 시도</button>
                </div>
              )}
              {/* 정렬 드롭다운 */}
              <div className="filter-row" ref={sortDropdownRef}>
                <span className="filter-label">정렬</span>
                <button className={`sort-dropdown-btn${sortDropdownOpen ? " open" : ""}`}
                  onClick={() => setSortDropdownOpen(v => !v)}>
                  {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
                  <span className="dropdown-arrow">{sortDropdownOpen ? "▴" : "▾"}</span>
                </button>
              </div>
              {/* 정렬 인라인 확장 메뉴 (filter-bar가 부드럽게 확장됨) */}
              <div className={`sort-menu-wrap${sortDropdownOpen ? " open" : ""}`}>
                <div className="sort-menu-inner">
                  {SORT_OPTIONS.map(opt => (
                    <button key={opt.key}
                      className={`sort-option${sortKey === opt.key ? " active" : ""}`}
                      onClick={() => { setSortKey(opt.key); setSortDropdownOpen(false); }}>
                      {opt.label}
                      {sortKey === opt.key && <span style={{marginLeft:6}}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* 유형 필터 */}
              <div className="filter-row">
                <span className="filter-label">유형</span>
                <div className="filter-btns">
                  {dbOptions.types.length > 0 ? (
                    <>
                      <button className={`f-btn f-all${!filters.types.length ? " active" : ""}`}
                        onClick={() => clearFilterCategory("types")}>전체</button>
                      {dbOptions.types.map(opt => {
                        const isOn = filters.types.includes(opt.name);
                        const bs = notionBadgeStyle(opt.color, dark);
                        return (
                          <button key={opt.name}
                            className={`f-btn${isOn ? " active" : ""}`}
                            style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                            onClick={() => toggleFilter("types", opt.name)}>
                            {opt.name}
                          </button>
                        );
                      })}
                    </>
                  ) : <span className="filter-empty">{dbOptionsStatus === "error" ? "— 로드 실패 —" : "옵션 불러오는 중..."}</span>}
                </div>
              </div>

              {/* 상품류 (상표 선택 시만) */}
              {showProductClass && (
                <div className="filter-row filter-sub">
                  <span className="filter-label">└ 상품류</span>
                  <div className="filter-btns">
                    {dbOptions.productClasses.length > 0 ? (
                      <>
                        <button className={`f-btn f-all${!filters.productClasses.length ? " active" : ""}`}
                          onClick={() => clearFilterCategory("productClasses")}>전체</button>
                        {dbOptions.productClasses.map(opt => {
                          const isOn = filters.productClasses.includes(opt.name);
                          const bs = notionBadgeStyle(opt.color, dark);
                          const cnt = classCounts[opt.name] || 0;
                          return (
                            <button key={opt.name}
                              className={`f-btn f-btn-class${isOn ? " active" : ""}`}
                              style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                              onClick={() => toggleFilter("productClasses", opt.name)}>
                              {opt.name}
                              {cnt > 0 && <span className="class-count-badge">{cnt}</span>}
                            </button>
                          );
                        })}
                      </>
                    ) : <span className="filter-empty">상품류 옵션 없음</span>}
                  </div>
                </div>
              )}

              {/* 상태 + 서류 통합 — 1행 그룹 배치 (CSS grid로 열 정렬) */}
              {(dbOptions.statusGroups?.length > 0 && dbOptions.docWorkStateGroups?.length > 0) ? (
                <div className="status-combo-grid"
                  style={{ gridTemplateColumns: `60px auto repeat(${Math.max(dbOptions.statusGroups.length, dbOptions.docWorkStateGroups.length)}, auto)` }}>

                  {/* 상태 행 */}
                  <span className="filter-label combo-label">상태</span>
                  <button className={`f-btn f-all${!filters.statuses.length ? " active" : ""}`}
                    onClick={() => clearFilterCategory("statuses")}>전체</button>
                  {dbOptions.statusGroups.map(grp => (
                    <div key={`st-${grp.name}`} className="group-cell">
                      <span className="group-label-mini" style={notionBadgeStyle(grp.color, dark)}>
                        {translateGroup(grp.name)}
                      </span>
                      {grp.options.map(opt => {
                        const isOn = filters.statuses.includes(opt.name);
                        const bs = notionBadgeStyle(opt.color, dark);
                        return (
                          <button key={opt.name}
                            className={`f-btn${isOn ? " active" : ""}`}
                            style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                            onClick={() => toggleFilter("statuses", opt.name)}>
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {/* 서류 행 */}
                  <span className="filter-label combo-label">서류</span>
                  <button className={`f-btn f-all${!filters.docWorkStates.length ? " active" : ""}`}
                    onClick={() => clearFilterCategory("docWorkStates")}>전체</button>
                  {dbOptions.docWorkStateGroups.map(grp => (
                    <div key={`dw-${grp.name}`} className="group-cell">
                      <span className="group-label-mini" style={notionBadgeStyle(grp.color, dark)}>
                        {translateGroup(grp.name)}
                      </span>
                      {grp.options.map(opt => {
                        const isOn = filters.docWorkStates.includes(opt.name);
                        const bs = notionBadgeStyle(opt.color, dark);
                        return (
                          <button key={opt.name}
                            className={`f-btn${isOn ? " active" : ""}`}
                            style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                            onClick={() => toggleFilter("docWorkStates", opt.name)}>
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* fallback — 그룹이 없는 경우 단순 flat 레이아웃 */}
                  <div className="filter-row">
                    <span className="filter-label">상태</span>
                    <div className="filter-btns">
                      {dbOptions.statuses.length > 0 ? (
                        <>
                          <button className={`f-btn f-all${!filters.statuses.length ? " active" : ""}`}
                            onClick={() => clearFilterCategory("statuses")}>전체</button>
                          {dbOptions.statuses.map(opt => {
                            const isOn = filters.statuses.includes(opt.name);
                            const bs = notionBadgeStyle(opt.color, dark);
                            return (
                              <button key={opt.name}
                                className={`f-btn${isOn ? " active" : ""}`}
                                style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                                onClick={() => toggleFilter("statuses", opt.name)}>
                                {opt.name}
                              </button>
                            );
                          })}
                        </>
                      ) : <span className="filter-empty">{dbOptionsStatus === "error" ? "— 로드 실패 —" : "옵션 불러오는 중..."}</span>}
                    </div>
                  </div>
                  <div className="filter-row">
                    <span className="filter-label">서류</span>
                    <div className="filter-btns">
                      {dbOptions.docWorkStates.length > 0 ? (
                        <>
                          <button className={`f-btn f-all${!filters.docWorkStates.length ? " active" : ""}`}
                            onClick={() => clearFilterCategory("docWorkStates")}>전체</button>
                          {dbOptions.docWorkStates.map(opt => {
                            const isOn = filters.docWorkStates.includes(opt.name);
                            const bs = notionBadgeStyle(opt.color, dark);
                            return (
                              <button key={opt.name}
                                className={`f-btn${isOn ? " active" : ""}`}
                                style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                                onClick={() => toggleFilter("docWorkStates", opt.name)}>
                                {opt.name}
                              </button>
                            );
                          })}
                        </>
                      ) : <span className="filter-empty">{dbOptionsStatus === "error" ? "— 로드 실패 —" : "옵션 불러오는 중..."}</span>}
                    </div>
                  </div>
                </>
              )}

              {/* 카테고리 필터 */}
              <div className="filter-row">
                <span className="filter-label">카테고리</span>
                <div className="filter-btns">
                  {dbOptions.categories.length > 0 ? (
                    <>
                      <button className={`f-btn f-all${!filters.categories.length ? " active" : ""}`}
                        onClick={() => clearFilterCategory("categories")}>전체</button>
                      {dbOptions.categories.map(opt => {
                        const isOn = filters.categories.includes(opt.name);
                        const bs = notionBadgeStyle(opt.color, dark);
                        return (
                          <button key={opt.name}
                            className={`f-btn${isOn ? " active" : ""}`}
                            style={isOn ? { background: bs.background, color: bs.color, borderColor: bs.color } : {}}
                            onClick={() => toggleFilter("categories", opt.name)}>
                            {opt.name}
                          </button>
                        );
                      })}
                    </>
                  ) : <span className="filter-empty">{dbOptionsStatus === "error" ? "— 로드 실패 —" : "옵션 불러오는 중..."}</span>}
                </div>
              </div>
            </div>
          )}
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
              <div className="mobile-cards" style={{
              display: viewType==="card" ? "none" : tabView==="pc" ? "none" : tabView==="mobile" ? "flex" : undefined,
              opacity: fadeVisible ? 1 : 0, transition: "opacity 0.28s ease" }}>
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
                      {(row.appNum||row.appOwner||row.agentCode)&&(
                        <div className="m-card-info">
                          {row.appNum&&(
                            <div className="m-info-row">
                              <span className="m-info-label">📋</span>
                              <div style={{flex:1}}>
                                {row.appNum.split("\n").map((line,li)=>{
                                  const ck=`${i}-mn-${li}`;
                                  return (
                                  <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                    <span className="m-info-item">{displayLine(line)}</span>
                                    {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
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
                                    <span className="m-info-item">{displayLine(line)}</span>
                                    {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
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
                                    <span className="m-info-item">{displayLine(line)}</span>
                                    {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
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
                      {/* 파일 */}
                      {row.fileLinks&&(()=>{
                        const mFiles = row.fileLinks.split("\n").filter(Boolean);
                        const mLimit = 1;
                        const mExpanded = !!expandedRows[`m_${i}`];
                        const mShow = mExpanded ? mFiles : mFiles.slice(0, mLimit);
                        return (
                          <div className="m-card-files">
                            {mShow.map((link, j) => {
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
                              <div style={{ overflow:"hidden",
                                maxHeight: mExpanded ? `${(mFiles.length - mLimit) * 40}px` : "0px",
                                transition: "max-height 0.5s cubic-bezier(0.4,0,0.2,1)" }}>
                                {mFiles.slice(mLimit).map((link, j) => {
                                  const fn = decodeURIComponent(link.split("/").pop());
                                  const mpk = `m_${i}_${j+mLimit}`;
                                  const isOpen = filePopup === mpk;
                                  return (
                                    <div key={j} style={{ paddingTop:3 }}>
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
                            )}
                            {mFiles.length > mLimit && (
                              <button className="expand-btn"
                                style={{ marginTop:4, transition:"all 0.3s ease" }}
                                onClick={e => { e.stopPropagation(); setExpandedRows(p => ({ ...p, [`m_${i}`]: !p[`m_${i}`] })); }}>
                                {mExpanded ? "↑ 접기" : `+${mFiles.length - mLimit} 파일더보기`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
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
                              display:"flex", flexDirection:"column", gap:8,
                              maxHeight:360, overflow:"hidden" }}>
                              {panel.loading?(
                                <div style={{fontSize:12,color:"#94a3b8"}}>불러오는 중...</div>
                              ):panel.comments?.length>0?(
                                <div className="comment-scroll" style={{display:"flex",flexDirection:"column",gap:6,
                                  flex:1, minHeight:0, overflowY:"auto",
                                  marginBottom:8,
                                  scrollbarWidth:"thin",
                                  scrollbarColor:dark?"#475569 #1e293b":"#94a3b8 #eef2ff",
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
                              <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                                <textarea value={panel.input||""} rows={2} placeholder="댓글 입력"
                                  enterKeyHint="enter"
                                  onKeyDown={e => { if(e.key==="Enter") e.stopPropagation(); }}
                                  onChange={e=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],input:e.target.value}}))}
                                  
                                  style={{width:"100%",fontSize:13,border:"1.5px solid #c7d2fe",borderRadius:8,
                                    padding:"8px 10px",outline:"none",fontFamily:"inherit",
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
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* ── PC 테이블 뷰 ── */}
              {/* ── PC 카드 그리드 ── */}
              {viewType==="card" && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14,
                  opacity: fadeVisible ? 1 : 0, transition: "opacity 0.28s ease" }}>
                  {results.map((row, i) => (
                    <div key={i} id={`pc-card-${i}`}
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
                        <span onClick={e=>{e.stopPropagation();toggleCommentPanel(i,row.pageId)}}
                          style={{ cursor:"pointer", flexShrink:0, position:"relative",
                            display:"inline-flex", alignItems:"center", marginLeft:6,
                            opacity: commentPanels[i]?.comments?.length>0 ? 1 : 0.2,
                            transition:"opacity 0.15s" }}
                          title={commentPanels[i]?.comments?.length>0?"댓글 보기":"댓글 달기"}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
                          onMouseLeave={e=>e.currentTarget.style.opacity=commentPanels[i]?.comments?.length>0?"1":"0.2"}>
                          <span style={{ fontSize:26, lineHeight:1 }}>💬</span>
                          {commentPanels[i]?.comments?.length>0&&(
                            <span style={{ position:"absolute", top:-6, right:-10,
                              background:"#ef4444", color:"#fff", fontSize:10, fontWeight:800,
                              minWidth:17, height:17, borderRadius:9999,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              padding:"0 4px", boxShadow:"0 1px 4px rgba(0,0,0,0.25)",
                              lineHeight:1, border:"1.5px solid #fff" }}>
                              {commentPanels[i].comments.length}
                            </span>
                          )}
                        </span>
                      </div>
                      {/* Row2: 📄 제목 */}
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{fontSize:14,flexShrink:0}}>📄</span>
                        <span onClick={e=>handleTitleClick(e,row.url)}
                          style={{ fontSize:13, fontWeight:700, color:dark?"#93c5fd":"#1a3a8f",
                            cursor:"pointer", textDecoration:"underline", lineHeight:1.3 }}>
                          {renderSingleLine(row.title)}
                        </span>
                      </div>
                      {/* Row3: 대표검토 버튼 */}
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        {STATUS_OPTIONS.map(opt => {
                          const isActive = (reviewStates[row.url]??null)===opt.key;
                          const c = dark?opt.darkColor:opt.color;
                          const obg = dark?opt.darkBg:opt.bg;
                          return (
                            <button key={opt.key}
                              onClick={()=>handleStatusSelect(row.url,isActive?null:opt.key)}
                              disabled={checkLocked||savingUrl===row.url}
                              style={{ display:"flex", alignItems:"center", gap:3, flex:1,
                                background:isActive?obg:"transparent",
                                border:`1.5px solid ${isActive?c:(dark?"#334155":"#e5e7eb")}`,
                                borderRadius:6, padding:"4px 4px", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                              <span style={{ width:7,height:7,borderRadius:"50%",flexShrink:0,
                                border:`1.5px solid ${c}`,background:isActive?c:"transparent",display:"inline-block"}}/>
                              <span style={{fontSize:10,fontWeight:700,color:isActive?c:(dark?"#94a3b8":"#6b7280")}}>{opt.short}</span>
                            </button>
                          );
                        })}
                        <button onClick={handleLockToggle}
                          style={{ background:"none", border:`1.5px solid ${checkLocked?"#e5e7eb":"#fbbf24"}`,
                            borderRadius:6, padding:"4px 6px", cursor:"pointer", fontSize:12,
                            backgroundColor:checkLocked?"transparent":"rgba(251,191,36,0.1)" }}>
                          {checkLocked?"🔒":"🔓"}
                        </button>
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
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280"}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
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
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280"}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
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
                                  <span style={{fontSize:11,color:dark?"#94a3b8":"#6b7280"}}>{displayLine(line)}</span>
                                  {shouldCopyLine(line) && <button className={`m-copy-btn${copied[ck]?" m-copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                  {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                    const yk = `${ck}-y`, pk = `${ck}-p`;
                                    return (<>
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
                        const panel = commentPanels[i] || {};
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
                                              onClick={e=>{e.stopPropagation();setCommentPanels(prev=>({...prev,[i]:{...prev[i],editingId:prev[i]?.editingId===c.id?null:c.id,editInput:c.content}}));}}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#14532d":"#f0fdf4",color:dark?"#86efac":"#166534",border:"1px solid #bbf7d0",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>수정</button>
                                            <button type="button"
                                              onClick={async e=>{e.stopPropagation();if(!confirm("댓글을 삭제하시겠습니까?"))return;
                                              await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",pageId:row.pageId,commentId:c.id})});
                                              const r2=await fetch("/api/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"get",pageId:row.pageId})});
                                              const d2=await r2.json();
                                              setCommentPanels(prev=>({...prev,[i]:{...prev[i],comments:d2.comments||[]}}));}}
                                              style={{fontSize:9,fontWeight:700,background:dark?"#450a0a":"#fff1f2",color:dark?"#f87171":"#dc2626",border:"1px solid #fecaca",borderRadius:4,padding:"2px 5px",cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>삭제</button>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{fontSize:13,color:dark?"#e2e8f0":"#1f2937",whiteSpace:"pre-wrap"}}>{c.content}</div>
                                      {panel.editingId===c.id&&(
                                        <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                                          <textarea value={panel.editInput||""} rows={2}
                                            onKeyDown={e=>{if(e.key==="Enter")e.stopPropagation();}}
                                            onChange={e=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],editInput:e.target.value}}))}
                                            style={{width:"100%",fontSize:12,border:dark?"1.5px solid #334155":"1.5px solid #c7d2fe",
                                              borderRadius:6,padding:"6px 8px",outline:"none",fontFamily:"inherit",
                                              background:dark?"#0f172a":"#fff",color:dark?"#e2e8f0":"#1f2937",boxSizing:"border-box"}}/>
                                          <div style={{display:"flex",gap:4}}>
                                            <button type="button"
                                              onClick={e=>{e.stopPropagation();handleEditComment(i,row.pageId,c.id);}}
                                              style={{fontSize:11,fontWeight:700,padding:"4px 10px",background:"#13274F",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:10}}>수정완료</button>
                                            <button type="button"
                                              onClick={e=>{e.stopPropagation();setCommentPanels(prev=>({...prev,[i]:{...prev[i],editingId:null}}));}}
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
                                  onChange={e=>setCommentPanels(prev=>({...prev,[i]:{...prev[i],input:e.target.value}}))}
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
                    </div>
                  ))}
                </div>
              )}

              <div className="table-outer" ref={tableOuterRef} style={{
              display: viewType==="card" ? "none" : tabView==="mobile" ? "none" : tabView==="pc" ? "block" : undefined,
              opacity: fadeVisible ? 1 : 0, transition: "opacity 0.28s ease" }}>
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
                          {row.appNum ? (
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              {row.appNum.split("\n").map((line,li)=>{
                                const ck=`${i}-a-${li}`;
                                return (
                                  <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                    <span className="first-line">{displayLine(line)||"\u3000"}</span>
                                    {shouldCopyLine(line) && <button className={`copy-btn${copied[ck]?" copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
                                        {ex.year && <button className={`copy-btn year${copied[yk]?" copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                        {ex.partial && <button className={`copy-btn partial${copied[pk]?" copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                      </>);
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          ) : <span className="dash">—</span>}
                        </td>

                        <td className={isMultiLine(row.appOwner)?"td-top":"td-nowrap"}>
                          {row.appOwner ? (
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              {row.appOwner.split("\n").map((line,li)=>{
                                const ck=`${i}-o-${li}`;
                                return (
                                  <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                    <span className="first-line">{displayLine(line)||"\u3000"}</span>
                                    {shouldCopyLine(line) && <button className={`copy-btn${copied[ck]?" copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
                                        {ex.year && <button className={`copy-btn year${copied[yk]?" copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                        {ex.partial && <button className={`copy-btn partial${copied[pk]?" copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                      </>);
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          ) : <span className="dash">—</span>}
                        </td>

                        <td className={isMultiLine(row.agentCode)?"td-top":"td-nowrap"}>
                          {row.agentCode ? (
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              {row.agentCode.split("\n").map((line,li)=>{
                                const ck=`${i}-c-${li}`;
                                return (
                                  <div key={li} style={{display:"flex",alignItems:"center",gap:4}}>
                                    <span className="first-line">{displayLine(line)||"\u3000"}</span>
                                    {shouldCopyLine(line) && <button className={`copy-btn${copied[ck]?" copied":""}`} onClick={e=>handleCopy(e,line,ck)}>{copied[ck]?"✓":"복사"}</button>}
                                    {(() => { const ex = extractCopyExtras(line, fieldFromCk(ck));
                                      const yk = `${ck}-y`, pk = `${ck}-p`;
                                      return (<>
                                        {ex.year && <button className={`copy-btn year${copied[yk]?" copied":""}`} onClick={e=>handleCopy(e,ex.year,yk)}>{copied[yk]?"✓":"연도"}</button>}
                                        {ex.partial && <button className={`copy-btn partial${copied[pk]?" copied":""}`} onClick={e=>handleCopy(e,ex.partial,pk)}>{copied[pk]?"✓":"부분"}</button>}
                                      </>);
                                    })()}
                                  </div>
                                );
                              })}
                            </div>
                          ) : <span className="dash">—</span>}
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
                                    display:"flex", flexDirection:"column",
                                    boxShadow: isOpen ? "0 4px 12px rgba(19,39,79,0.08)" : "none" }}>
                                    {panel.loading ? (
                                      <div style={{ fontSize:12, color:"#94a3b8" }}>불러오는 중...</div>
                                    ) : panel.comments?.length > 0 ? (
                                      <div className="comment-scroll" style={{ display:"flex", flexDirection:"column", gap:8,
                                        flex:1, minHeight:0, overflowY:"auto",
                                        marginBottom:8,
                                        scrollbarWidth:"thin",
                                        scrollbarColor:dark?"#475569 #1e293b":"#94a3b8 #eef2ff",
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
                                      <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>댓글이 없습니다.</div>
                                    )}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                                      <textarea value={panel.input || ""}
                                        onChange={e => setCommentPanels(prev => ({ ...prev, [i]: { ...prev[i], input: e.target.value } }))}
                                        
                                        placeholder="댓글 입력"
                                  enterKeyHint="enter"
                                  onKeyDown={e => { if(e.key==="Enter") e.stopPropagation(); }} rows={2}
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
        @media (min-width: 769px) and (max-width: 1024px) {
          .view-toggle-btn { display:flex !important; }
        }
        @media (min-width: 1025px), (max-width: 768px) {
          .view-toggle-btn { display:none !important; }
        }
        @media (max-width: 768px) {
          .mobile-cards { display:flex; }
          .table-outer { display:none; }
        }
        @keyframes slideUpFade { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pollToastIn { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box;
          animation:slideUpFade .7s ease both; }
        .dark .comment-scroll::-webkit-scrollbar-track { background: #1e293b; }
        .dark .comment-scroll::-webkit-scrollbar-thumb { background: #475569; }
        .dark .comment-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
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

        /* ─── 필터 바 ─── */
        .filter-bar { width:100%; max-width:1300px; background:#fff; border:1px solid #e5e9f5;
          border-radius:14px; box-shadow:0 2px 10px rgba(19,39,79,0.06);
          margin:0 auto 16px; overflow:hidden; }
        .dark .filter-bar { background:#1e293b; border-color:#334155; }
        .filter-bar-header { display:flex; align-items:center; justify-content:space-between;
          padding:10px 14px; gap:8px; }
        .filter-collapse-btn { background:none; border:none; cursor:pointer; font-family:inherit;
          font-size:13px; font-weight:700; color:#13274F; display:flex; align-items:center; gap:6px; padding:4px 6px; }
        .dark .filter-collapse-btn { color:#e2e8f0; }
        .filter-collapse-btn:hover { color:#1a3a8f; }
        .dark .filter-collapse-btn:hover { color:#93c5fd; }
        .filter-dot { color:#ef4444; font-size:10px; margin-left:4px; }
        .filter-clear-all-btn { background:#fff1f2; color:#dc2626; border:1px solid #fecaca;
          border-radius:6px; padding:4px 10px; font-size:11px; font-weight:700;
          cursor:pointer; font-family:inherit; transition:background .15s; }
        .filter-clear-all-btn:hover { background:#ffe4e6; }
        .dark .filter-clear-all-btn { background:#450a0a; color:#f87171; border-color:#dc2626; }

        .filter-body { padding:4px 14px 12px; display:flex; flex-direction:column; gap:8px;
          border-top:1px solid #f1f5f9; }
        .dark .filter-body { border-top-color:#334155; }
        .filter-row { display:flex; align-items:flex-start; gap:10px; flex-wrap:nowrap; }
        .filter-row.filter-sub { padding-left:12px; }
        .filter-label { font-size:12px; font-weight:700; color:#6b7280;
          min-width:60px; padding-top:6px; flex-shrink:0; }
        .dark .filter-label { color:#94a3b8; }
        .filter-btns { display:flex; flex-wrap:wrap; gap:5px; flex:1; }

        /* ─── 상태 + 서류 통합 grid (열 정렬) ─── */
        .status-combo-grid { display:grid; gap:6px 10px; align-items:center;
          width:100%; padding:2px 0; }
        .status-combo-grid > .combo-label { padding-top:0; align-self:center; }
        .group-cell { display:flex; align-items:center; gap:4px; flex-wrap:wrap;
          padding-left:10px; border-left:1.5px solid #e5e9f5;
          min-height:28px; }
        .dark .group-cell { border-left-color:#334155; }
        .group-label-mini { font-size:9px; padding:2px 6px; border-radius:5px;
          font-weight:800; white-space:nowrap; letter-spacing:-0.3px;
          line-height:1.4; flex-shrink:0; margin-right:2px; }

        /* 좁은 화면: grid을 2열로 바꾸고 그룹들은 라벨 열 건너뛰어 2열로 몰기 */
        @media (max-width:1100px) {
          .status-combo-grid { grid-template-columns: 60px 1fr !important; }
          .status-combo-grid > .group-cell { grid-column:2; }
        }
        @media (max-width:768px) {
          .status-combo-grid { grid-template-columns: auto !important;
            gap:4px; }
          .status-combo-grid > * { grid-column:auto !important; }
          .status-combo-grid > .combo-label { margin-top:4px; }
          .group-cell { padding-left:0; border-left:none; }
          .group-label-mini { font-size:8px; padding:1px 5px; }
        }

        /* ─── 그룹 라인 레이아웃 (fallback용 — status가 아닌 경우) ─── */
        .filter-btns-grouped { display:flex; flex-direction:column; gap:6px; flex:1; }
        .group-line { display:flex; align-items:flex-start; gap:8px; flex-wrap:nowrap; }
        .group-label { font-size:10px; font-weight:700; padding:4px 8px;
          border-radius:6px; min-width:62px; flex-shrink:0; text-align:center;
          white-space:nowrap; line-height:1.5; margin-top:1px; }
        .group-label-ghost { min-width:62px; flex-shrink:0; }
        .group-line-btns { display:flex; flex-wrap:wrap; gap:5px; flex:1; min-width:0; }
        @media (max-width:768px) {
          .group-label { min-width:54px; font-size:9px; padding:3px 6px; }
          .group-label-ghost { min-width:54px; }
        }

        .f-btn { background:#f8faff; border:1.5px solid #e5e9f5; color:#6b7280;
          border-radius:14px; padding:4px 11px; font-size:11px; font-weight:700;
          cursor:pointer; font-family:inherit; transition:all .15s; white-space:nowrap; }
        .f-btn:hover { background:#eef1fb; border-color:#c7d2fe; }
        .f-btn.active { background:#1a3a8f; color:#fff; border-color:#1a3a8f; }
        .f-btn.f-all { background:#fff; color:#9ca3af; border-style:dashed; }
        .f-btn.f-all.active { background:#f3f4f6; color:#13274F; border-style:solid; border-color:#13274F; }
        .dark .f-btn { background:#1e293b; border-color:#334155; color:#94a3b8; }
        .dark .f-btn:hover { background:#2a3a55; border-color:#475569; }
        .dark .f-btn.active { background:#1e3a6e; color:#fff; border-color:#1e3a6e; }
        .dark .f-btn.f-all { background:#1e293b; color:#64748b; }
        .dark .f-btn.f-all.active { background:#2a3a55; color:#e2e8f0; border-color:#475569; }

        /* ─── 상품류 건수 배지 ─── */
        .f-btn-class { position:relative; overflow:visible; margin-right:2px; margin-bottom:3px; }
        .class-count-badge {
          position:absolute; right:-5px; bottom:-6px;
          background:#16a34a; color:#fff;
          font-size:9px; font-weight:800;
          padding:1px 5px; border-radius:9px;
          line-height:1.4; white-space:nowrap;
          pointer-events:none;
          border:1.5px solid #fff;
          box-shadow:0 1px 3px rgba(0,0,0,0.18);
          letter-spacing:-0.2px;
        }
        .dark .class-count-badge { border-color:#1e293b; background:#15803d; }

        /* ─── 정렬 드롭다운 (인라인 확장 방식) ─── */
        .sort-dropdown-btn { background:#f8faff; border:1.5px solid #c7d2fe; color:#1a3a8f;
          border-radius:8px; padding:6px 12px; font-size:12px; font-weight:700;
          cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:8px;
          min-width:200px; justify-content:space-between; transition:border-color .15s, background .15s; }
        .sort-dropdown-btn:hover { border-color:#1a3a8f; }
        .sort-dropdown-btn.open { border-color:#1a3a8f; background:#eef1fb; }
        .dark .sort-dropdown-btn { background:#1e293b; border-color:#334155; color:#93c5fd; }
        .dark .sort-dropdown-btn:hover { border-color:#93c5fd; }
        .dark .sort-dropdown-btn.open { border-color:#93c5fd; background:#1e3a6e; }
        .dropdown-arrow { font-size:10px; color:#6b7280; transition:transform .25s ease; }
        .sort-dropdown-btn.open .dropdown-arrow { transform:rotate(180deg); }

        /* 인라인 확장 메뉴 — filter-bar 내부에서 자연스럽게 자리 차지 */
        .sort-menu-wrap { overflow:hidden; max-height:0;
          transition:max-height .38s cubic-bezier(0.4,0,0.2,1), margin-top .28s ease;
          margin-left:70px; }
        .sort-menu-wrap.open { max-height:400px; margin-top:2px; }
        .sort-menu-inner { display:flex; flex-direction:column; gap:2px;
          padding:5px; background:#f8faff; border:1.5px solid #c7d2fe;
          border-radius:10px; max-width:260px; }
        .dark .sort-menu-inner { background:#0f172a; border-color:#334155; }
        .sort-option { background:none; border:none; cursor:pointer; font-family:inherit;
          font-size:12px; text-align:left; padding:7px 12px; border-radius:6px;
          color:#374151; transition:background .1s; white-space:nowrap; }
        .sort-option:hover { background:#eef1fb; color:#1a3a8f; }
        .sort-option.active { background:#eef1fb; color:#1a3a8f; font-weight:700; }
        .dark .sort-option { color:#cbd5e1; }
        .dark .sort-option:hover { background:#1e3a6e; color:#93c5fd; }
        .dark .sort-option.active { background:#1e3a6e; color:#93c5fd; }

        /* 옵션 로딩 중/없음 메시지 */
        .filter-empty { font-size:11px; color:#9ca3af; font-style:italic;
          padding:4px 2px; align-self:center; }
        .dark .filter-empty { color:#64748b; }

        /* DB 옵션 로드 실패 배너 */
        .db-error-banner { background:#fff1f2; border:1.5px solid #fecaca;
          border-radius:10px; padding:12px 14px; display:flex; flex-direction:column;
          gap:6px; margin-bottom:4px; }
        .dark .db-error-banner { background:#450a0a; border-color:#dc2626; }
        .db-error-title { font-size:13px; font-weight:700; color:#dc2626; }
        .dark .db-error-title { color:#f87171; }
        .db-error-msg { font-size:12px; color:#991b1b; font-family:monospace;
          word-break:break-all; background:rgba(220,38,38,0.08);
          padding:6px 10px; border-radius:6px; }
        .dark .db-error-msg { color:#fecaca; background:rgba(248,113,113,0.08); }
        .db-error-hint { font-size:11px; color:#7f1d1d; line-height:1.6; }
        .db-error-hint code { background:rgba(0,0,0,0.08); padding:1px 5px;
          border-radius:3px; font-size:10.5px; }
        .dark .db-error-hint { color:#fca5a5; }
        .dark .db-error-hint code { background:rgba(255,255,255,0.1); }
        .db-error-retry { align-self:flex-start; background:#dc2626; color:#fff;
          border:none; border-radius:6px; padding:5px 12px; font-size:11px;
          font-weight:700; cursor:pointer; font-family:inherit;
          transition:background .15s; margin-top:4px; }
        .db-error-retry:hover { background:#b91c1c; }

        @media (max-width:768px) {
          .sort-menu-wrap { margin-left:54px; }
          .sort-dropdown-btn { min-width:160px; }
        }

        @media (max-width:768px) {
          .filter-label { min-width:48px; font-size:11px; }
          .sort-dropdown-btn { min-width:140px; font-size:11px; }
          .f-btn { font-size:10px; padding:3px 9px; }
          .filter-row { gap:6px; }
        }

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
