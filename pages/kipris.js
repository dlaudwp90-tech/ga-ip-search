// pages/kipris.js  v4

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const STAGES = [
  { key: "출원접수", label: "출원\n접수" },
  { key: "방식심사", label: "방식\n심사" },
  { key: "실체심사", label: "실체\n심사" },
  { key: "심판",     label: "심판" },
  { key: "등록",     label: "등록\n완료" },
];

function inferStage(items) {
  if (!items || items.length === 0) return 0;
  const latestStep = items[items.length - 1]?.step;
  const hasReg = items.some(i => i.registrationNumber?.trim());
  const titles = items.map(i => i.documentTitle).join(" ");
  if (hasReg || latestStep === "등록") return 4;
  if (latestStep === "심판") return 3;
  if (titles.includes("거절") || titles.includes("의견제출") || titles.includes("보정")) return 2;
  if (titles.includes("심사") || titles.includes("통지")) return 2;
  if (titles.includes("방식")) return 1;
  return 0;
}

const STEP_COLOR = {
  "출원": { bg:"#dbeafe", text:"#1e40af", dBg:"#1e3a6e", dText:"#93c5fd" },
  "심판": { bg:"#fce7f3", text:"#9d174d", dBg:"#500724", dText:"#f9a8d4" },
  "등록": { bg:"#dcfce7", text:"#166534", dBg:"#14532d", dText:"#86efac" },
};

const extractAppNums = (t) => [...new Set((t||"").match(/\d{2}-\d{4}-\d{7}/g) || [])];
const isAppNumInput = (t) => /\d{2}-\d{4}-\d{7}/.test((t||"").trim());

