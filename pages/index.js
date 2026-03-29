import { useState, useRef } from "react";
import Head from "next/head";

// 1행 고정 (문서제목, 유형, 상태, 카테고리)
function renderSingleLine(text) {
  if (!text) return "—";
  return text.split("\n")[0];
}

// 들여쓰기 렌더링 (출원번호, 출원인, 대리인 코드)
// 각 줄은 절대 줄바꿈 없이 표시, \n 있으면 두 번째 줄부터 들여쓰기
function renderWithIndent(text) {
  if (!text) return <span className="cell-text">—</span>;
  const lines = text.split("\n");
  if (lines.length === 1) {
    return <span className="cell-text">{text}</span>;
  }
  return (
    <div className="indent-block">
      {lines.map((line, i) => (
        <div key={i} className={i === 0 ? "first-line" : "indent-line"}>
          {line || "\u3000"}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [dark, setDark] = useState(false);
  const [popup, setPopup] = useState(null);
  const [copied, setCopied] = useState({});
  const inputRef = useRef(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults(null); setSearched(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 실패");
      setResults(data.results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleClear = () => {
    setQuery(""); setSearched(false); setResults(null); setError(null);
    inputRef.current?.focus();
  };

  const handleTitleClick = (e, url) => {
    e.stopPropagation();
    setPopup({ url });
  };

  const openInNotion = () => {
    if (!popup?.url) return;
    const deepLink = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    window.location.href = deepLink;
    setPopup(null);
  };

  const openInBrowser = () => {
    if (!popup?.url) return;
    window.open(popup.url, "_blank");
    setPopup(null);
  };

  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 1500);
    });
  };

  const isMultiLine = (text) => text && text.includes("\n");

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
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={`page${searched ? " searched" : ""}${dark ? " dark" : ""}`}>

        <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? "라이트 모드" : "다크 모드"}>
          {dark ? "☀️" : "🌙"}
        </button>

        <div className="logo-area" onClick={searched ? handleClear : undefined} style={searched ? { cursor: "pointer" } : {}}>
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

        <div className="search-wrap">
          <div className="search-box">
            <span className="icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="문서명, 출원번호, 출원인, 대리인 코드..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        <div className="results">
          {loading && (
            <div className="loading">
              <div className="spinner" />
              <p>Notion DB 검색 중...</p>
            </div>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          {!loading && results !== null && (
            results.length === 0 ? (
              <div className="no-result">
                <p className="no-icon">📭</p>
                <p className="no-text">검색 결과가 없습니다</p>
                <p className="no-sub">다른 키워드로 시도해 보세요</p>
              </div>
            ) : (
              <>
                <p className="count">검색 결과 {results.length}건</p>
                <div className="table-outer">
                  <table>
                    <thead>
                      <tr>
                        <th>문서 제목</th>
                        <th>유형</th>
                        <th>상태</th>
                        <th>카테고리</th>
                        <th>출원번호</th>
                        <th>출원인(특허고객번호)</th>
                        <th>대리인 코드</th>
                        <th>마감일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} className={`result-row ${i % 2 === 0 ? "row-even" : "row-odd"}`}>

                          {/* 문서제목 - 1행 고정 */}
                          <td className="td-nowrap">
                            <div className="cell-inner">
                              <span className="doc-icon">📄</span>
                              <span className="doc-title" onClick={(e) => handleTitleClick(e, row.url)}>
                                {renderSingleLine(row.title)}
                              </span>
                            </div>
                          </td>

                          {/* 유형 - 1행 고정 */}
                          <td className="td-nowrap">
                            {row.type ? <span className="badge type">{renderSingleLine(row.type)}</span> : <span className="dash">—</span>}
                          </td>

                          {/* 상태 - 1행 고정 */}
                          <td className="td-nowrap">
                            {row.status ? <span className="badge status">{renderSingleLine(row.status)}</span> : <span className="dash">—</span>}
                          </td>

                          {/* 카테고리 - 1행 고정 */}
                          <td className="td-nowrap">
                            {row.category ? <span className="badge category">{renderSingleLine(row.category)}</span> : <span className="dash">—</span>}
                          </td>

                          {/* 출원번호 */}
                          <td className={isMultiLine(row.appNum) ? "td-top" : "td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appNum)}
                              {row.appNum && (
                                <button className={`copy-btn${copied[`${i}-appNum`] ? " copied" : ""}`}
                                  onClick={(e) => handleCopy(e, row.appNum, `${i}-appNum`)}>
                                  {copied[`${i}-appNum`] ? "✓" : "복사"}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 출원인 */}
                          <td className={isMultiLine(row.appOwner) ? "td-top" : "td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.appOwner)}
                              {row.appOwner && (
                                <button className={`copy-btn${copied[`${i}-appOwner`] ? " copied" : ""}`}
                                  onClick={(e) => handleCopy(e, row.appOwner, `${i}-appOwner`)}>
                                  {copied[`${i}-appOwner`] ? "✓" : "복사"}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 대리인 코드 */}
                          <td className={isMultiLine(row.agentCode) ? "td-top" : "td-nowrap"}>
                            <div className="copy-wrap">
                              {renderWithIndent(row.agentCode)}
                              {row.agentCode && (
                                <button className={`copy-btn${copied[`${i}-agentCode`] ? " copied" : ""}`}
                                  onClick={(e) => handleCopy(e, row.agentCode, `${i}-agentCode`)}>
                                  {copied[`${i}-agentCode`] ? "✓" : "복사"}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* 마감일 */}
                          <td className="td-nowrap">
                            <span className="cell-text">{row.deadline || "—"}</span>
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 노션 DB 전체보기 버튼 */}
                <div className="notion-db-wrap">
                  <button
                    className="notion-db-btn"
                    onClick={() => window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a", "_blank")}
                  >
                    📋 G&A IP 문서 DB 전체 보기 (Notion)
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {popup && (
        <div className="overlay" onClick={() => setPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-icon">📄</p>
            <p className="modal-title">노션에서 보시겠습니까?</p>
            <p className="modal-sub">Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div className="modal-btns">
              <button className="modal-btn primary" onClick={openInNotion}>예 — Notion 앱으로 열기</button>
              <button className="modal-btn secondary" onClick={openInBrowser}>브라우저로 열기</button>
              <button className="modal-btn cancel" onClick={() => setPopup(null)}>아니오</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; min-height: 100vh; }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; padding: 0 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%);
          color: #1f2937; transition: background 0.3s, color 0.3s; position: relative;
          box-sizing: border-box;
        }
        .page.dark { background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }

        .theme-toggle {
          position: absolute; top: 20px; right: 20px;
          background: none; border: 2px solid #d0d9f0; border-radius: 50%;
          width: 40px; height: 40px; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: border-color 0.2s;
        }
        .dark .theme-toggle { border-color: #475569; }

        .logo-area { margin-top: 10vh; margin-bottom: 32px; text-align: center; transition: margin 0.3s; }
        .searched .logo-area { margin-top: 24px; margin-bottom: 16px; }
        .searched .logo-area:hover .logo-hint { opacity: 1; }

        /* Guardian & Angel 로고 - OG 이미지 동일 스타일 */
        .logo-wrap { display: inline-block; text-align: center; }
        .logo-top-rule {
          width: 520px; height: 1px; background: #13274F;
          margin: 0 auto 18px;
        }
        .logo-main {
          font-family: 'Playfair Display', 'Georgia', 'Times New Roman', serif;
          font-size: 56px; font-weight: 700;
          color: #13274F; letter-spacing: -0.5px; line-height: 1.1;
          margin: 0;
        }
        .dark .logo-main { color: #e2e8f0; }
        .logo-sub-en {
          font-family: 'Noto Sans KR', sans-serif;
          font-size: 13px; font-weight: 400;
          color: #13274F;
          letter-spacing: 6px;
          margin: 10px 0 14px;
          text-transform: uppercase;
        }
        .dark .logo-sub-en { color: #94a3b8; }
        .logo-mid-rule {
          width: 300px; height: 1px; background: #13274F;
          margin: 0 auto 14px;
        }
        .dark .logo-top-rule, .dark .logo-mid-rule, .dark .logo-bot-rule { background: #475569; }
        .logo-sub-kr {
          font-family: 'Noto Serif KR', 'Noto Sans KR', serif;
          font-size: 26px; font-weight: 700;
          color: #13274F; letter-spacing: 2px;
          margin: 0 0 14px;
        }
        .dark .logo-sub-kr { color: #e2e8f0; }
        .logo-bot-rule {
          width: 520px; height: 1px; background: #13274F;
          margin: 0 auto;
        }

        .logo-hint {
          font-size: 11px; color: #94a3b8; margin-top: 6px;
          opacity: 0; transition: opacity 0.2s; letter-spacing: 0.3px;
        }
        .subtitle {
          color: #6b7280; font-size: 13px; margin-top: 12px;
          letter-spacing: 3px; font-family: 'Noto Sans KR', sans-serif;
          text-transform: uppercase;
        }

        /* 검색 후 로고 축소 */
        .searched .logo-main { font-size: 30px; }
        .searched .logo-sub-en { font-size: 10px; letter-spacing: 4px; margin: 6px 0 8px; }
        .searched .logo-sub-kr { font-size: 15px; margin-bottom: 8px; }
        .searched .logo-top-rule, .searched .logo-bot-rule { width: 300px; }
        .searched .logo-mid-rule { width: 170px; }

        @media (max-width: 480px) {
          .logo-main { font-size: 36px; }
          .logo-top-rule, .logo-bot-rule { width: 300px; }
          .logo-sub-kr { font-size: 18px; }
          .logo-sub-en { font-size: 11px; letter-spacing: 4px; }
          .searched .logo-main { font-size: 22px; }
          .searched .logo-top-rule, .searched .logo-bot-rule { width: 200px; }
        }

        .search-wrap {
          width: 100%; max-width: 600px; margin-bottom: 24px; transition: max-width 0.3s;
        }
        .searched .search-wrap { max-width: 100%; }
        .search-box {
          display: flex; align-items: center; background: #f8faff;
          border: 1.5px solid #cbd5e1; border-radius: 10px;
          padding: 6px 6px 6px 16px;
          box-shadow: 0 2px 12px rgba(19,39,79,0.08); gap: 8px;
        }
        .dark .search-box { background: #1e293b; border-color: #334155; }
        .icon { font-size: 17px; flex-shrink: 0; }
        input {
          flex: 1; border: none; outline: none;
          font-size: 16px; color: #1f2937; background: transparent;
          font-family: inherit; min-width: 0;
        }
        .dark input { color: #e2e8f0; }
        .clear-btn {
          background: none; border: none; cursor: pointer;
          color: #9ca3af; font-size: 15px; padding: 0 2px; flex-shrink: 0;
        }
        .search-btn {
          background: #13274F; color: #fff; border: none; border-radius: 8px;
          padding: 9px 18px; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; white-space: nowrap; flex-shrink: 0;
        }
        .search-btn:hover { background: #0d1e3d; }

        /* 모바일 대응 */
        @media (max-width: 480px) {
          .search-btn { padding: 9px 14px; font-size: 13px; }
          input { font-size: 16px; }  /* 16px 미만이면 iOS가 자동 확대 */
          .logo { gap: 10px; font-size: 30px; }
          .logo-ga { font-size: 30px; }
          .logo-ip { font-size: 18px; letter-spacing: 2px; }
          .logo-divider { height: 22px; }
        }

        .results { width: 100%; max-width: 1100px; padding-bottom: 60px; }
        .loading { display: flex; flex-direction: column; align-items: center; margin-top: 60px; gap: 16px; }
        .spinner { width: 36px; height: 36px; border: 3px solid #d0d9f0; border-top: 3px solid #1a3a8f; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading p { color: #6b7280; font-size: 15px; }
        .error { color: #dc2626; text-align: center; margin-top: 40px; }
        .no-result { text-align: center; margin-top: 60px; }
        .no-icon { font-size: 48px; }
        .no-text { font-size: 18px; font-weight: 600; margin-top: 12px; }
        .no-sub { color: #9ca3af; font-size: 14px; margin-top: 6px; }
        .count { color: #6b7280; font-size: 13px; margin-bottom: 12px; }

        /* 테이블 - 내용에 따라 셀 너비 자동 확장 */
        .table-outer {
          background: #fff; border-radius: 16px;
          box-shadow: 0 2px 16px rgba(26,58,143,0.08);
          overflow-x: auto; border: 1px solid #e5e9f5;
        }
        .dark .table-outer { background: #1e293b; border-color: #334155; }
        table {
          border-collapse: separate; border-spacing: 0;
          font-size: 13px; width: max-content; min-width: 100%;
        }

        /* 헤더 */
        th {
          background: #1a3a8f; color: #fff; padding: 11px 16px;
          text-align: center; font-weight: 700; font-size: 12px;
          white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.15);
        }
        th:last-child { border-right: none; }
        .dark th { background: #1e3a6e; }

        /* 첫번째 열 헤더 - 고정 */
        th:first-child {
          position: sticky; left: 0; z-index: 3;
          background: #1a3a8f;
          border-right: 2px solid rgba(255,255,255,0.3);
        }
        .dark th:first-child { background: #1e3a6e; }

        .result-row { transition: background 0.12s; }
        .result-row:hover td { background: #f0f4ff; }
        .dark .result-row:hover td { background: #1e3a5f; }

        /* 모든 td - 가운데 정렬 */
        td {
          padding: 10px 16px;
          border-bottom: 1.5px solid #dde3f5;
          border-right: 1px solid #edf0fb;
          white-space: nowrap;
          text-align: center;
          vertical-align: middle;
          background: inherit;
        }
        td:last-child { border-right: none; }
        .dark td { border-bottom-color: #2a3a55; border-right-color: #222e42; }

        /* 첫번째 열 td - 고정 */
        td:first-child {
          position: sticky; left: 0; z-index: 2;
          background: #fff;
          border-right: 2px solid #dde3f5;
        }
        .dark td:first-child { background: #1e293b; border-right-color: #2a3a55; }
        .result-row:hover td:first-child { background: #f0f4ff; }
        .dark .result-row:hover td:first-child { background: #1e3a5f; }
        /* 짝수/홀수 행 색상 유지 */
        .row-odd td:first-child { background: #f7f8ff; }
        .dark .row-odd td:first-child { background: #172035; }
        .row-odd { background: #f7f8ff; }
        .row-even { background: #fff; }
        .dark .row-odd { background: #172035; }
        .dark .row-even { background: #1e293b; }
        .row-odd:hover td:first-child,
        .row-even:hover td:first-child { background: #f0f4ff; }
        .dark .row-odd:hover td:first-child,
        .dark .row-even:hover td:first-child { background: #1e3a5f; }

        /* 1행 고정 td */
        .td-nowrap { vertical-align: middle; text-align: center; }

        /* 다중행 td */
        .td-top { vertical-align: top; padding-top: 10px; text-align: left; }

        .cell-inner { display: flex; align-items: center; justify-content: center; gap: 6px; }
        .doc-icon { font-size: 14px; flex-shrink: 0; }
        .doc-title {
          color: #1a3a8f; font-weight: 600; font-size: 13px;
          cursor: pointer; text-decoration: underline;
        }
        .dark .doc-title { color: #93c5fd; }
        .doc-title:hover { opacity: 0.75; }

        .badge { border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 700; display: inline-block; }
        .badge.type     { background: #eef1fb; color: #1a3a8f; }
        .badge.status   { background: #f0fdf4; color: #166534; }
        .badge.category { background: #fef3c7; color: #92400e; }
        .dark .badge.type     { background: #1e3a6e; color: #93c5fd; }
        .dark .badge.status   { background: #14532d; color: #86efac; }
        .dark .badge.category { background: #451a03; color: #fcd34d; }
        .dash { color: #d1d5db; }

        /* 복사 래퍼 */
        .copy-wrap { display: inline-flex; align-items: flex-start; gap: 6px; }

        /* 텍스트 */
        .cell-text { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .dark .cell-text { color: #94a3b8; }

        /* 들여쓰기 블록 */
        .indent-block { display: flex; flex-direction: column; gap: 3px; text-align: left; }
        .first-line  { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .indent-line { font-size: 12px; color: #6b7280; white-space: nowrap; padding-left: 16px; }
        .dark .first-line, .dark .indent-line { color: #94a3b8; }

        /* 복사 버튼 */
        .copy-btn {
          flex-shrink: 0; background: #eef1fb; color: #1a3a8f;
          border: none; border-radius: 4px; padding: 2px 7px;
          font-size: 10px; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .copy-btn:hover { background: #d0d9f0; }
        .copy-btn.copied { background: #dcfce7; color: #166634; }
        .dark .copy-btn { background: #1e3a6e; color: #93c5fd; }
        .dark .copy-btn.copied { background: #14532d; color: #86efac; }

        /* 노션 DB 전체보기 버튼 */
        .notion-db-wrap { text-align: center; margin-top: 24px; padding-bottom: 20px; }
        .notion-db-btn {
          background: #fff; color: #1e3a8a;
          border: 2px solid #c7d2fe; border-radius: 28px;
          padding: 12px 28px; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 2px 10px rgba(99,102,241,0.12); transition: all 0.2s;
        }
        .notion-db-btn:hover { background: #eef2ff; border-color: #4f46e5; box-shadow: 0 4px 16px rgba(99,102,241,0.2); }
        .dark .notion-db-btn { background: #1e293b; color: #818cf8; border-color: #334155; }

        /* 팝업 */
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center; z-index: 999;
        }
        .modal {
          background: #fff; border-radius: 20px; padding: 32px 36px;
          max-width: 360px; width: 90%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25); text-align: center;
        }
        .dark .modal { background: #1e293b; color: #e2e8f0; }
        .modal-icon { font-size: 40px; margin-bottom: 12px; }
        .modal-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
        .modal-sub { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
        .modal-btns { display: flex; flex-direction: column; gap: 10px; }
        .modal-btn {
          border: none; border-radius: 12px; padding: 13px;
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .modal-btn:hover { opacity: 0.82; }
        .modal-btn.primary   { background: #1a3a8f; color: #fff; }
        .modal-btn.secondary { background: #eef1fb; color: #1a3a8f; }
        .modal-btn.cancel    { background: #f3f4f6; color: #6b7280; }
        .dark .modal-btn.secondary { background: #1e3a6e; color: #93c5fd; }
        .dark .modal-btn.cancel    { background: #334155; color: #94a3b8; }
      `}</style>
    </>
  );
}
