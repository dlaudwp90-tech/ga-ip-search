import { useState, useRef } from "react";
import Head from "next/head";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSearched(true);

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

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleClear = () => {
    setQuery("");
    setSearched(false);
    setResults(null);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <>
      <Head>
        <title>G&A IP 문서 통합 검색</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${searched ? "searched" : ""}`}>
        {/* 로고 */}
        <div className="logo-area">
          <h1 className="logo">
            <span className="g">G</span>
            <span className="amp">&amp;</span>
            <span className="a">A</span>
            <span className="ip"> IP</span>
          </h1>
          {!searched && <p className="subtitle">가엔 특허법률사무소 · 문서 통합 검색</p>}
        </div>

        {/* 검색창 */}
        <div className="search-wrap">
          <div className="search-box">
            <span className="icon">🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="문서명, 사건번호, 발명자, 기술분야..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {query && (
              <button className="clear-btn" onClick={handleClear}>✕</button>
            )}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        {/* 결과 */}
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
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "50%" }}>문서 제목</th>
                        <th style={{ width: "15%" }}>유형</th>
                        <th style={{ width: "15%" }}>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr
                          key={i}
                          onClick={() => row.url && window.open(row.url, "_blank")}
                          className="result-row"
                        >
                          <td className="title-cell">
                            <span className="doc-icon">📄</span>
                            <span className="doc-title">{row.title}</span>
                          </td>
                          <td>
                            {row.type ? <span className="badge">{row.type}</span> : <span className="dash">—</span>}
                          </td>
                          <td>
                            {row.status ? <span className="badge status">{row.status}</span> : <span className="dash">—</span>}
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

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
          background: linear-gradient(160deg, #f8f9ff 0%, #eef1fb 100%);
          min-height: 100vh;
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 16px;
        }
        .logo-area {
          margin-top: 14vh;
          margin-bottom: 28px;
          text-align: center;
          transition: margin 0.3s;
        }
        .searched .logo-area {
          margin-top: 32px;
          margin-bottom: 16px;
        }
        .logo {
          font-size: 52px;
          font-weight: 900;
          letter-spacing: -2px;
          line-height: 1;
        }
        .g, .a { color: #1a3a8f; }
        .amp { color: #c9973a; font-size: 44px; }
        .ip { color: #4a6fd4; font-size: 32px; font-weight: 700; }
        .subtitle { color: #6b7280; font-size: 15px; margin-top: 8px; }

        .search-wrap {
          width: 100%;
          max-width: 640px;
          margin-bottom: 32px;
          transition: max-width 0.3s;
        }
        .searched .search-wrap { max-width: 800px; }
        .search-box {
          display: flex;
          align-items: center;
          background: #fff;
          border: 2px solid #d0d9f0;
          border-radius: 48px;
          padding: 10px 16px;
          box-shadow: 0 4px 20px rgba(26,58,143,0.10);
          gap: 8px;
        }
        .icon { font-size: 18px; }
        input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 16px;
          color: #1f2937;
          background: transparent;
          font-family: inherit;
        }
        .clear-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 16px;
          padding: 0 4px;
        }
        .search-btn {
          background: #1a3a8f;
          color: #fff;
          border: none;
          border-radius: 24px;
          padding: 8px 20px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
        }
        .search-btn:hover { background: #14307a; }

        .results { width: 100%; max-width: 800px; padding-bottom: 60px; }
        .loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 60px;
          gap: 16px;
        }
        .spinner {
          width: 36px; height: 36px;
          border: 3px solid #d0d9f0;
          border-top: 3px solid #1a3a8f;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading p { color: #6b7280; font-size: 15px; }

        .error { color: #dc2626; text-align: center; margin-top: 40px; }

        .no-result { text-align: center; margin-top: 60px; }
        .no-icon { font-size: 48px; }
        .no-text { font-size: 18px; color: #374151; font-weight: 600; margin-top: 12px; }
        .no-sub { color: #9ca3af; font-size: 14px; margin-top: 6px; }

        .count { color: #6b7280; font-size: 13px; margin-bottom: 12px; }
        .table-wrap {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 2px 16px rgba(26,58,143,0.08);
          overflow: hidden;
          border: 1px solid #e5e9f5;
        }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th {
          background: #1a3a8f;
          color: #fff;
          padding: 13px 16px;
          text-align: left;
          font-weight: 700;
          font-size: 13px;
        }
        .result-row { cursor: pointer; transition: background 0.15s; }
        .result-row:hover { background: #f0f4ff; }
        td {
          padding: 13px 16px;
          border-bottom: 1px solid #f0f2f8;
          color: #374151;
          vertical-align: middle;
        }
        .title-cell { display: flex; align-items: center; gap: 8px; }
        .doc-icon { font-size: 16px; flex-shrink: 0; }
        .doc-title { font-weight: 500; color: #1a3a8f; }
        .badge {
          background: #eef1fb;
          color: #1a3a8f;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 600;
          display: inline-block;
        }
        .badge.status { background: #f0fdf4; color: #166534; }
        .dash { color: #d1d5db; }
      `}</style>
    </>
  );
}
