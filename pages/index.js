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
        <title>G&A IP 문서 통합 검색</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />
      </Head>

      <div className={`page${searched ? " searched" : ""}${dark ? " dark" : ""}`}>

        <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? "라이트 모드" : "다크 모드"}>
          {dark ? "☀️" : "🌙"}
        </button>

        <div className="logo-area">
          <h1 className="logo">
            <span className="g">G</span>
            <span className="amp">&amp;</span>
            <span className="a">A</span>
            <span className="ip"> IP</span>
          </h1>
          {!searched && <p className="subtitle">가엔 특허법률사무소 · 문서 통합 검색</p>}
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
                        <tr key={i} className="result-row">

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
          background: linear-gradient(160deg, #f8f9ff 0%, #eef1fb 100%);
          color: #1f2937; transition: background 0.3s, color 0.3s; position: relative;
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

        .logo-area { margin-top: 14vh; margin-bottom: 28px; text-align: center; transition: margin 0.3s; }
        .searched .logo-area { margin-top: 32px; margin-bottom: 16px; }
        .logo { font-size: 52px; font-weight: 900; letter-spacing: -2px; line-height: 1; }
        .g, .a { color: #1a3a8f; }
        .dark .g, .dark .a { color: #6ea8fe; }
        .amp { color: #c9973a; font-size: 44px; }
        .ip { color: #4a6fd4; font-size: 32px; font-weight: 700; }
        .dark .ip { color: #93c5fd; }
        .subtitle { color: #6b7280; font-size: 15px; margin-top: 8px; }

        .search-wrap { width: 100%; max-width: 640px; margin-bottom: 32px; transition: max-width 0.3s; }
        .searched .search-wrap { max-width: 1100px; }
        .search-box {
          display: flex; align-items: center; background: #fff;
          border: 2px solid #d0d9f0; border-radius: 48px;
          padding: 10px 16px; box-shadow: 0 4px 20px rgba(26,58,143,0.10); gap: 8px;
        }
        .dark .search-box { background: #1e293b; border-color: #334155; }
        .icon { font-size: 18px; }
        input { flex: 1; border: none; outline: none; font-size: 16px; color: #1f2937; background: transparent; font-family: inherit; }
        .dark input { color: #e2e8f0; }
        .clear-btn { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 16px; padding: 0 4px; }
        .search-btn {
          background: #1a3a8f; color: #fff; border: none; border-radius: 24px;
          padding: 8px 20px; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        .search-btn:hover { background: #14307a; }

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
          border-collapse: collapse; font-size: 13px;
          width: max-content; min-width: 100%;
        }
        th {
          background: #1a3a8f; color: #fff; padding: 11px 14px;
          text-align: left; font-weight: 700; font-size: 12px;
          white-space: nowrap;
        }
        .dark th { background: #1e3a6e; }
        .result-row { transition: background 0.12s; }
        .result-row:hover { background: #f0f4ff; }
        .dark .result-row:hover { background: #1e3a5f; }

        /* 모든 td 기본 - overflow 없음, 줄바꿈 없음 */
        td {
          padding: 9px 14px;
          border-bottom: 1px solid #f0f2f8;
          white-space: nowrap;
        }
        .dark td { border-bottom-color: #334155; }

        /* 1행 고정 td */
        .td-nowrap { vertical-align: middle; }

        /* 다중행 td - 상단 정렬 */
        .td-top { vertical-align: top; padding-top: 10px; }

        .cell-inner { display: flex; align-items: center; gap: 6px; }
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
        .copy-wrap { display: flex; align-items: flex-start; gap: 6px; }

        /* 텍스트 - 줄바꿈 절대 없음 */
        .cell-text { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .dark .cell-text { color: #94a3b8; }

        /* 들여쓰기 블록 - 각 줄 절대 줄바꿈 없음 */
        .indent-block { display: flex; flex-direction: column; gap: 3px; }
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
