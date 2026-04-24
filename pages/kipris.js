// pages/kipris.js
// 출원번호 입력 → KIPRIS 실시간 행정처리 이력 조회 페이지

import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const STEP_COLOR = {
  "출원": { bg: "#dbeafe", text: "#1e40af", dark_bg: "#1e3a6e", dark_text: "#93c5fd" },
  "심판": { bg: "#fce7f3", text: "#9d174d", dark_bg: "#500724", dark_text: "#f9a8d4" },
  "등록": { bg: "#dcfce7", text: "#166534", dark_bg: "#14532d", dark_text: "#86efac" },
};

const STEP_ICON = { "출원": "📋", "심판": "⚖️", "등록": "✅" };

// "40-2026-0040463" 패턴 파싱
function extractApplicationNumbers(text) {
  if (!text) return [];
  const matches = text.match(/\d{2}-\d{4}-\d{7}/g) || [];
  return [...new Set(matches)]; // 중복 제거
}

export default function KiprisPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({}); // { appNum: { items, registrationNumber, latestStep, error } }
  const [searched, setSearched] = useState(false);

  const bg = dark ? "linear-gradient(160deg,#0f172a 0%,#1e293b 100%)" : "linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%)";
  const color = dark ? "#e2e8f0" : "#1f2937";

  const handleSearch = async () => {
    const numbers = extractApplicationNumbers(input);
    if (numbers.length === 0) return alert("출원번호 형식을 확인해주세요 (예: 40-2026-0040463)");

    setLoading(true);
    setSearched(true);
    setResults({});

    const newResults = {};
    await Promise.all(numbers.map(async (num) => {
      try {
        const res = await fetch("/api/kipris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationNumber: num }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          newResults[num] = { error: data.error || "조회 실패" };
        } else {
          newResults[num] = data;
        }
      } catch (e) {
        newResults[num] = { error: e.message };
      }
    }));

    setResults(newResults);
    setLoading(false);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  return (
    <>
      <Head>
        <title>KIPRIS 출원 상태 조회 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=EB+Garamond:wght@600;700&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: "100vh", background: bg, color, fontFamily: "'Noto Sans KR', sans-serif", padding: "0 16px 60px", transition: "background .3s, color .3s" }}>

        {/* 상단 버튼 */}
        <div style={{ position: "fixed", top: 14, right: 14, display: "flex", gap: 8, zIndex: 100 }}>
          <button onClick={() => router.push("/")}
            style={{ background: "none", border: "2px solid #d0d9f0", borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            title="홈으로">🏠</button>
          <button onClick={() => setDark(!dark)}
            style={{ background: "none", border: "2px solid #d0d9f0", borderRadius: "50%", width: 40, height: 40, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            title={dark ? "라이트" : "다크"}>{dark ? "☀️" : "🌙"}</button>
        </div>

        {/* 헤더 */}
        <div style={{ textAlign: "center", paddingTop: "8vh", marginBottom: 32 }}>
          <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 40, fontWeight: 700, color: dark ? "#e2e8f0" : "#13274F", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Guardian &amp; Angel
          </div>
          <div style={{ fontSize: 11, letterSpacing: 6, color: dark ? "#94a3b8" : "#13274F", marginBottom: 12, textTransform: "uppercase" }}>
            Intellectual Property
          </div>
          <div style={{ width: 300, height: 1, background: dark ? "#475569" : "#13274F", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: dark ? "#e2e8f0" : "#13274F", letterSpacing: 2 }}>
            📡 KIPRIS 출원 상태 조회
          </div>
          <div style={{ fontSize: 12, color: dark ? "#94a3b8" : "#6b7280", marginTop: 6 }}>
            출원번호를 입력하면 실시간 행정처리 이력을 조회합니다
          </div>
        </div>

        {/* 검색창 */}
        <div style={{ maxWidth: 600, margin: "0 auto 32px" }}>
          <div style={{ display: "flex", gap: 8, background: dark ? "#1e293b" : "#f8faff", border: `1.5px solid ${dark ? "#334155" : "#cbd5e1"}`, borderRadius: 10, padding: "6px 6px 6px 16px", boxShadow: "0 2px 12px rgba(19,39,79,0.08)" }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="40-2026-0040463  (복수 입력 가능: 줄바꿈 or 공백 구분)"
              autoFocus
              style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: dark ? "#e2e8f0" : "#1f2937", background: "transparent", fontFamily: "inherit" }}
            />
            {input && (
              <button onClick={() => { setInput(""); setSearched(false); setResults({}); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 15, padding: "0 4px" }}>✕</button>
            )}
            <button onClick={handleSearch}
              style={{ background: "#13274F", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
              조회
            </button>
          </div>
          <div style={{ fontSize: 11, color: dark ? "#64748b" : "#9ca3af", marginTop: 6, textAlign: "center" }}>
            Notion DB의 출원번호 형식 그대로 붙여넣기 가능 (류, 날짜 자동 제거)
          </div>
        </div>

        {/* 결과 */}
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {loading && (
            <div style={{ textAlign: "center", paddingTop: 60 }}>
              <div style={{ width: 36, height: 36, border: "3px solid #d0d9f0", borderTop: "3px solid #1a3a8f", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
              <div style={{ color: dark ? "#94a3b8" : "#6b7280", fontSize: 14 }}>KIPRIS 조회 중...</div>
            </div>
          )}

          {!loading && searched && Object.keys(results).length > 0 && Object.entries(results).map(([appNum, data]) => (
            <div key={appNum} style={{ marginBottom: 32, background: dark ? "#1e293b" : "#fff", border: `1px solid ${dark ? "#334155" : "#e5e9f5"}`, borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 16px rgba(19,39,79,0.07)" }}>

              {/* 출원번호 헤더 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: dark ? "#93c5fd" : "#1a3a8f" }}>{appNum}</div>
                    {data.registrationNumber && (
                      <div style={{ fontSize: 12, color: dark ? "#86efac" : "#166534", fontWeight: 700, marginTop: 2 }}>
                        ✅ 등록번호: {data.registrationNumber}
                      </div>
                    )}
                  </div>
                </div>
                {data.latestStep && (() => {
                  const sc = STEP_COLOR[data.latestStep] || STEP_COLOR["출원"];
                  return (
                    <span style={{ background: dark ? sc.dark_bg : sc.bg, color: dark ? sc.dark_text : sc.text, borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>
                      {STEP_ICON[data.latestStep] || "📌"} 현재: {data.latestStep} 단계
                    </span>
                  );
                })()}
              </div>

              {/* 오류 */}
              {data.error && (
                <div style={{ color: "#dc2626", fontSize: 13, padding: "10px 14px", background: dark ? "#450a0a" : "#fff1f2", borderRadius: 8 }}>
                  ⚠️ 오류: {data.error}
                </div>
              )}

              {/* 이력 타임라인 */}
              {data.items && data.items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: dark ? "#64748b" : "#9ca3af", marginBottom: 4 }}>
                    총 {data.items.length}건의 행정처리 이력
                  </div>
                  {[...data.items].reverse().map((item, idx) => {
                    const sc = STEP_COLOR[item.step] || STEP_COLOR["출원"];
                    return (
                      <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: dark ? (idx === 0 ? "#162032" : "#172035") : (idx === 0 ? "#f0f9ff" : "#f8faff"), borderRadius: 10, border: `1px solid ${dark ? "#2a3a55" : "#e5e9f5"}` }}>

                        {/* 날짜 */}
                        <div style={{ flexShrink: 0, minWidth: 82, fontSize: 11, color: dark ? "#64748b" : "#9ca3af", fontWeight: 600, paddingTop: 2 }}>
                          {item.documentDateFmt || item.documentDate}
                        </div>

                        {/* 단계 배지 */}
                        <div style={{ flexShrink: 0, paddingTop: 1 }}>
                          <span style={{ background: dark ? sc.dark_bg : sc.bg, color: dark ? sc.dark_text : sc.text, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                            {item.step}
                          </span>
                        </div>

                        {/* 서류명 + 처리상태 */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: dark ? "#e2e8f0" : "#1f2937" }}>
                            {item.documentTitle}
                          </div>
                          {item.status && (
                            <div style={{ fontSize: 11, color: dark ? "#94a3b8" : "#6b7280", marginTop: 2 }}>
                              처리상태: {item.status}
                            </div>
                          )}
                          {item.registrationNumber && (
                            <div style={{ fontSize: 11, color: dark ? "#86efac" : "#166534", marginTop: 2, fontWeight: 700 }}>
                              등록번호: {item.registrationNumber}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {data.items && data.items.length === 0 && !data.error && (
                <div style={{ textAlign: "center", padding: "20px", color: dark ? "#64748b" : "#9ca3af", fontSize: 13 }}>
                  조회된 이력이 없습니다. 출원번호를 확인해주세요.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #9ca3af; }
      `}</style>
    </>
  );
}
