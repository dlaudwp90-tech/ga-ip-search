// pages/kipris.js

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const STEP_COLOR = {
  "출원": { bg: "#dbeafe", text: "#1e40af", darkBg: "#1e3a6e", darkText: "#93c5fd" },
  "심판": { bg: "#fce7f3", text: "#9d174d", darkBg: "#500724", darkText: "#f9a8d4" },
  "등록": { bg: "#dcfce7", text: "#166534", darkBg: "#14532d", darkText: "#86efac" },
};
const STEP_ICON = { "출원": "📋", "심판": "⚖️", "등록": "✅" };

function extractApplicationNumbers(text) {
  if (!text) return [];
  return [...new Set(text.match(/\d{2}-\d{4}-\d{7}/g) || [])];
}

function isAppNumberInput(text) {
  return /\d{2}-\d{4}-\d{7}/.test(text.trim());
}

export default function KiprisPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultMode, setResultMode] = useState(null); // "history" | "search"
  const [historyResults, setHistoryResults] = useState({}); // { appNum: data }
  const [searchResults, setSearchResults] = useState(null); // { items, totalCount }
  const [searched, setSearched] = useState(false);
  const [layout, setLayout] = useState("center"); // "center" | "split"
  const [recentList, setRecentList] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [selectedNum, setSelectedNum] = useState(null);
  const inputRef = useRef(null);

  // 다크모드 시스템 감지
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    mq.addEventListener("change", e => setDark(e.matches));
  }, []);

  // 마운트 후 레이아웃 분할 애니메이션 (1초 후)
  useEffect(() => {
    const timer = setTimeout(() => setLayout("split"), 800);
    return () => clearTimeout(timer);
  }, []);

  // Notion 최근 출원번호 로드
  useEffect(() => {
    fetch("/api/kipris-recent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => setRecentList(d.results || []))
      .catch(() => {})
      .finally(() => setRecentLoading(false));
  }, []);

  const c = (light, dk) => dark ? dk : light;

  const doSearch = async (value) => {
    const q = (value || input).trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);
    setHistoryResults({});
    setSearchResults(null);

    // 출원번호인지 상표명인지 판별
    if (isAppNumberInput(q)) {
      setResultMode("history");
      const numbers = extractApplicationNumbers(q);
      const newResults = {};
      await Promise.all(numbers.map(async (num) => {
        try {
          const res = await fetch("/api/kipris", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "history", applicationNumber: num }),
          });
          const data = await res.json();
          newResults[num] = data.error ? { error: data.error } : data;
        } catch (e) {
          newResults[num] = { error: e.message };
        }
      }));
      setHistoryResults(newResults);
    } else {
      setResultMode("search");
      try {
        const res = await fetch("/api/kipris", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "search", tradeMarkName: q }),
        });
        const data = await res.json();
        setSearchResults(data.error ? { error: data.error, items: [] } : data);
      } catch (e) {
        setSearchResults({ error: e.message, items: [] });
      }
    }

    setLoading(false);
  };

  const handleSelect = (num, title) => {
    setSelectedNum(num);
    setInput(num);
    doSearch(num);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setInput(""); setSearched(false); setHistoryResults({}); setSearchResults(null);
    setSelectedNum(null); setResultMode(null);
    inputRef.current?.focus();
  };

  const isSplit = layout === "split";

  return (
    <>
      <Head>
        <title>KIPRIS 출원 조회 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=EB+Garamond:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: "100vh", background: c("linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%)", "linear-gradient(160deg,#0f172a 0%,#1e293b 100%)"), color: c("#1f2937", "#e2e8f0"), fontFamily: "'Noto Sans KR', sans-serif", transition: "background .3s, color .3s", overflow: "hidden" }}>

        {/* 상단 버튼 */}
        <div style={{ position: "fixed", top: 14, right: 14, display: "flex", gap: 8, zIndex: 200 }}>
          <button onClick={() => router.push("/")} title="홈으로"
            style={{ background: "none", border: `2px solid ${c("#d0d9f0","#475569")}`, borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🏠</button>
          <button onClick={() => setDark(!dark)} title={dark ? "라이트" : "다크"}
            style={{ background: "none", border: `2px solid ${c("#d0d9f0","#475569")}`, borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{dark ? "☀️" : "🌙"}</button>
        </div>

        {/* 헤더 */}
        <div style={{ textAlign: "center", paddingTop: "5vh", marginBottom: 28, transition: "all .6s ease" }}>
          <div style={{ fontFamily: "'EB Garamond', serif", fontSize: isSplit ? 30 : 42, fontWeight: 700, color: c("#13274F", "#e2e8f0"), letterSpacing: "-0.5px", transition: "font-size .6s ease" }}>
            Guardian &amp; Angel
          </div>
          <div style={{ fontSize: isSplit ? 10 : 12, letterSpacing: 5, color: c("#13274F", "#94a3b8"), margin: "6px 0 10px", textTransform: "uppercase", transition: "font-size .6s ease" }}>
            Intellectual Property
          </div>
          <div style={{ width: isSplit ? 220 : 300, height: 1, background: c("#13274F", "#475569"), margin: "0 auto 10px", transition: "width .6s ease" }} />
          <div style={{ fontSize: isSplit ? 15 : 18, fontWeight: 700, color: c("#13274F", "#e2e8f0"), letterSpacing: 1 }}>
            📡 KIPRIS 출원 조회
          </div>
        </div>

        {/* 분할 레이아웃 컨테이너 */}
        <div style={{ display: "flex", gap: 0, height: "calc(100vh - 180px)", maxWidth: 1300, margin: "0 auto", padding: "0 16px", alignItems: "flex-start" }}>

          {/* ── 좌측: 검색창 + 결과 ── */}
          <div style={{
            width: isSplit ? "55%" : "100%",
            transition: "width .7s cubic-bezier(.4,0,.2,1)",
            paddingRight: isSplit ? 20 : 0,
            height: "100%",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: c("#cbd5e1 #f1f5f9", "#334155 #1e293b"),
          }}>
            {/* 검색창 */}
            <div style={{ position: "sticky", top: 0, background: c("linear-gradient(180deg,#fff 80%,transparent)", "linear-gradient(180deg,#0f172a 80%,transparent)"), paddingBottom: 12, zIndex: 10 }}>
              <div style={{ display: "flex", gap: 8, background: c("#f8faff", "#1e293b"), border: `1.5px solid ${c("#cbd5e1","#334155")}`, borderRadius: 12, padding: "7px 7px 7px 16px", boxShadow: "0 2px 12px rgba(19,39,79,0.10)" }}>
                <span style={{ fontSize: 17 }}>🔍</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
                  placeholder="40-2020-0000000  또는  상표명 입력"
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: c("#1f2937","#e2e8f0"), background: "transparent", fontFamily: "inherit" }}
                />
                {input && <button onClick={handleClear} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>✕</button>}
                <button onClick={() => doSearch()} style={{ background: "#13274F", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>조회</button>
              </div>
              <div style={{ fontSize: 11, color: c("#9ca3af","#64748b"), marginTop: 5, textAlign: "center" }}>
                출원번호 또는 상표명으로 검색 · KIPRIS 전체 데이터 기준
              </div>
            </div>

            {/* 로딩 */}
            {loading && (
              <div style={{ textAlign: "center", paddingTop: 50 }}>
                <div style={{ width: 32, height: 32, border: "3px solid #d0d9f0", borderTop: "3px solid #1a3a8f", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 14px" }} />
                <div style={{ color: c("#6b7280","#94a3b8"), fontSize: 14 }}>KIPRIS 조회 중...</div>
              </div>
            )}

            {/* ── 결과: 행정처리이력 ── */}
            {!loading && resultMode === "history" && Object.entries(historyResults).map(([appNum, data]) => (
              <div key={appNum} style={{ marginBottom: 24, background: c("#fff","#1e293b"), border: `1px solid ${c("#e5e9f5","#334155")}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 2px 12px rgba(19,39,79,0.07)" }}>
                {/* 출원번호 헤더 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: c("#1a3a8f","#93c5fd") }}>📋 {appNum}</div>
                    {data.registrationNumber && (
                      <div style={{ fontSize: 12, color: c("#166534","#86efac"), fontWeight: 700, marginTop: 3 }}>
                        ✅ 등록번호: {data.registrationNumber}
                      </div>
                    )}
                  </div>
                  {data.latestStep && (() => {
                    const sc = STEP_COLOR[data.latestStep] || STEP_COLOR["출원"];
                    return (
                      <span style={{ background: c(sc.bg, sc.darkBg), color: c(sc.text, sc.darkText), borderRadius: 20, padding: "4px 14px", fontSize: 12, fontWeight: 700 }}>
                        {STEP_ICON[data.latestStep]} {data.latestStep} 단계
                      </span>
                    );
                  })()}
                </div>

                {data.error && (
                  <div style={{ color: "#dc2626", fontSize: 13, padding: "10px 14px", background: c("#fff1f2","#450a0a"), borderRadius: 8 }}>⚠️ {data.error}</div>
                )}

                {data.items?.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11, color: c("#9ca3af","#64748b"), marginBottom: 4 }}>총 {data.items.length}건 이력</div>
                    {[...data.items].reverse().map((item, idx) => {
                      const sc = STEP_COLOR[item.step] || STEP_COLOR["출원"];
                      return (
                        <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", background: c(idx === 0 ? "#f0f9ff" : "#f8faff", idx === 0 ? "#162032" : "#172035"), borderRadius: 9, border: `1px solid ${c("#e5e9f5","#2a3a55")}` }}>
                          <div style={{ flexShrink: 0, minWidth: 78, fontSize: 11, color: c("#9ca3af","#64748b"), fontWeight: 600, paddingTop: 2 }}>{item.documentDateFmt}</div>
                          <div style={{ flexShrink: 0, paddingTop: 1 }}>
                            <span style={{ background: c(sc.bg, sc.darkBg), color: c(sc.text, sc.darkText), borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{item.step}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: c("#1f2937","#e2e8f0") }}>{item.documentTitle}</div>
                            {item.status && <div style={{ fontSize: 11, color: c("#6b7280","#94a3b8"), marginTop: 2 }}>처리상태: {item.status}</div>}
                            {item.registrationNumber && <div style={{ fontSize: 11, color: c("#166534","#86efac"), marginTop: 2, fontWeight: 700 }}>등록번호: {item.registrationNumber}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {data.items?.length === 0 && !data.error && (
                  <div style={{ textAlign: "center", padding: 20, color: c("#9ca3af","#64748b"), fontSize: 13 }}>조회된 이력이 없습니다.</div>
                )}
              </div>
            ))}

            {/* ── 결과: 상표명 검색 ── */}
            {!loading && resultMode === "search" && searchResults && (
              <div>
                {searchResults.error && (
                  <div style={{ color: "#dc2626", fontSize: 13, padding: "10px 14px", background: c("#fff1f2","#450a0a"), borderRadius: 8, marginBottom: 16 }}>⚠️ {searchResults.error}</div>
                )}
                {searchResults.items?.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: c("#6b7280","#94a3b8"), marginBottom: 12 }}>검색 결과 {searchResults.totalCount}건 (최대 30건 표시)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {searchResults.items.map((item, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 14, alignItems: "center", background: c("#fff","#1e293b"), border: `1px solid ${c("#e5e9f5","#334155")}`, borderRadius: 12, padding: "12px 16px", boxShadow: "0 1px 6px rgba(19,39,79,0.06)", cursor: "pointer", transition: "box-shadow .15s" }}
                          onClick={() => { setInput(item.applicationNumber); doSearch(item.applicationNumber); }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(19,39,79,0.14)"}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 6px rgba(19,39,79,0.06)"}>
                          {/* 상표도면 */}
                          <div style={{ width: 72, height: 72, flexShrink: 0, background: c("#f1f5f9","#334155"), borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${c("#e5e9f5","#475569")}` }}>
                            {item.drawing ? (
                              <img src={item.drawing} alt={item.tradeMarkName} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
                            ) : null}
                            <div style={{ display: item.drawing ? "none" : "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 24, color: c("#cbd5e1","#475569") }}>™</div>
                          </div>
                          {/* 정보 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: c("#1a3a8f","#93c5fd"), marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.tradeMarkName || "(상표명 없음)"}
                            </div>
                            <div style={{ fontSize: 12, color: c("#6b7280","#94a3b8"), marginBottom: 3 }}>
                              출원번호: <span style={{ fontWeight: 600, color: c("#374151","#cbd5e1") }}>{item.applicationNumber}</span>
                            </div>
                            {item.applicantName && <div style={{ fontSize: 11, color: c("#9ca3af","#64748b") }}>출원인: {item.applicantName}</div>}
                            {item.applicationDate && <div style={{ fontSize: 11, color: c("#9ca3af","#64748b") }}>출원일: {item.applicationDate}</div>}
                          </div>
                          {/* 상태 */}
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            {item.registerStatus && (
                              <span style={{ background: item.registerStatus.includes("등록") ? c("#dcfce7","#14532d") : c("#fef9c3","#422006"), color: item.registerStatus.includes("등록") ? c("#166534","#86efac") : c("#854d0e","#fde68a"), borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700 }}>
                                {item.registerStatus}
                              </span>
                            )}
                            <div style={{ fontSize: 10, color: c("#9ca3af","#64748b"), marginTop: 4 }}>클릭 → 이력조회</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {searchResults.items?.length === 0 && !searchResults.error && (
                  <div style={{ textAlign: "center", paddingTop: 40, color: c("#9ca3af","#64748b") }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div>검색 결과가 없습니다</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 우측: 최근 출원번호 패널 ── */}
          <div style={{
            width: isSplit ? "45%" : "0%",
            opacity: isSplit ? 1 : 0,
            overflow: "hidden",
            transition: "width .7s cubic-bezier(.4,0,.2,1), opacity .5s ease .3s",
            height: "100%",
          }}>
            <div style={{ background: c("#fff","#1e293b"), border: `1px solid ${c("#e5e9f5","#334155")}`, borderRadius: 16, height: "100%", display: "flex", flexDirection: "column", boxShadow: "0 2px 20px rgba(19,39,79,0.09)", overflow: "hidden" }}>
              {/* 패널 헤더 */}
              <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${c("#f1f5f9","#334155")}`, flexShrink: 0, background: c("#f8faff","#162032") }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c("#13274F","#e2e8f0"), display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🕐</span> 최근 출원 현황 (가엔 DB)
                </div>
                <div style={{ fontSize: 11, color: c("#9ca3af","#64748b"), marginTop: 3 }}>최신순 30건 · 클릭하면 이력 조회</div>
              </div>

              {/* 출원번호 목록 */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", scrollbarWidth: "thin", scrollbarColor: c("#cbd5e1 #f1f5f9","#334155 #1e293b") }}>
                {recentLoading ? (
                  <div style={{ textAlign: "center", paddingTop: 40, color: c("#9ca3af","#64748b"), fontSize: 13 }}>불러오는 중...</div>
                ) : recentList.length === 0 ? (
                  <div style={{ textAlign: "center", paddingTop: 40, color: c("#9ca3af","#64748b"), fontSize: 13 }}>출원번호 데이터 없음</div>
                ) : (
                  recentList.map((item, i) => (
                    <div key={i}>
                      {item.nums.map((num, ni) => (
                        <button key={ni} onClick={() => handleSelect(num, item.title)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 4, background: selectedNum === num ? c("#dbeafe","#1e3a6e") : c(i % 2 === 0 ? "#fff" : "#f8faff", i % 2 === 0 ? "#1e293b" : "#172035"), border: `1.5px solid ${selectedNum === num ? c("#93c5fd","#3b82f6") : c("#e5e9f5","#2a3a55")}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", transition: "all .15s", textAlign: "left" }}
                          onMouseEnter={e => { if (selectedNum !== num) e.currentTarget.style.background = c("#f0f4ff","#1e3a5f"); }}
                          onMouseLeave={e => { if (selectedNum !== num) e.currentTarget.style.background = c(i % 2 === 0 ? "#fff" : "#f8faff", i % 2 === 0 ? "#1e293b" : "#172035"); }}>
                          {/* 순번 */}
                          <span style={{ fontSize: 10, fontWeight: 700, color: c("#9ca3af","#64748b"), flexShrink: 0, minWidth: 18 }}>{i * item.nums.length + ni + 1}</span>
                          {/* 출원번호 */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: selectedNum === num ? c("#1a3a8f","#93c5fd") : c("#374151","#cbd5e1"), fontFamily: "monospace", letterSpacing: "0.3px" }}>{num}</div>
                            <div style={{ fontSize: 10, color: c("#9ca3af","#64748b"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{item.title}</div>
                          </div>
                          {/* 선택 표시 */}
                          {selectedNum === num && <span style={{ fontSize: 12, color: c("#1a3a8f","#93c5fd"), flexShrink: 0 }}>▶</span>}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #9ca3af; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </>
  );
}
