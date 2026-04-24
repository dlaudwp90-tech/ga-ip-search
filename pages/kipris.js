// pages/kipris.js  v3

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// 출원 진행 단계 정의 (순서대로)
const STAGES = [
  { key: "출원접수", label: "출원\n접수", steps: ["출원"] },
  { key: "방식심사", label: "방식\n심사", steps: ["출원"] },
  { key: "실체심사", label: "실체\n심사", steps: ["출원"] },
  { key: "심판",     label: "심판",       steps: ["심판"] },
  { key: "등록",     label: "등록\n완료", steps: ["등록"] },
];

// documentTitle → 진행단계 매핑
function inferStageFromDocs(items) {
  if (!items || items.length === 0) return 0;
  const latestStep = items[items.length - 1]?.step;
  const hasRegNum  = items.some(i => i.registrationNumber?.trim());
  const allTitles  = items.map(i => i.documentTitle).join(" ");

  if (hasRegNum || latestStep === "등록") return 4;
  if (latestStep === "심판") return 3;
  if (allTitles.includes("거절") || allTitles.includes("의견제출") || allTitles.includes("보정")) return 2;
  if (allTitles.includes("출원심사") || allTitles.includes("심사") || allTitles.includes("통지")) return 2;
  if (allTitles.includes("방식")) return 1;
  return 0;
}

const STEP_COLOR = {
  "출원": { bg: "#dbeafe", text: "#1e40af", darkBg: "#1e3a6e", darkText: "#93c5fd" },
  "심판": { bg: "#fce7f3", text: "#9d174d", darkBg: "#500724", darkText: "#f9a8d4" },
  "등록": { bg: "#dcfce7", text: "#166534", darkBg: "#14532d", darkText: "#86efac" },
};

function extractApplicationNumbers(text) {
  return [...new Set((text || "").match(/\d{2}-\d{4}-\d{7}/g) || [])];
}
function isAppNumberInput(text) {
  return /\d{2}-\d{4}-\d{7}/.test(text.trim());
}

// 출원번호 형식 자동 변환: 숫자만 입력 → 하이픈 포맷
function autoFmtAppNum(raw) {
  const s = (raw || "").replace(/\D/g, "");
  if (s.length === 13) return `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}`;
  return raw;
}