export default function KiprisPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);

  // 검색 모드
  const [searchMode, setSearchMode] = useState("appnum"); // "appnum" | "trademark"

  // 입력 상태
  const [inputAppNum, setInputAppNum] = useState("");
  const [inputTmName, setInputTmName] = useState("");
  const [inputClass,  setInputClass]  = useState("");
  const [inputSim,    setInputSim]    = useState("");
  const [inputAppli,  setInputAppli]  = useState(""); // 출원인
  const [inputAgent,  setInputAgent]  = useState(""); // 대리인

  // 결과 상태
  const [loading,        setLoading]        = useState(false);
  const [resultMode,     setResultMode]     = useState(null);
  const [historyResults, setHistoryResults] = useState({});
  const [searchResults,  setSearchResults]  = useState(null);
  const [currentPage,    setCurrentPage]    = useState(1);
  const [searched,       setSearched]       = useState(false);

  // 레이아웃 상태
  const [layoutReady, setLayoutReady] = useState(false); // 초기 애니 완료 여부
  const [showRecent,  setShowRecent]  = useState(true);  // 우측 최근 패널 표시
  const [detailMode,  setDetailMode]  = useState(null);  // { appNum } | null
  const [detailData,  setDetailData]  = useState(null);
  const [detailLoad,  setDetailLoad]  = useState(false);

  // 최근 출원
  const [recentList, setRecentList] = useState([]);
  const [recentLoad, setRecentLoad] = useState(true);
  const [selectedNum, setSelectedNum] = useState(null);

  const tmInputRef = useRef(null);
  const appInputRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    mq.addEventListener("change", e => setDark(e.matches));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLayoutReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/kipris-recent", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(d => setRecentList(d.results || [])).catch(()=>{}).finally(() => setRecentLoad(false));
  }, []);

  const c = (l, dk) => dark ? dk : l;

  // ── 탭 변경 ──
  const handleTabChange = (tab) => {
    setSearchMode(tab);
    setDetailMode(null);
    setDetailData(null);
    setShowRecent(tab === "appnum");
    setTimeout(() => {
      if (tab === "appnum") appInputRef.current?.focus();
      else tmInputRef.current?.focus();
    }, 50);
  };

  // ── 출원번호 이력 조회 ──
  const doHistory = async (nums) => {
    const newRes = {};
    await Promise.all(nums.map(async num => {
      try {
        const res = await fetch("/api/kipris", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ mode:"history", applicationNumber: num }) });
        newRes[num] = await res.json();
      } catch (e) { newRes[num] = { error: e.message }; }
    }));
    setHistoryResults(newRes);
    setResultMode("history");
  };

  // ── 상표 검색 ──
  const doSearch = async (page = 1) => {
    try {
      const res = await fetch("/api/kipris", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          mode: "search",
          tradeMarkName: inputTmName,
          classificationCode: inputClass,
          similarityCode: inputSim,
          applicantName: inputAppli,
          agentName: inputAgent,
          pageNo: page,
        })
      });
      setSearchResults(await res.json());
      setResultMode("search");
    } catch (e) { setSearchResults({ error: e.message, items: [] }); }
  };

  // ── 검색 실행 ──
  const handleSubmit = async (page = 1) => {
    setLoading(true); setSearched(true);
    setDetailMode(null); setDetailData(null);
    setCurrentPage(page);
    setHistoryResults({}); setSearchResults(null);

    if (searchMode === "appnum") {
      const nums = extractAppNums(inputAppNum);
      if (nums.length > 0) await doHistory(nums);
    } else {
      await doSearch(page);
    }
    setLoading(false);
  };

  // ── 페이지 변경 ──
  const handlePageChange = async (page) => {
    setLoading(true); setCurrentPage(page);
    await doSearch(page);
    setLoading(false);
    // 결과 영역 상단으로 스크롤
    document.querySelector(".left-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── 최근 출원 클릭 ──
  const handleSelectRecent = (num) => {
    setSelectedNum(num); setSearchMode("appnum"); setInputAppNum(num); setShowRecent(true);
    setLoading(true); setSearched(true); setHistoryResults({}); setSearchResults(null); setDetailMode(null);
    fetch("/api/kipris", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ mode:"history", applicationNumber: num }) })
      .then(r => r.json())
      .then(d => { setHistoryResults({[num]: d}); setResultMode("history"); })
      .catch(e => setHistoryResults({[num]: { error: e.message }}))
      .finally(() => setLoading(false));
  };

  // ── 검색결과 아이템 클릭 → 상세 뷰 ──
  const handleItemClick = async (num) => {
    setDetailMode({ appNum: num });
    setDetailLoad(true); setDetailData(null);
    // 이력 + 상세 병렬 조회
    try {
      const [hRes, dRes] = await Promise.all([
        fetch("/api/kipris", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ mode:"history", applicationNumber: num }) }),
        fetch("/api/kipris", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ mode:"detail",  applicationNumber: num }) }),
      ]);
      setHistoryResults({[num]: await hRes.json()});
      setDetailData(await dRes.json());
    } catch (e) { setDetailData({ error: e.message }); }
    setDetailLoad(false);
  };

  const handleCloseDetail = () => {
    setDetailMode(null); setDetailData(null);
  };

  const handleClear = () => {
    setInputAppNum(""); setInputTmName(""); setInputClass(""); setInputSim("");
    setInputAppli(""); setInputAgent("");
    setSearched(false); setHistoryResults({}); setSearchResults(null);
    setSelectedNum(null); setResultMode(null); setDetailMode(null); setDetailData(null); setCurrentPage(1);
  };

  // ── 우측 패널 타입 결정 ──
  const rightPanel = detailMode ? "detail" : (showRecent ? "recent" : null);
  const hasRight   = rightPanel !== null && layoutReady;
  const leftWidth  = hasRight ? "55%" : "100%";
  const rightWidth = hasRight ? "45%" : "0%";

  // ── 이력 타임라인 렌더 ──
  const renderHistory = (appNum, data) => {
    if (!data) return null;
    if (data.error) return <div style={{color:"#dc2626",fontSize:13,padding:"10px 14px",background:c("#fff1f2","#450a0a"),borderRadius:8}}>⚠️ {data.error}</div>;
    const items = data.items || [];
    const stageIdx = inferStage(items);
    const regNum = data.registrationNumber;

    return (
      <div style={{ background:c("#fff","#1e293b"), border:`1px solid ${c("#e5e9f5","#334155")}`, borderRadius:14, padding:"18px 20px", marginBottom:16, boxShadow:"0 2px 12px rgba(19,39,79,0.07)" }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:c("#1a3a8f","#93c5fd")}}>📋 {appNum}</div>
            {regNum && <div style={{fontSize:12,color:c("#166534","#86efac"),fontWeight:700,marginTop:3}}>✅ 등록번호: {regNum}</div>}
          </div>
          {data.latestStep && (() => {
            const sc = STEP_COLOR[data.latestStep] || STEP_COLOR["출원"];
            return <span style={{background:c(sc.bg,sc.dBg),color:c(sc.text,sc.dText),borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700}}>현재: {data.latestStep} 단계</span>;
          })()}
        </div>

        {/* 진행단계 프로그레스바 */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:0}}>
            {STAGES.map((stage, si) => {
              const isDone = si < stageIdx;
              const isCurrent = si === stageIdx;
              return (
                <div key={si} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",width:"100%"}}>
                    <div style={{flex:1,height:3,background:(isDone||isCurrent)?c("#1a3a8f","#3b82f6"):c("#e5e9f5","#334155")}} />
                    <div style={{
                      width: isCurrent?20:16, height: isCurrent?20:16, borderRadius:"50%", flexShrink:0,
                      background: (isDone||isCurrent)?c("#1a3a8f","#3b82f6"):c("#e5e9f5","#334155"),
                      border: isCurrent?`3px solid ${c("#93c5fd","#93c5fd")}`:"none",
                      boxShadow: isCurrent?"0 0 0 3px rgba(59,130,246,0.25)":"none",
                      display:"flex",alignItems:"center",justifyContent:"center",transition:"all .3s",zIndex:1,
                    }}>
                      {isDone && <span style={{fontSize:9,color:"#fff",fontWeight:900}}>✓</span>}
                      {isCurrent && <span style={{width:8,height:8,borderRadius:"50%",background:"#fff",display:"block"}} />}
                    </div>
                    <div style={{flex:1,height:3,background: isDone?c("#1a3a8f","#3b82f6"):c("#e5e9f5","#334155")}} />
                  </div>
                  <div style={{marginTop:6,textAlign:"center",fontSize:10,fontWeight: isCurrent?800:500, color: isCurrent?c("#1a3a8f","#93c5fd"):isDone?c("#374151","#cbd5e1"):c("#9ca3af","#64748b"),whiteSpace:"pre-line",lineHeight:1.3}}>{stage.label}</div>
                  {isCurrent && <div style={{fontSize:9,color:c("#1a3a8f","#93c5fd"),fontWeight:700,marginTop:2}}>← 현재</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 이력 목록 */}
        {items.length > 0 ? (
          <div>
            <div style={{fontSize:11,color:c("#9ca3af","#64748b"),marginBottom:8,fontWeight:600}}>📄 전체 행정처리 이력 ({items.length}건)</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {[...items].reverse().map((item, idx) => {
                const sc = STEP_COLOR[item.step] || STEP_COLOR["출원"];
                const isFirst = idx === 0;
                return (
                  <div key={idx} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"9px 12px",background: isFirst?c("#eff6ff","#162032"):c(idx%2===0?"#f8faff":"#fff",idx%2===0?"#172035":"#1e293b"),borderRadius:9,border:`1px solid ${isFirst?c("#bfdbfe","#1e3a6e"):c("#e5e9f5","#2a3a55")}`}}>
                    <div style={{flexShrink:0,minWidth:76,fontSize:11,color:c("#9ca3af","#64748b"),fontWeight:600,paddingTop:2}}>{item.documentDateFmt}</div>
                    <div style={{flexShrink:0,paddingTop:1}}>
                      <span style={{background:c(sc.bg,sc.dBg),color:c(sc.text,sc.dText),borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700}}>{item.step}</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight: isFirst?700:500,color:c("#1f2937","#e2e8f0")}}>{item.documentTitle}</div>
                      {item.status && <div style={{fontSize:11,color:c("#6b7280","#94a3b8"),marginTop:1}}>처리상태: {item.status}</div>}
                      {item.registrationNumber && <div style={{fontSize:11,color:c("#166534","#86efac"),fontWeight:700,marginTop:1}}>등록번호: {item.registrationNumber}</div>}
                    </div>
                    {isFirst && <div style={{flexShrink:0,fontSize:10,color:c("#3b82f6","#93c5fd"),fontWeight:700,paddingTop:2}}>최신</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{textAlign:"center",padding:"20px 0",color:c("#9ca3af","#64748b"),fontSize:13}}>조회된 이력이 없습니다.</div>
        )}
      </div>
    );
  };

  // ── 페이지네이션 UI ──
  const renderPagination = () => {
    if (!searchResults || !searchResults.items?.length) return null;
    const total = searchResults.totalCount || 0;
    const per   = searchResults.numOfRows  || 30;
    const totalPages = Math.max(1, Math.ceil(total / per));
    if (totalPages <= 1) return null;

    // 페이지 번호 생성 (최대 7개, 현재 페이지 중심)
    const maxShow = 7;
    let startP = Math.max(1, currentPage - Math.floor(maxShow / 2));
    let endP = Math.min(totalPages, startP + maxShow - 1);
    if (endP - startP + 1 < maxShow) startP = Math.max(1, endP - maxShow + 1);
    const pages = Array.from({length: endP - startP + 1}, (_, i) => startP + i);

    const btnStyle = (active) => ({
      minWidth: 32, height: 32, padding:"0 8px",
      background: active ? c("#13274F","#1e3a6e") : c("#fff","#1e293b"),
      color: active ? "#fff" : c("#374151","#cbd5e1"),
      border: `1px solid ${active ? c("#13274F","#1e3a6e") : c("#e5e9f5","#334155")}`,
      borderRadius: 6, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700,
      display:"inline-flex", alignItems:"center", justifyContent:"center",
    });

    return (
      <div style={{ display:"flex", justifyContent:"center", gap:4, marginTop:20, marginBottom:16, flexWrap:"wrap" }}>
        <button style={btnStyle(false)} onClick={() => handlePageChange(1)} disabled={currentPage === 1}>«</button>
        <button style={btnStyle(false)} onClick={() => handlePageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹</button>
        {startP > 1 && <><button style={btnStyle(false)} onClick={() => handlePageChange(1)}>1</button><span style={{padding:"0 4px", color:c("#9ca3af","#64748b")}}>…</span></>}
        {pages.map(p => <button key={p} style={btnStyle(p === currentPage)} onClick={() => handlePageChange(p)}>{p}</button>)}
        {endP < totalPages && <><span style={{padding:"0 4px", color:c("#9ca3af","#64748b")}}>…</span><button style={btnStyle(false)} onClick={() => handlePageChange(totalPages)}>{totalPages}</button></>}
        <button style={btnStyle(false)} onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>›</button>
        <button style={btnStyle(false)} onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>»</button>
        <div style={{display:"flex",alignItems:"center",marginLeft:8,fontSize:11,color:c("#9ca3af","#64748b")}}>총 {total.toLocaleString()}건 · {currentPage}/{totalPages}페이지</div>
      </div>
    );
  };

  // ── 검색 결과 렌더 ──
  const renderSearchResults = () => {
    if (!searchResults) return null;
    if (searchResults.error) return <div style={{color:"#dc2626",fontSize:13,padding:"12px 16px",background:c("#fff1f2","#450a0a"),borderRadius:10}}>⚠️ {searchResults.error}</div>;
    const items = searchResults.items || [];
    const total = searchResults.totalCount || 0;

    return (
      <div>
        <div style={{fontSize:12,color:c("#6b7280","#94a3b8"),marginBottom:12}}>
          검색 결과 <strong>{total.toLocaleString()}</strong>건 · {currentPage}페이지 · 페이지당 30건 · 클릭하면 좌측에 이력, 우측에 상세정보 표시
        </div>
        {items.length === 0 && <div style={{textAlign:"center",paddingTop:40,color:c("#9ca3af","#64748b")}}>
          <div style={{fontSize:32,marginBottom:12}}>🔍</div>검색 결과가 없습니다.
        </div>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {items.map((item, idx) => (
            <div key={idx}
              style={{display:"flex",gap:14,alignItems:"center",background:c("#fff","#1e293b"),border:`1px solid ${c("#e5e9f5","#334155")}`,borderRadius:12,padding:"12px 16px",boxShadow:"0 1px 6px rgba(19,39,79,0.06)",cursor:"pointer",transition:"all .15s"}}
              onClick={() => handleItemClick(item.applicationNumber)}
              onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 16px rgba(19,39,79,0.14)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow="0 1px 6px rgba(19,39,79,0.06)"}>
              <div style={{width:64,height:64,flexShrink:0,background:c("#f1f5f9","#334155"),borderRadius:8,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${c("#e5e9f5","#475569")}`}}>
                {item.drawing ? <img src={item.drawing} alt={item.tradeMarkName} style={{width:"100%",height:"100%",objectFit:"contain"}} onError={e=>e.target.style.display="none"} /> : <span style={{fontSize:22,color:c("#cbd5e1","#475569")}}>™</span>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:c("#1a3a8f","#93c5fd"),marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.tradeMarkName || "(상표명 없음)"}</div>
                <div style={{fontSize:11,color:c("#6b7280","#94a3b8")}}>출원번호: <span style={{fontWeight:600,color:c("#374151","#cbd5e1"),fontFamily:"monospace"}}>{item.applicationNumber}</span></div>
                {item.applicantName && <div style={{fontSize:11,color:c("#9ca3af","#64748b"),marginTop:1}}>출원인: {item.applicantName}</div>}
                {item.classificationCode && <div style={{fontSize:11,color:c("#9ca3af","#64748b")}}>류코드: {item.classificationCode}</div>}
              </div>
              <div style={{flexShrink:0,textAlign:"right"}}>
                {item.applicationStatus && <span style={{display:"block",background: item.applicationStatus.includes("등록")?c("#dcfce7","#14532d"):c("#fef9c3","#422006"),color: item.applicationStatus.includes("등록")?c("#166534","#86efac"):c("#854d0e","#fde68a"),borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,marginBottom:4}}>{item.applicationStatus}</span>}
                <span style={{fontSize:10,color:c("#9ca3af","#64748b")}}>클릭 → 상세</span>
              </div>
            </div>
          ))}
        </div>
        {renderPagination()}
      </div>
    );
  };

  // ── 상세 뷰 우측 패널 ──
  const renderDetailPanel = () => {
    const appNum = detailMode?.appNum;
    if (!appNum) return null;

    const histData = historyResults[appNum];
    const searchItem = searchResults?.items?.find(i => i.applicationNumber === appNum);
    const bib = detailData?.bibliography;
    const goods = detailData?.designatedGoods || [];
    const applicants = detailData?.applicants || [];

    // 지정상품을 상품류별로 그룹화
    const goodsByClass = {};
    goods.forEach(g => {
      const k = g.classificationCode || "기타";
      if (!goodsByClass[k]) goodsByClass[k] = [];
      goodsByClass[k].push(g.goodName);
    });

    // 우선 표시용: 도면 (bigDrawing > drawing > searchItem.drawing)
    const drawingUrl = bib?.bigDrawing || bib?.drawing || searchItem?.bigDrawing || searchItem?.drawing || null;
    const tmName = bib?.title || searchItem?.tradeMarkName || "(상표명 없음)";

    return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",background:c("#fff","#1e293b"),border:`1px solid ${c("#e5e9f5","#334155")}`,borderRadius:16,overflow:"hidden",boxShadow:"0 2px 20px rgba(19,39,79,0.09)"}}>
        {/* 헤더 */}
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${c("#f1f5f9","#334155")}`,flexShrink:0,background:c("#f8faff","#162032"),display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:c("#13274F","#e2e8f0"),display:"flex",alignItems:"center",gap:6}}>
              <span>📑</span> 상표 상세정보
            </div>
            <div style={{fontSize:11,color:c("#9ca3af","#64748b"),marginTop:3,fontFamily:"monospace"}}>{appNum}</div>
          </div>
          <button onClick={handleCloseDetail} title="닫기 (검색결과로 돌아가기)"
            style={{background:c("#fff","#334155"),border:`1px solid ${c("#e5e9f5","#475569")}`,borderRadius:"50%",width:30,height:30,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:c("#6b7280","#cbd5e1"),fontWeight:700,transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=c("#fef2f2","#450a0a");e.currentTarget.style.color="#dc2626";}}
            onMouseLeave={e=>{e.currentTarget.style.background=c("#fff","#334155");e.currentTarget.style.color=c("#6b7280","#cbd5e1");}}>✕</button>
        </div>

        {/* 스크롤 본문 */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
          {detailLoad ? (
            <div style={{textAlign:"center",paddingTop:40}}>
              <div style={{width:30,height:30,border:"3px solid #d0d9f0",borderTop:"3px solid #1a3a8f",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 12px"}} />
              <div style={{fontSize:12,color:c("#6b7280","#94a3b8")}}>상세정보 로딩 중...</div>
            </div>
          ) : (
            <>
              {/* 도면 */}
              <div style={{background:c("#f8faff","#0f172a"),borderRadius:10,padding:20,marginBottom:16,textAlign:"center",border:`1px solid ${c("#e5e9f5","#334155")}`}}>
                {drawingUrl ? (
                  <img src={drawingUrl} alt={tmName} style={{maxWidth:"100%",maxHeight:200,objectFit:"contain"}} onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}} />
                ) : null}
                <div style={{display: drawingUrl?"none":"flex",alignItems:"center",justifyContent:"center",height:120,color:c("#cbd5e1","#475569"),fontSize:40}}>™</div>
                <div style={{marginTop:10,fontSize:14,fontWeight:700,color:c("#13274F","#e2e8f0")}}>{tmName}</div>
              </div>

              {/* 서지정보 */}
              <section style={{marginBottom:18}}>
                <h3 style={{fontSize:12,fontWeight:700,color:c("#13274F","#e2e8f0"),marginBottom:8,paddingBottom:4,borderBottom:`2px solid ${c("#1a3a8f","#3b82f6")}`,display:"flex",alignItems:"center",gap:6}}>📋 서지정보</h3>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <tbody>
                    {[
                      ["출원번호", appNum],
                      ["출원일자", bib?.applicationDate || searchItem?.applicationDate],
                      ["상표명", tmName],
                      ["출원상태", bib?.applicationStatus || searchItem?.applicationStatus],
                      ["상품류", bib?.classificationCode || searchItem?.classificationCode],
                      ["등록번호", bib?.registrationNumber || searchItem?.registrationNumber],
                      ["등록일자", bib?.registrationDate || searchItem?.registrationDate],
                      ["출원공고번호", bib?.publicationNumber],
                      ["출원공고일자", bib?.publicationDate],
                      ["우선권주장", bib?.priorityNumber],
                      ["비엔나코드", bib?.viennaCode],
                    ].filter(([, v]) => v).map(([k, v], i) => (
                      <tr key={i} style={{borderBottom:`1px solid ${c("#f1f5f9","#334155")}`}}>
                        <td style={{padding:"6px 0",color:c("#6b7280","#94a3b8"),fontWeight:600,width:100,verticalAlign:"top"}}>{k}</td>
                        <td style={{padding:"6px 0",color:c("#1f2937","#e2e8f0")}}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* 인명정보 */}
              <section style={{marginBottom:18}}>
                <h3 style={{fontSize:12,fontWeight:700,color:c("#13274F","#e2e8f0"),marginBottom:8,paddingBottom:4,borderBottom:`2px solid ${c("#1a3a8f","#3b82f6")}`,display:"flex",alignItems:"center",gap:6}}>👥 인명정보</h3>
                {applicants.length > 0 ? (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {applicants.map((a, i) => (
                      <div key={i} style={{padding:"8px 12px",background:c("#f8faff","#172035"),borderRadius:8,border:`1px solid ${c("#e5e9f5","#2a3a55")}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span style={{fontSize:10,fontWeight:700,background:c("#dbeafe","#1e3a6e"),color:c("#1e40af","#93c5fd"),padding:"2px 6px",borderRadius:4}}>{a.role || "출원인"}</span>
                          <span style={{fontSize:13,fontWeight:700,color:c("#1f2937","#e2e8f0")}}>{a.name}</span>
                        </div>
                        {a.code && <div style={{fontSize:11,color:c("#9ca3af","#64748b"),fontFamily:"monospace"}}>특허고객번호: {a.code}</div>}
                        {a.address && <div style={{fontSize:11,color:c("#9ca3af","#64748b"),marginTop:2}}>{a.address}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{fontSize:12,color:c("#9ca3af","#64748b"),padding:"10px 0"}}>
                    {searchItem?.applicantName && <div>출원인: <strong>{searchItem.applicantName}</strong></div>}
                    {searchItem?.agentName && <div style={{marginTop:2}}>대리인: <strong>{searchItem.agentName}</strong></div>}
                    {!searchItem?.applicantName && !searchItem?.agentName && "인명정보를 불러올 수 없습니다."}
                  </div>
                )}
              </section>

              {/* 지정상품 */}
              <section style={{marginBottom:18}}>
                <h3 style={{fontSize:12,fontWeight:700,color:c("#13274F","#e2e8f0"),marginBottom:8,paddingBottom:4,borderBottom:`2px solid ${c("#1a3a8f","#3b82f6")}`,display:"flex",alignItems:"center",gap:6}}>🛒 지정상품</h3>
                {goods.length > 0 ? (
                  <>
                    {/* 상품류별 그룹 (키프리스 형식) */}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:10,fontWeight:600,color:c("#9ca3af","#64748b"),marginBottom:4}}>▼ 키프리스 형식 (류별 분류)</div>
                      {Object.entries(goodsByClass).map(([cls, names]) => (
                        <div key={cls} style={{padding:"8px 12px",background:c("#f8faff","#172035"),borderRadius:8,border:`1px solid ${c("#e5e9f5","#2a3a55")}`,marginBottom:6}}>
                          <div style={{fontSize:11,fontWeight:700,color:c("#1a3a8f","#93c5fd"),marginBottom:4}}>제{cls}류 ({names.length}개)</div>
                          <div style={{fontSize:12,color:c("#1f2937","#e2e8f0"),lineHeight:1.6}}>{names.join(" / ")}</div>
                        </div>
                      ))}
                    </div>
                    {/* 쉼표 구분 1행 (요구사항) */}
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:c("#9ca3af","#64748b"),marginBottom:4}}>▼ 쉼표 구분 1행 형식 (복사용)</div>
                      <div style={{padding:"10px 12px",background:c("#fef9c3","#422006"),borderRadius:8,border:`1px solid ${c("#fde68a","#854d0e")}`,fontSize:11,color:c("#854d0e","#fde68a"),lineHeight:1.6,wordBreak:"keep-all",overflowWrap:"break-word"}}>
                        {goods.map(g => g.goodName).join(",")}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{fontSize:12,color:c("#9ca3af","#64748b"),padding:"10px 0"}}>
                    지정상품 정보를 불러올 수 없습니다.
                    <div style={{marginTop:4,fontSize:11}}>
                      <a href={`http://www.kipris.or.kr/khome/main.jsp`} target="_blank" rel="noreferrer" style={{color:c("#1a3a8f","#93c5fd"),textDecoration:"underline"}}>KIPRIS에서 직접 확인 →</a>
                    </div>
                  </div>
                )}
              </section>

              {detailData?.error && (
                <div style={{color:"#dc2626",fontSize:11,padding:"8px 12px",background:c("#fff1f2","#450a0a"),borderRadius:6,marginTop:8}}>
                  ⚠️ 상세정보 API 오류: {detailData.error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ── 최근 출원 패널 ──
  const renderRecentPanel = () => (
    <div style={{background:c("#fff","#1e293b"),border:`1px solid ${c("#e5e9f5","#334155")}`,borderRadius:16,height:"100%",display:"flex",flexDirection:"column",boxShadow:"0 2px 20px rgba(19,39,79,0.09)",overflow:"hidden"}}>
      <div style={{padding:"14px 18px 11px",borderBottom:`1px solid ${c("#f1f5f9","#334155")}`,flexShrink:0,background:c("#f8faff","#162032")}}>
        <div style={{fontSize:13,fontWeight:700,color:c("#13274F","#e2e8f0"),display:"flex",alignItems:"center",gap:6}}><span>🕐</span> 최근 출원 현황 (가엔 DB)</div>
        <div style={{fontSize:11,color:c("#9ca3af","#64748b"),marginTop:3}}>최신순 30건 · 클릭하면 이력 조회</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
        {recentLoad ? <div style={{textAlign:"center",paddingTop:40,color:c("#9ca3af","#64748b"),fontSize:13}}>불러오는 중...</div> :
         recentList.length === 0 ? <div style={{textAlign:"center",paddingTop:40,color:c("#9ca3af","#64748b"),fontSize:13}}>출원번호 데이터 없음</div> :
         recentList.flatMap((item, i) => item.nums.map((num, ni) => {
           const isSel = selectedNum === num;
           return (
             <button key={`${i}-${ni}`} onClick={() => handleSelectRecent(num)}
               style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 10px",marginBottom:4,background: isSel?c("#dbeafe","#1e3a6e"):c(i%2===0?"#fff":"#f8faff",i%2===0?"#1e293b":"#172035"),border:`1.5px solid ${isSel?c("#93c5fd","#3b82f6"):c("#e5e9f5","#2a3a55")}`,borderRadius:10,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",textAlign:"left"}}
               onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=c("#f0f4ff","#1e3a5f");}}
               onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=c(i%2===0?"#fff":"#f8faff",i%2===0?"#1e293b":"#172035");}}>
               <span style={{fontSize:10,fontWeight:700,color:c("#9ca3af","#64748b"),flexShrink:0,minWidth:18}}>{i+ni+1}</span>
               <div style={{flex:1,minWidth:0}}>
                 <div style={{fontSize:12,fontWeight:700,color: isSel?c("#1a3a8f","#93c5fd"):c("#374151","#cbd5e1"),fontFamily:"monospace"}}>{num}</div>
                 <div style={{fontSize:10,color:c("#9ca3af","#64748b"),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{item.title}</div>
               </div>
               {isSel && <span style={{fontSize:12,color:c("#1a3a8f","#93c5fd"),flexShrink:0}}>▶</span>}
             </button>
           );
         }))}
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>KIPRIS 출원 조회 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=EB+Garamond:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{minHeight:"100vh",background:c("linear-gradient(180deg,#fff 0%,#f4f6fc 100%)","linear-gradient(160deg,#0f172a 0%,#1e293b 100%)"),color:c("#1f2937","#e2e8f0"),fontFamily:"'Noto Sans KR',sans-serif",transition:"background .3s,color .3s",overflow:"hidden"}}>

        {/* 상단 버튼 */}
        <div style={{position:"fixed",top:14,right:14,display:"flex",gap:8,zIndex:200}}>
          {searchMode === "trademark" && !detailMode && (
            <button onClick={() => setShowRecent(!showRecent)} title={showRecent?"최근 출원 패널 닫기":"최근 출원 패널 열기"}
              style={{background:showRecent?c("#13274F","#1e3a6e"):"none",color:showRecent?"#fff":c("#374151","#cbd5e1"),border:`2px solid ${c("#d0d9f0","#475569")}`,borderRadius:20,padding:"0 12px",height:40,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              🕐 최근
            </button>
          )}
          <button onClick={() => router.push("/")} title="홈으로" style={{background:"none",border:`2px solid ${c("#d0d9f0","#475569")}`,borderRadius:"50%",width:40,height:40,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>🏠</button>
          <button onClick={() => setDark(!dark)} title={dark?"라이트":"다크"} style={{background:"none",border:`2px solid ${c("#d0d9f0","#475569")}`,borderRadius:"50%",width:40,height:40,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{dark?"☀️":"🌙"}</button>
        </div>

        {/* 헤더 */}
        <div style={{textAlign:"center",paddingTop:"4vh",marginBottom:20,transition:"all .6s ease"}}>
          <div style={{fontFamily:"'EB Garamond',serif",fontSize: layoutReady?26:40,fontWeight:700,color:c("#13274F","#e2e8f0"),letterSpacing:"-0.5px",transition:"font-size .6s ease"}}>Guardian &amp; Angel</div>
          <div style={{fontSize: layoutReady?10:12,letterSpacing:5,color:c("#13274F","#94a3b8"),margin:"5px 0 8px",textTransform:"uppercase",transition:"font-size .6s ease"}}>Intellectual Property</div>
          <div style={{width: layoutReady?180:260,height:1,background:c("#13274F","#475569"),margin:"0 auto 8px",transition:"width .6s ease"}} />
          <div style={{fontSize: layoutReady?13:17,fontWeight:700,color:c("#13274F","#e2e8f0"),letterSpacing:1}}>📡 KIPRIS 출원 조회</div>
        </div>

        {/* 분할 레이아웃 */}
        <div style={{display:"flex",gap:0,height:"calc(100vh - 155px)",maxWidth:1400,margin:"0 auto",padding:"0 16px",alignItems:"flex-start"}}>

          {/* ── 좌측 ── */}
          <div className="left-scroll" style={{width:leftWidth,transition:"width .7s cubic-bezier(.4,0,.2,1)",paddingRight: hasRight?20:0,height:"100%",overflowY:"auto"}}>

            {/* 검색 패널 */}
            <div style={{position:"sticky",top:0,background:c("linear-gradient(180deg,#fff 85%,transparent)","linear-gradient(180deg,#0f172a 85%,transparent)"),paddingBottom:12,zIndex:10}}>

              {/* 모드 탭 */}
              <div style={{display:"flex",gap:0,background:c("#f1f5f9","#1e293b"),borderRadius:10,padding:4,marginBottom:10,border:`1px solid ${c("#e5e9f5","#334155")}`}}>
                {[{key:"appnum",label:"📋 출원번호 조회"},{key:"trademark",label:"🔍 상표 검색"}].map(tab => (
                  <button key={tab.key} onClick={() => handleTabChange(tab.key)}
                    style={{flex:1,padding:"8px 0",fontSize:13,fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",background: searchMode===tab.key?c("#13274F","#1e3a6e"):"transparent",color: searchMode===tab.key?"#fff":c("#6b7280","#94a3b8")}}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 출원번호 검색 */}
              {searchMode === "appnum" && (
                <div style={{display:"flex",gap:8,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#cbd5e1","#334155")}`,borderRadius:12,padding:"7px 7px 7px 16px",boxShadow:"0 2px 12px rgba(19,39,79,0.10)"}}>
                  <input ref={appInputRef} value={inputAppNum} onChange={e=>setInputAppNum(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                    placeholder="40-2020-0000000" autoFocus
                    style={{flex:1,border:"none",outline:"none",fontSize:15,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"monospace"}} />
                  {inputAppNum && <button onClick={handleClear} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:16}}>✕</button>}
                  <button onClick={()=>handleSubmit(1)} style={{background:"#13274F",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>조회</button>
                </div>
              )}

              {/* 상표명 검색 */}
              {searchMode === "trademark" && (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:8,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#cbd5e1","#334155")}`,borderRadius:12,padding:"7px 7px 7px 16px",boxShadow:"0 2px 12px rgba(19,39,79,0.10)"}}>
                    <span style={{fontSize:16}}>™</span>
                    <input ref={tmInputRef} value={inputTmName} onChange={e=>setInputTmName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                      placeholder='상표명 (예: 스타벅스 / 검색식: "스벅" * 스타벅스)'
                      style={{flex:1,border:"none",outline:"none",fontSize:14,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"inherit"}} />
                    {(inputTmName||inputClass||inputSim||inputAppli||inputAgent) && <button onClick={handleClear} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:15}}>✕</button>}
                    <button onClick={()=>handleSubmit(1)} style={{background:"#13274F",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>검색</button>
                  </div>

                  {/* 조건 필터 2행 */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{display:"flex",gap:6,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#e5e9f5","#334155")}`,borderRadius:10,padding:"6px 12px",alignItems:"center"}}>
                      <span style={{fontSize:12,color:c("#9ca3af","#64748b"),flexShrink:0,fontWeight:600}}>상품류</span>
                      <input value={inputClass} onChange={e=>setInputClass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                        placeholder="예: 35" style={{flex:1,border:"none",outline:"none",fontSize:13,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"monospace",width:0,minWidth:0}} />
                    </div>
                    <div style={{display:"flex",gap:6,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#e5e9f5","#334155")}`,borderRadius:10,padding:"6px 12px",alignItems:"center"}}>
                      <span style={{fontSize:12,color:c("#9ca3af","#64748b"),flexShrink:0,fontWeight:600}}>유사군</span>
                      <input value={inputSim} onChange={e=>setInputSim(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                        placeholder="예: G0301" style={{flex:1,border:"none",outline:"none",fontSize:13,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"monospace",width:0,minWidth:0}} />
                    </div>
                    <div style={{display:"flex",gap:6,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#e5e9f5","#334155")}`,borderRadius:10,padding:"6px 12px",alignItems:"center"}}>
                      <span style={{fontSize:12,color:c("#9ca3af","#64748b"),flexShrink:0,fontWeight:600}}>출원인</span>
                      <input value={inputAppli} onChange={e=>setInputAppli(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                        placeholder="예: 주식회사 카카오" style={{flex:1,border:"none",outline:"none",fontSize:13,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"inherit",width:0,minWidth:0}} />
                    </div>
                    <div style={{display:"flex",gap:6,background:c("#f8faff","#1e293b"),border:`1.5px solid ${c("#e5e9f5","#334155")}`,borderRadius:10,padding:"6px 12px",alignItems:"center"}}>
                      <span style={{fontSize:12,color:c("#9ca3af","#64748b"),flexShrink:0,fontWeight:600}}>대리인</span>
                      <input value={inputAgent} onChange={e=>setInputAgent(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit(1)}
                        placeholder="예: 김수산" style={{flex:1,border:"none",outline:"none",fontSize:13,color:c("#1f2937","#e2e8f0"),background:"transparent",fontFamily:"inherit",width:0,minWidth:0}} />
                    </div>
                  </div>
                  <div style={{fontSize:11,color:c("#9ca3af","#64748b"),paddingLeft:4}}>
                    검색식 지원: <code style={{background:c("#f1f5f9","#334155"),padding:"0 4px",borderRadius:3,fontSize:10}}>+</code>(AND) <code style={{background:c("#f1f5f9","#334155"),padding:"0 4px",borderRadius:3,fontSize:10}}>*</code>(OR) · KIPRIS 전체 데이터 기준
                  </div>
                </div>
              )}
            </div>

            {/* 로딩 */}
            {loading && <div style={{textAlign:"center",paddingTop:50}}>
              <div style={{width:32,height:32,border:"3px solid #d0d9f0",borderTop:"3px solid #1a3a8f",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 14px"}} />
              <div style={{color:c("#6b7280","#94a3b8"),fontSize:14}}>KIPRIS 조회 중...</div>
            </div>}

            {/* 결과 */}
            {!loading && resultMode === "history" && Object.entries(historyResults).map(([num, data]) => <div key={num}>{renderHistory(num, data)}</div>)}
            {!loading && resultMode === "search" && !detailMode && renderSearchResults()}
            {/* 상세 모드일 땐 좌측에 해당 출원번호의 이력만 표시 */}
            {!loading && detailMode && historyResults[detailMode.appNum] && renderHistory(detailMode.appNum, historyResults[detailMode.appNum])}
          </div>

          {/* ── 우측 ── */}
          <div style={{width:rightWidth,opacity:hasRight?1:0,overflow:"hidden",transition:"width .7s cubic-bezier(.4,0,.2,1), opacity .5s ease .3s",height:"100%"}}>
            {rightPanel === "recent" && renderRecentPanel()}
            {rightPanel === "detail" && renderDetailPanel()}
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
