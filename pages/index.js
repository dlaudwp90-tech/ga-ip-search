import { useState, useRef } from "react";
import Head from "next/head";

const PAGE_SIZE = 25;

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

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [dark, setDark] = useState(false);
  const [popup, setPopup] = useState(null);
  const [copied, setCopied] = useState({});

  // 전체보기 상태
  const [isAllMode, setIsAllMode] = useState(false);
  const [allPages, setAllPages] = useState([]); // 커서 히스토리
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState({}); // { pageNum: results[] }
  const [cursors, setCursors] = useState({}); // { pageNum: cursor }
  const [totalFetched, setTotalFetched] = useState(false);

  // 결과 내 검색
  const [filterQuery, setFilterQuery] = useState("");

  const inputRef = useRef(null);
  const tableRef = useRef(null);

  // ── 키워드 검색 ──
  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults(null);
    setSearched(true); setIsAllMode(false); setFilterQuery("");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode: "search" }),
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
    setIsAllMode(false); setFilterQuery("");
    inputRef.current?.focus();
  };

  // ── 전체보기 ──
  const handleViewAll = async () => {
    setLoading(true); setError(null); setResults(null);
    setSearched(true); setIsAllMode(true);
    setCurrentPage(1); setPageData({}); setCursors({}); setFilterQuery("");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "데이터 로드 실패");
      setPageData({ 1: data.results });
      setCursors({ 2: data.next_cursor });
      setTotalFetched(!data.has_more);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 페이지 이동 ──
  const goToPage = async (page) => {
    if (pageData[page]) {
      setCurrentPage(page);
      tableRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const cursor = cursors[page];
    if (!cursor) return;
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", cursor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "데이터 로드 실패");
      setPageData((prev) => ({ ...prev, [page]: data.results }));
      setCursors((prev) => ({ ...prev, [page + 1]: data.next_cursor }));
      if (!data.has_more) setTotalFetched(true);
      setCurrentPage(page);
      tableRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 팝업 ──
  const handleTitleClick = (e, url) => { e.stopPropagation(); setPopup({ url }); };
  const openInNotion = () => {
    if (!popup?.url) return;
    window.location.href = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    setPopup(null);
  };
  const openInBrowser = () => { if (!popup?.url) return; window.open(popup.url, "_blank"); setPopup(null); };

  // ── 복사 ──
  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 1500);
    });
  };

  const isMultiLine = (text) => text && text.includes("\n");

  // ── 현재 표시할 데이터 ──
  const currentResults = isAllMode ? (pageData[currentPage] || []) : (results || []);

  // 결과 내 검색 필터
  const filteredResults = filterQuery.trim()
    ? currentResults.filter((row) =>
        [row.title, row.type, row.status, row.category, row.appNum, row.appOwner, row.agentCode, row.deadline]
          .some((v) => v && v.toLowerCase().includes(filterQuery.toLowerCase()))
      )
    : currentResults;

  // 페이지 번호 목록 계산
  const knownPages = Object.keys(pageData).map(Number).sort((a, b) => a - b);
  const maxKnownPage = knownPages.length > 0 ? Math.max(...knownPages) : 1;
  const hasNextPage = cursors[maxKnownPage + 1] || (!totalFetched && maxKnownPage === currentPage);

  const renderTable = (rows) => (
    <div className="table-outer" ref={tableRef}>
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
          {rows.map((row, i) => (
            <tr key={i} className="result-row">
              <td className="td-nowrap">
                <div className="cell-inner">
                  <span className="doc-icon">📄</span>
                  <span className="doc-title" onClick={(e) => handleTitleClick(e, row.url)}>
                    {renderSingleLine(row.title)}
                  </span>
                </div>
              </td>
              <td className="td-nowrap">
                {row.type ? <span className="badge type">{renderSingleLine(row.type)}</span> : <span className="dash">—</span>}
              </td>
              <td className="td-nowrap">
                {row.status ? <span className="badge status">{renderSingleLine(row.status)}</span> : <span className="dash">—</span>}
              </td>
              <td className="td-nowrap">
                {row.category ? <span className="badge category">{renderSingleLine(row.category)}</span> : <span className="dash">—</span>}
              </td>
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
              <td className="td-nowrap">
                <span className="cell-text">{row.deadline || "—"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
            <span className="g">G</span><span className="amp">&amp;</span>
            <span className="a">A</span><span className="ip"> IP</span>
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

        {/* 전체보기 버튼 */}
        {!searched && (
          <button className="view-all-btn" onClick={handleViewAll}>
            📋 데이터 전체보기
          </button>
        )}
        {searched && (
          <button className="view-all-btn-small" onClick={handleViewAll}>
            📋 데이터 전체보기
          </button>
        )}

        {/* 결과 영역 */}
        <div className="results">
          {loading && (
            <div className="loading">
              <div className="spinner" />
              <p>{isAllMode ? "전체 데이터 불러오는 중..." : "Notion DB 검색 중..."}</p>
            </div>
          )}
          {error && <p className="error">⚠️ {error}</p>}

          {!loading && searched && (
            <>
              {/* 검색 결과 */}
              {!isAllMode && results !== null && (
                results.length === 0 ? (
                  <div className="no-result">
                    <p className="no-icon">📭</p>
                    <p className="no-text">검색 결과가 없습니다</p>
                    <p className="no-sub">다른 키워드로 시도해 보세요</p>
                  </div>
                ) : (
                  <>
                    <p className="count">검색 결과 {results.length}건</p>
                    {renderTable(results)}
                  </>
                )
              )}

              {/* 전체보기 */}
              {isAllMode && pageData[currentPage] && (
                <>
                  <p className="count">
                    전체 데이터 · {currentPage}페이지 ({pageData[currentPage].length}건 표시)
                  </p>

                  {renderTable(filteredResults)}

                  {/* 페이지네이션 */}
                  <div className="pagination">
                    <button
                      className="page-btn"
                      disabled={currentPage === 1}
                      onClick={() => goToPage(currentPage - 1)}
                    >← 이전</button>

                    {knownPages.map((p) => (
                      <button
                        key={p}
                        className={`page-btn${currentPage === p ? " active" : ""}`}
                        onClick={() => goToPage(p)}
                      >{p}</button>
                    ))}

                    {hasNextPage && (
                      <button className="page-btn" onClick={() => goToPage(maxKnownPage + 1)}>
                        다음 →
                      </button>
                    )}
                  </div>

                  {/* 결과 내 검색 */}
                  <div className="filter-wrap">
                    <p className="filter-label">🔎 결과 내 검색</p>
                    <div className="filter-box">
                      <input
                        type="text"
                        className="filter-input"
                        placeholder="현재 페이지에서 검색..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                      />
                      {filterQuery && (
                        <button className="filter-clear" onClick={() => setFilterQuery("")}>✕</button>
                      )}
                    </div>
                    {filterQuery && (
                      <p className="filter-count">
                        {filteredResults.length}건 일치
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 노션 팝업 */}
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
          align-items: center; padding: 0 16px 60px;
          background: linear-gradient(160deg, #f8f9ff 0%, #eef1fb 100%);
          color: #1f2937; transition: background 0.3s, color 0.3s; position: relative;
        }
        .page.dark { background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }

        .theme-toggle {
          position: absolute; top: 20px; right: 20px;
          background: none; border: 2px solid #d0d9f0; border-radius: 50%;
          width: 40px; height: 40px; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: border-color 0.2s;
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

        .search-wrap { width: 100%; max-width: 640px; margin-bottom: 16px; transition: max-width 0.3s; }
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
          padding: 8px 20px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        .search-btn:hover { background: #14307a; }

        /* 전체보기 버튼 */
        .view-all-btn {
          background: #fff; color: #1a3a8f;
          border: 2px solid #1a3a8f; border-radius: 24px;
          padding: 10px 24px; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; margin-bottom: 32px;
          transition: background 0.2s, color 0.2s;
        }
        .view-all-btn:hover { background: #1a3a8f; color: #fff; }
        .dark .view-all-btn { background: transparent; color: #6ea8fe; border-color: #6ea8fe; }
        .view-all-btn-small {
          background: #fff; color: #1a3a8f;
          border: 2px solid #1a3a8f; border-radius: 20px;
          padding: 6px 16px; font-size: 12px; font-weight: 700;
          cursor: pointer; font-family: inherit; margin-bottom: 20px;
          transition: background 0.2s, color 0.2s;
        }
        .view-all-btn-small:hover { background: #1a3a8f; color: #fff; }
        .dark .view-all-btn-small { background: transparent; color: #6ea8fe; border-color: #6ea8fe; }

        .results { width: 100%; max-width: 1100px; }
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

        /* 테이블 */
        .table-outer {
          background: #fff; border-radius: 16px;
          box-shadow: 0 2px 16px rgba(26,58,143,0.08);
          overflow-x: auto; border: 1px solid #e5e9f5; margin-bottom: 24px;
        }
        .dark .table-outer { background: #1e293b; border-color: #334155; }
        table { border-collapse: collapse; font-size: 13px; width: max-content; min-width: 100%; }
        th {
          background: #1a3a8f; color: #fff; padding: 11px 14px;
          text-align: left; font-weight: 700; font-size: 12px; white-space: nowrap;
        }
        .dark th { background: #1e3a6e; }
        .result-row { transition: background 0.12s; }
        .result-row:hover { background: #f0f4ff; }
        .dark .result-row:hover { background: #1e3a5f; }
        td { padding: 9px 14px; border-bottom: 1px solid #f0f2f8; white-space: nowrap; }
        .dark td { border-bottom-color: #334155; }
        .td-nowrap { vertical-align: middle; }
        .td-top { vertical-align: top; padding-top: 10px; }

        .cell-inner { display: flex; align-items: center; gap: 6px; }
        .doc-icon { font-size: 14px; flex-shrink: 0; }
        .doc-title { color: #1a3a8f; font-weight: 600; font-size: 13px; cursor: pointer; text-decoration: underline; }
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
        .copy-wrap { display: flex; align-items: flex-start; gap: 6px; }
        .cell-text { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .dark .cell-text { color: #94a3b8; }
        .indent-block { display: flex; flex-direction: column; gap: 3px; }
        .first-line  { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .indent-line { font-size: 12px; color: #6b7280; white-space: nowrap; padding-left: 16px; }
        .dark .first-line, .dark .indent-line { color: #94a3b8; }
        .copy-btn {
          flex-shrink: 0; background: #eef1fb; color: #1a3a8f;
          border: none; border-radius: 4px; padding: 2px 7px;
          font-size: 10px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s;
        }
        .copy-btn:hover { background: #d0d9f0; }
        .copy-btn.copied { background: #dcfce7; color: #166534; }
        .dark .copy-btn { background: #1e3a6e; color: #93c5fd; }
        .dark .copy-btn.copied { background: #14532d; color: #86efac; }

        /* 페이지네이션 */
        .pagination {
          display: flex; align-items: center; justify-content: center;
          gap: 8px; margin-bottom: 28px; flex-wrap: wrap;
        }
        .page-btn {
          background: #fff; color: #1a3a8f;
          border: 2px solid #d0d9f0; border-radius: 10px;
          padding: 7px 14px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .page-btn:hover:not(:disabled) { border-color: #1a3a8f; background: #eef1fb; }
        .page-btn.active { background: #1a3a8f; color: #fff; border-color: #1a3a8f; }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .dark .page-btn { background: #1e293b; color: #93c5fd; border-color: #334155; }
        .dark .page-btn.active { background: #1e3a6e; color: #fff; border-color: #1e3a6e; }

        /* 결과 내 검색 */
        .filter-wrap {
          background: #fff; border: 1px solid #e5e9f5; border-radius: 16px;
          padding: 20px 24px; margin-bottom: 32px;
        }
        .dark .filter-wrap { background: #1e293b; border-color: #334155; }
        .filter-label { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 10px; }
        .dark .filter-label { color: #e2e8f0; }
        .filter-box {
          display: flex; align-items: center; background: #f8f9ff;
          border: 2px solid #d0d9f0; border-radius: 32px;
          padding: 8px 16px; gap: 8px;
        }
        .dark .filter-box { background: #0f172a; border-color: #475569; }
        .filter-input {
          flex: 1; border: none; outline: none; font-size: 14px;
          color: #1f2937; background: transparent; font-family: inherit;
        }
        .dark .filter-input { color: #e2e8f0; }
        .filter-clear {
          background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 14px; padding: 0;
        }
        .filter-count { font-size: 12px; color: #6b7280; margin-top: 8px; }

        /* 팝업 */
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center; z-index: 999;
        }
        .modal {
          background: #fff; border-radius: 20px; padding: 32px 36px;
          max-width: 360px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); text-align: center;
        }
        .dark .modal { background: #1e293b; color: #e2e8f0; }
        .modal-icon { font-size: 40px; margin-bottom: 12px; }
        .modal-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
        .modal-sub { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
        .modal-btns { display: flex; flex-direction: column; gap: 10px; }
        .modal-btn {
          border: none; border-radius: 12px; padding: 13px;
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity 0.15s;
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