export default function KiprisPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);

  // 검색 모드: "appnum" | "trademark"
  const [searchMode, setSearchMode] = useState("appnum");
  const [inputAppNum, setInputAppNum] = useState("");
  const [inputTmName, setInputTmName] = useState("");
  const [inputClass,  setInputClass]  = useState(""); // 상품류 코드
  const [inputSim,    setInputSim]    = useState(""); // 유사군 코드

  const [loading,        setLoading]        = useState(false);
  const [resultMode,     setResultMode]     = useState(null); // "history" | "search"
  const [historyResults, setHistoryResults] = useState({});
  const [searchResults,  setSearchResults]  = useState(null);
  const [searched,       setSearched]       = useState(false);

  const [layout,      setLayout]      = useState("center"); // "center" | "split"
  const [recentList,  setRecentList]  = useState([]);
  const [recentLoad,  setRecentLoad]  = useState(true);
  const [selectedNum, setSelectedNum] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    mq.addEventListener("change", e => setDark(e.matches));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLayout("split"), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/kipris-recent", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(d => setRecentList(d.results || [])).catch(() => {}).finally(() => setRecentLoad(false));
  }, []);

  const c = (light, dk) => dark ? dk : light;
  const isSplit = layout === "split";

  // ── 출원번호 이력 조회 ──
  const doHistory = async (nums) => {
    const newRes = {};
    await Promise.all(nums.map(async num => {
      try {
        const res  = await fetch("/api/kipris", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "history", applicationNumber: num }) });
        const data = await res.json();
        newRes[num] = data;
      } catch (e) { newRes[num] = { error: e.message }; }
    }));
    setHistoryResults(newRes);
    setResultMode("history");
  };

  // ── 상표명 검색 ──
  const doSearch = async () => {
    if (!inputTmName && !inputClass && !inputSim) return;
    try {
      const res  = await fetch("/api/kipris", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "search", tradeMarkName: inputTmName, classificationCode: inputClass, similarityCode: inputSim }) });
      const data = await res.json();
      setSearchResults(data);
    } catch (e) { setSearchResults({ error: e.message, items: [] }); }
    setResultMode("search");
  };

  const handleSubmit = async () => {
    setLoading(true); setSearched(true); setHistoryResults({}); setSearchResults(null);
    if (searchMode === "appnum") {
      const nums = extractApplicationNumbers(inputAppNum);
      if (nums.length > 0) await doHistory(nums);
    } else {
      await doSearch();
    }
    setLoading(false);
  };

  const handleSelectRecent = (num) => {
    setSelectedNum(num);
    setSearchMode("appnum");
    setInputAppNum(num);
    setLoading(true); setSearched(true); setHistoryResults({}); setSearchResults(null);
    fetch("/api/kipris", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "history", applicationNumber: num }) })
      .then(r => r.json()).then(data => { setHistoryResults({ [num]: data }); setResultMode("history"); }).catch(e => { setHistoryResults({ [num]: { error: e.message } }); setResultMode("history"); })
      .finally(() => setLoading(false));
  };

  const handleClear = () => {
    setInputAppNum(""); setInputTmName(""); setInputClass(""); setInputSim("");
    setSearched(false); setHistoryResults({}); setSearchResults(null); setSelectedNum(null); setResultMode(null);
    inputRef.current?.focus();
  };

  // ── 이력 타임라인 렌더 ──
  const renderHistory = (appNum, data) => {
    if (data.error) return (
      <div style={{ color:"#dc2626", fontSize:13, padding:"10px 14px", background:c("#fff1f2","#450a0a"), borderRadius:8 }}>⚠️ {data.error}</div>
    );
    const items = data.items || [];
    const stageIdx = inferStageFromDocs(items);
    const regNum = data.registrationNumber;

    return (
      <div style={{ background:c("#fff","#1e293b"), border:`1px solid ${c("#e5e9f5","#334155")}`, borderRadius:14, padding:"18px 20px", marginBottom:20, boxShadow:"0 2px 12px rgba(19,39,79,0.07)" }}>
        {/* 헤더 */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:c("#1a3a8f","#93c5fd") }}>📋 {appNum}</div>
            {regNum && <div style={{ fontSize:12, color:c("#166534","#86efac"), fontWeight:700, marginTop:3 }}>✅ 등록번호: {regNum}</div>}
          </div>
          {data.latestStep && (() => {
            const sc = STEP_COLOR[data.latestStep] || STEP_COLOR["출원"];
            return <span style={{ background:c(sc.bg,sc.darkBg), color:c(sc.text,sc.darkText), borderRadius:20, padding:"4px 14px", fontSize:12, fontWeight:700 }}>현재: {data.latestStep} 단계</span>;
          })()}
        </div>

        {/* ── 진행단계 프로그레스바 ── */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:0 }}>
            {STAGES.map((stage, si) => {
              const isDone    = si < stageIdx;
              const isCurrent = si === stageIdx;
              const isLast    = si === STAGES.length - 1;
              return (
                <div key={si} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                  {/* 선 + 원 */}
                  <div style={{ display:"flex", alignItems:"center", width:"100%" }}>
                    {/* 왼쪽 선 */}
                    <div style={{ flex:1, height:3, background: isDone || isCurrent ? c("#1a3a8f","#3b82f6") : c("#e5e9f5","#334155"), transition:"background .3s" }} />
                    {/* 원 */}
                    <div style={{
                      width:  isCurrent ? 20 : 16,
                      height: isCurrent ? 20 : 16,
                      borderRadius:"50%",
                      flexShrink:0,
                      background: isDone ? c("#1a3a8f","#3b82f6") : isCurrent ? c("#1a3a8f","#3b82f6") : c("#e5e9f5","#334155"),
                      border: isCurrent ? `3px solid ${c("#93c5fd","#93c5fd")}` : "none",
                      boxShadow: isCurrent ? "0 0 0 3px rgba(59,130,246,0.25)" : "none",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      transition:"all .3s",
                      zIndex:1,
                    }}>
                      {isDone && <span style={{ fontSize:9, color:"#fff", fontWeight:900 }}>✓</span>}
                      {isCurrent && <span style={{ width:8, height:8, borderRadius:"50%", background:"#fff", display:"block" }} />}
                    </div>
                    {/* 오른쪽 선 */}
                    <div style={{ flex:1, height:3, background: isDone ? c("#1a3a8f","#3b82f6") : c("#e5e9f5","#334155"), transition:"background .3s" }} />
                  </div>
                  {/* 라벨 */}
                  <div style={{ marginTop:6, textAlign:"center", fontSize:10, fontWeight: isCurrent ? 800 : 500, color: isCurrent ? c("#1a3a8f","#93c5fd") : isDone ? c("#374151","#cbd5e1") : c("#9ca3af","#64748b"), whiteSpace:"pre-line", lineHeight:1.3 }}>
                    {stage.label}
                  </div>
                  {isCurrent && <div style={{ fontSize:9, color:c("#1a3a8f","#93c5fd"), fontWeight:700, marginTop:2 }}>← 현재</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 이력 타임라인 전체 ── */}
        {items.length > 0 ? (
          <div>
            <div style={{ fontSize:11, color:c("#9ca3af","#64748b"), marginBottom:8, fontWeight:600 }}>
              📄 전체 행정처리 이력 ({items.length}건)
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {[...items].reverse().map((item, idx) => {
                const sc = STEP_COLOR[item.step] || STEP_COLOR["출원"];
                const isFirst = idx === 0;
                return (
                  <div key={idx} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"9px 12px", background: isFirst ? c("#eff6ff","#162032") : c(idx%2===0?"#f8faff":"#fff", idx%2===0?"#172035":"#1e293b"), borderRadius:9, border:`1px solid ${isFirst?c("#bfdbfe","#1e3a6e"):c("#e5e9f5","#2a3a55")}` }}>
                    <div style={{ flexShrink:0, minWidth:76, fontSize:11, color:c("#9ca3af","#64748b"), fontWeight:600, paddingTop:2 }}>{item.documentDateFmt}</div>
                    <div style={{ flexShrink:0, paddingTop:1 }}>
                      <span style={{ background:c(sc.bg,sc.darkBg), color:c(sc.text,sc.darkText), borderRadius:5, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{item.step}</span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight: isFirst?700:500, color:c("#1f2937","#e2e8f0") }}>{item.documentTitle}</div>
                      {item.status && <div style={{ fontSize:11, color:c("#6b7280","#94a3b8"), marginTop:1 }}>처리상태: {item.status}</div>}
                      {item.registrationNumber && <div style={{ fontSize:11, color:c("#166534","#86efac"), fontWeight:700, marginTop:1 }}>등록번호: {item.registrationNumber}</div>}
                    </div>
                    {isFirst && <div style={{ flexShrink:0, fontSize:10, color:c("#3b82f6","#93c5fd"), fontWeight:700, paddingTop:2 }}>최신</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"20px 0", color:c("#9ca3af","#64748b"), fontSize:13 }}>
            조회된 이력이 없습니다. 출원번호를 확인해주세요.
          </div>
        )}
      </div>
    );
  };

  // ── 상표 검색결과 렌더 ──
  const renderSearchResults = () => {
    if (!searchResults) return null;
    if (searchResults.error) return (
      <div style={{ color:"#dc2626", fontSize:13, padding:"12px 16px", background:c("#fff1f2","#450a0a"), borderRadius:10, marginBottom:14 }}>
        ⚠️ {searchResults.error}
        {searchResults.debug && (
          <details style={{ marginTop:8 }}>
            <summary style={{ cursor:"pointer", fontSize:11 }}>디버그 정보</summary>
            <pre style={{ fontSize:10, marginTop:6, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{JSON.stringify(searchResults.debug, null, 2)}</pre>
          </details>
        )}
      </div>
    );

    const items = searchResults.items || [];
    return (
      <div>
        <div style={{ fontSize:12, color:c("#6b7280","#94a3b8"), marginBottom:12 }}>
          검색 결과 <strong>{searchResults.totalCount}</strong>건 (최대 30건 표시)
          {searchResults.debug && items.length === 0 && (
            <details style={{ marginTop:6 }}>
              <summary style={{ cursor:"pointer", fontSize:11, color:"#f59e0b" }}>⚠ 결과 없음 — 디버그</summary>
              <pre style={{ fontSize:10, marginTop:6, whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:200, overflow:"auto" }}>{searchResults.debug.xmlSnippet}</pre>
            </details>
          )}
        </div>
        {items.length === 0 && !searchResults.error && (
          <div style={{ textAlign:"center", paddingTop:40, color:c("#9ca3af","#64748b") }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
            <div>검색 결과가 없습니다.</div>
            <div style={{ fontSize:12, marginTop:6 }}>상표명을 다시 확인하거나 조건을 변경해보세요.</div>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {items.map((item, idx) => (
            <div key={idx}
              style={{ display:"flex", gap:14, alignItems:"center", background:c("#fff","#1e293b"), border:`1px solid ${c("#e5e9f5","#334155")}`, borderRadius:12, padding:"12px 16px", boxShadow:"0 1px 6px rgba(19,39,79,0.06)", cursor:"pointer", transition:"box-shadow .15s" }}
              onClick={() => { setSearchMode("appnum"); setInputAppNum(item.applicationNumber); handleSelectRecent(item.applicationNumber); }}
              onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 16px rgba(19,39,79,0.14)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow="0 1px 6px rgba(19,39,79,0.06)"}>
              {/* 상표도면 */}
              <div style={{ width:68, height:68, flexShrink:0, background:c("#f1f5f9","#334155"), borderRadius:8, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${c("#e5e9f5","#475569")}` }}>
                {item.drawing
                  ? <img src={item.drawing} alt={item.tradeMarkName} style={{ width:"100%", height:"100%", objectFit:"contain" }} onError={e => e.target.style.display="none"} />
                  : <span style={{ fontSize:22, color:c("#cbd5e1","#475569") }}>™</span>}
              </div>
              {/* 정보 */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:c("#1a3a8f","#93c5fd"), marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {item.tradeMarkName || "(상표명 없음)"}
                </div>
                <div style={{ fontSize:12, color:c("#6b7280","#94a3b8") }}>
                  출원번호: <span style={{ fontWeight:600, color:c("#374151","#cbd5e1"), fontFamily:"monospace" }}>{item.applicationNumber}</span>
                </div>
                {item.applicantName && <div style={{ fontSize:11, color:c("#9ca3af","#64748b"), marginTop:2 }}>출원인: {item.applicantName}</div>}
                {item.applicationDate && <div style={{ fontSize:11, color:c("#9ca3af","#64748b") }}>출원일: {item.applicationDate}</div>}
                {item.classificationCode && <div style={{ fontSize:11, color:c("#9ca3af","#64748b") }}>류코드: {item.classificationCode}</div>}
              </div>
              {/* 상태 + 이력조회 */}
              <div style={{ flexShrink:0, textAlign:"right" }}>
                {item.registerStatus && (
                  <span style={{ display:"block", background: item.registerStatus.includes("등록") ? c("#dcfce7","#14532d") : c("#fef9c3","#422006"), color: item.registerStatus.includes("등록") ? c("#166534","#86efac") : c("#854d0e","#fde68a"), borderRadius:5, padding:"3px 8px", fontSize:10, fontWeight:700, marginBottom:4 }}>
                    {item.registerStatus}
                  </span>
                )}
                <span style={{ fontSize:10, color:c("#9ca3af","#64748b") }}>클릭 → 이력조회</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>KIPRIS 출원 조회 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=EB+Garamond:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight:"100vh", background:c("linear-gradient(180deg,#fff 0%,#f4f6fc 100%)","linear-gradient(160deg,#0f172a 0%,#1e293b 100%)"), color:c("#1f2937","#e2e8f0"), fontFamily:"'Noto Sans KR',sans-serif", transition:"background .3s,color .3s", overflow:"hidden" }}>

        {/* 상단 버튼 */}
        <div style={{ position:"fixed", top:14, right:14, display:"flex", gap:8, zIndex:200 }}>
          <button onClick={() => router.push("/")} title="홈으로" style={{ background:"none", border:`2px solid ${c("#d0d9f0","#475569")}`, borderRadius:"50%", width:40, height:40, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>🏠</button>
          <button onClick={() => setDark(!dark)} title={dark?"라이트":"다크"} style={{ background:"none", border:`2px solid ${c("#d0d9f0","#475569")}`, borderRadius:"50%", width:40, height:40, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{dark?"☀️":"🌙"}</button>
        </div>

        {/* 헤더 */}
        <div style={{ textAlign:"center", paddingTop:"5vh", marginBottom:24, transition:"all .6s ease" }}>
          <div style={{ fontFamily:"'EB Garamond',serif", fontSize: isSplit?28:40, fontWeight:700, color:c("#13274F","#e2e8f0"), letterSpacing:"-0.5px", transition:"font-size .6s ease" }}>
            Guardian &amp; Angel
          </div>
          <div style={{ fontSize: isSplit?10:12, letterSpacing:5, color:c("#13274F","#94a3b8"), margin:"5px 0 9px", textTransform:"uppercase", transition:"font-size .6s ease" }}>
            Intellectual Property
          </div>
          <div style={{ width: isSplit?200:280, height:1, background:c("#13274F","#475569"), margin:"0 auto 9px", transition:"width .6s ease" }} />
          <div style={{ fontSize: isSplit?14:17, fontWeight:700, color:c("#13274F","#e2e8f0"), letterSpacing:1 }}>📡 KIPRIS 출원 조회</div>
        </div>

        {/* 분할 레이아웃 */}
        <div style={{ display:"flex", gap:0, height:"calc(100vh - 165px)", maxWidth:1300, margin:"0 auto", padding:"0 16px", alignItems:"flex-start" }}>

          {/* ── 좌측: 검색 + 결과 ── */}
          <div style={{ width: isSplit?"55%":"100%", transition:"width .7s cubic-bezier(.4,0,.2,1)", paddingRight: isSplit?20:0, height:"100%", overflowY:"auto", scrollbarWidth:"thin", scrollbarColor:c("#cbd5e1 #f1f5f9","#334155 #1e293b") }}>

            {/* 검색 패널 */}
            <div style={{ position:"sticky", top:0, background:c("linear-gradient(180deg,#fff 85%,transparent)","linear-gradient(180deg,#0f172a 85%,transparent)"), paddingBottom:14, zIndex:10 }}>

              {/* 모드 탭 */}
              <div style={{ display:"flex", gap:0, background:c("#f1f5f9","#1e293b"), borderRadius:10, padding:4, marginBottom:10, border:`1px solid ${c("#e5e9f5","#334155")}` }}>
                {[{key:"appnum",label:"📋 출원번호 조회"},{key:"trademark",label:"🔍 상표 검색"}].map(tab => (
                  <button key={tab.key} onClick={() => setSearchMode(tab.key)}
                    style={{ flex:1, padding:"8px 0", fontSize:13, fontWeight:700, border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit", transition:"all .2s", background: searchMode===tab.key ? c("#13274F","#1e3a6e") : "transparent", color: searchMode===tab.key ? "#fff" : c("#6b7280","#94a3b8") }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 출원번호 검색 */}
              {searchMode === "appnum" && (
                <div style={{ display:"flex", gap:8, background:c("#f8faff","#1e293b"), border:`1.5px solid ${c("#cbd5e1","#334155")}`, borderRadius:12, padding:"7px 7px 7px 16px", boxShadow:"0 2px 12px rgba(19,39,79,0.10)" }}>
                  <input ref={inputRef} value={inputAppNum} onChange={e=>setInputAppNum(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                    placeholder="40-2020-0000000"
                    style={{ flex:1, border:"none", outline:"none", fontSize:15, color:c("#1f2937","#e2e8f0"), background:"transparent", fontFamily:"monospace" }} />
                  {inputAppNum && <button onClick={handleClear} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:16 }}>✕</button>}
                  <button onClick={handleSubmit} style={{ background:"#13274F", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>조회</button>
                </div>
              )}

              {/* 상표명 검색 */}
              {searchMode === "trademark" && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {/* 상표명 */}
                  <div style={{ display:"flex", gap:8, background:c("#f8faff","#1e293b"), border:`1.5px solid ${c("#cbd5e1","#334155")}`, borderRadius:12, padding:"7px 7px 7px 16px", boxShadow:"0 2px 12px rgba(19,39,79,0.10)" }}>
                    <span style={{ fontSize:16 }}>™</span>
                    <input ref={inputRef} value={inputTmName} onChange={e=>setInputTmName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                      placeholder="상표명 입력 (예: 스타벅스, STARBUCKS)"
                      style={{ flex:1, border:"none", outline:"none", fontSize:14, color:c("#1f2937","#e2e8f0"), background:"transparent", fontFamily:"inherit" }} />
                    {(inputTmName||inputClass||inputSim) && <button onClick={handleClear} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:15 }}>✕</button>}
                    <button onClick={handleSubmit} style={{ background:"#13274F", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>검색</button>
                  </div>
                  {/* 조건 필터 */}
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={{ flex:1, display:"flex", gap:6, background:c("#f8faff","#1e293b"), border:`1.5px solid ${c("#e5e9f5","#334155")}`, borderRadius:10, padding:"6px 12px", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:c("#9ca3af","#64748b"), flexShrink:0, fontWeight:600 }}>상품류</span>
                      <input value={inputClass} onChange={e=>setInputClass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                        placeholder="예: 35"
                        style={{ flex:1, border:"none", outline:"none", fontSize:13, color:c("#1f2937","#e2e8f0"), background:"transparent", fontFamily:"monospace", width:0, minWidth:0 }} />
                    </div>
                    <div style={{ flex:1, display:"flex", gap:6, background:c("#f8faff","#1e293b"), border:`1.5px solid ${c("#e5e9f5","#334155")}`, borderRadius:10, padding:"6px 12px", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:c("#9ca3af","#64748b"), flexShrink:0, fontWeight:600 }}>유사군</span>
                      <input value={inputSim} onChange={e=>setInputSim(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                        placeholder="예: G0301"
                        style={{ flex:1, border:"none", outline:"none", fontSize:13, color:c("#1f2937","#e2e8f0"), background:"transparent", fontFamily:"monospace", width:0, minWidth:0 }} />
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:c("#9ca3af","#64748b"), paddingLeft:4 }}>
                    상표명만, 또는 상표명 + 상품류/유사군 조합으로 검색 가능 · KIPRIS 전체 데이터 기준
                  </div>
                </div>
              )}
            </div>

            {/* 로딩 */}
            {loading && (
              <div style={{ textAlign:"center", paddingTop:50 }}>
                <div style={{ width:32, height:32, border:"3px solid #d0d9f0", borderTop:"3px solid #1a3a8f", borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 14px" }} />
                <div style={{ color:c("#6b7280","#94a3b8"), fontSize:14 }}>KIPRIS 조회 중...</div>
              </div>
            )}

            {/* 결과 */}
            {!loading && resultMode === "history" && Object.entries(historyResults).map(([num, data]) => (
              <div key={num}>{renderHistory(num, data)}</div>
            ))}
            {!loading && resultMode === "search" && renderSearchResults()}
          </div>

          {/* ── 우측: 최근 출원번호 패널 ── */}
          <div style={{ width: isSplit?"45%":"0%", opacity: isSplit?1:0, overflow:"hidden", transition:"width .7s cubic-bezier(.4,0,.2,1), opacity .5s ease .3s", height:"100%" }}>
            <div style={{ background:c("#fff","#1e293b"), border:`1px solid ${c("#e5e9f5","#334155")}`, borderRadius:16, height:"100%", display:"flex", flexDirection:"column", boxShadow:"0 2px 20px rgba(19,39,79,0.09)", overflow:"hidden" }}>
              <div style={{ padding:"14px 18px 11px", borderBottom:`1px solid ${c("#f1f5f9","#334155")}`, flexShrink:0, background:c("#f8faff","#162032") }}>
                <div style={{ fontSize:13, fontWeight:700, color:c("#13274F","#e2e8f0"), display:"flex", alignItems:"center", gap:6 }}>
                  <span>🕐</span> 최근 출원 현황 (가엔 DB)
                </div>
                <div style={{ fontSize:11, color:c("#9ca3af","#64748b"), marginTop:3 }}>최신순 30건 · 클릭하면 이력 조회</div>
              </div>
              <div style={{ flex:1, overflowY:"auto", padding:"8px 10px", scrollbarWidth:"thin", scrollbarColor:c("#cbd5e1 #f1f5f9","#334155 #1e293b") }}>
                {recentLoad ? (
                  <div style={{ textAlign:"center", paddingTop:40, color:c("#9ca3af","#64748b"), fontSize:13 }}>불러오는 중...</div>
                ) : recentList.length === 0 ? (
                  <div style={{ textAlign:"center", paddingTop:40, color:c("#9ca3af","#64748b"), fontSize:13 }}>출원번호 데이터 없음</div>
                ) : (
                  recentList.flatMap((item, i) =>
                    item.nums.map((num, ni) => {
                      const isSelected = selectedNum === num;
                      return (
                        <button key={`${i}-${ni}`} onClick={() => handleSelectRecent(num)}
                          style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"9px 10px", marginBottom:4, background: isSelected?c("#dbeafe","#1e3a6e"):c(i%2===0?"#fff":"#f8faff",i%2===0?"#1e293b":"#172035"), border:`1.5px solid ${isSelected?c("#93c5fd","#3b82f6"):c("#e5e9f5","#2a3a55")}`, borderRadius:10, cursor:"pointer", fontFamily:"inherit", transition:"all .15s", textAlign:"left" }}
                          onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background=c("#f0f4ff","#1e3a5f"); }}
                          onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background=c(i%2===0?"#fff":"#f8faff",i%2===0?"#1e293b":"#172035"); }}>
                          <span style={{ fontSize:10, fontWeight:700, color:c("#9ca3af","#64748b"), flexShrink:0, minWidth:18 }}>{i+ni+1}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color: isSelected?c("#1a3a8f","#93c5fd"):c("#374151","#cbd5e1"), fontFamily:"monospace" }}>{num}</div>
                            <div style={{ fontSize:10, color:c("#9ca3af","#64748b"), overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:1 }}>{item.title}</div>
                          </div>
                          {isSelected && <span style={{ fontSize:12, color:c("#1a3a8f","#93c5fd"), flexShrink:0 }}>▶</span>}
                        </button>
                      );
                    })
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Noto Sans KR',sans-serif; }
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color:#9ca3af; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; }
      `}</style>
    </>
  );
}
