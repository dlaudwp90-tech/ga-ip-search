import { useState, useRef } from "react";
import Head from "next/head";

function renderSingleLine(text) {
  if (!text) return null;
  return text.split("\n")[0];
}

function renderWithIndent(text) {
  if (!text) return null;
  const lines = text.split("\n");
  if (lines.length === 1) return <span className="cell-val">{text}</span>;
  return (
    <div className="indent-block">
      {lines.map((line, i) => (
        <div key={i} className={i === 0 ? "first-line" : "indent-line"}>{line || "\u3000"}</div>
      ))}
    </div>
  );
}

const TYPE_COLORS = {
  "특허":    { bg: "#fff3e0", color: "#e65100", border: "#ffcc80" },
  "상표":    { bg: "#fce4ec", color: "#c2185b", border: "#f48fb1" },
  "디자인":  { bg: "#e8eaf6", color: "#3949ab", border: "#9fa8da" },
  "방식절차":{ bg: "#f3e5f5", color: "#7b1fa2", border: "#ce93d8" },
};

const CATEGORY_COLORS = {
  "기술 사양":       { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" },
  "출원":            { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
  "문서 작성 가이드":{ bg: "#fff8e1", color: "#f57f17", border: "#ffe082" },
  "문서 양식":       { bg: "#fbe9e7", color: "#bf360c", border: "#ffab91" },
  "아키텍처":        { bg: "#e0f2f1", color: "#00695c", border: "#80cbc4" },
};

const STATUS_COLORS = {
  "완료":             { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" },
  "출원완료":         { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
  "우선심사제출완":   { bg: "#e8eaf6", color: "#3949ab", border: "#9fa8da" },
  "출원서 작성 중":   { bg: "#fff8e1", color: "#f57f17", border: "#ffe082" },
  "기획 중":          { bg: "#fce4ec", color: "#c2185b", border: "#f48fb1" },
  "검토 중":          { bg: "#fff3e0", color: "#e65100", border: "#ffcc80" },
  "우청 수신대기중":  { bg: "#ffebee", color: "#c62828", border: "#ef9a9a" },
  "출원인정보 변경중":{ bg: "#fbe9e7", color: "#bf360c", border: "#ffab91" },
  "보류":             { bg: "#f5f5f5", color: "#616161", border: "#e0e0e0" },
  "환불":             { bg: "#f3e5f5", color: "#7b1fa2", border: "#ce93d8" },
  "초안":             { bg: "#e0f7fa", color: "#00695c", border: "#80deea" },
  "진행중":           { bg: "#fff8e1", color: "#f57f17", border: "#ffe082" },
  "우청 진행중":      { bg: "#fce4ec", color: "#c2185b", border: "#f48fb1" },
  "추가검토 필요":    { bg: "#ffebee", color: "#c62828", border: "#ef9a9a" },
  "도면작성완료":     { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" },
  "우청작성완료":     { bg: "#e8eaf6", color: "#3949ab", border: "#9fa8da" },
  "출원서 제출":      { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
};

function ColorBadge({ text, colorMap, fallback }) {
  if (!text) return <span className="cell-empty">—</span>;
  const s = colorMap[text] || fallback || { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
  return (
    <span style={{
      background: s.bg, color: s.color,
      border: `1.5px solid ${s.border}`,
      borderRadius: 6, padding: "3px 10px",
      fontSize: 11, fontWeight: 700,
      whiteSpace: "nowrap", display: "inline-block", lineHeight: 1.5,
    }}>
      {text}
    </span>
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
  const [isAllMode, setIsAllMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState({});
  const [cursors, setCursors] = useState({});
  const [totalFetched, setTotalFetched] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const inputRef = useRef(null);
  const tableRef = useRef(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResults(null);
    setSearched(true); setIsAllMode(false); setFilterQuery("");
    try {
      const res = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode: "search" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 실패");
      setResults(data.results);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleClear = () => {
    setQuery(""); setSearched(false); setResults(null); setError(null);
    setIsAllMode(false); setFilterQuery(""); inputRef.current?.focus();
  };

  const handleViewAll = async () => {
    setLoading(true); setError(null); setResults(null);
    setSearched(true); setIsAllMode(true);
    setCurrentPage(1); setPageData({}); setCursors({}); setFilterQuery("");
    try {
      const res = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "데이터 로드 실패");
      setPageData({ 1: data.results });
      setCursors({ 2: data.next_cursor });
      setTotalFetched(!data.has_more);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all", cursor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPageData((p) => ({ ...p, [page]: data.results }));
      setCursors((p) => ({ ...p, [page + 1]: data.next_cursor }));
      if (!data.has_more) setTotalFetched(true);
      setCurrentPage(page);
      tableRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleTitleClick = (e, url) => { e.stopPropagation(); setPopup({ url }); };
  const openInNotion = () => {
    if (!popup?.url) return;
    window.location.href = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    setPopup(null);
  };
  const openInBrowser = () => { if (popup?.url) { window.open(popup.url, "_blank"); setPopup(null); } };

  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied((p) => ({ ...p, [key]: true }));
      setTimeout(() => setCopied((p) => ({ ...p, [key]: false })), 1500);
    });
  };

  const isMultiLine = (t) => t && t.includes("\n");
  const knownPages = Object.keys(pageData).map(Number).sort((a, b) => a - b);
  const maxKnown = knownPages.length > 0 ? Math.max(...knownPages) : 1;
  const hasNext = cursors[maxKnown + 1] || (!totalFetched && maxKnown === currentPage);
  const currentRows = isAllMode ? (pageData[currentPage] || []) : (results || []);
  const filtered = filterQuery.trim()
    ? currentRows.filter((r) =>
        [r.title, r.type, r.status, r.category, r.appNum, r.appOwner, r.agentCode, r.deadline]
          .some((v) => v && v.toLowerCase().includes(filterQuery.toLowerCase()))
      )
    : currentRows;

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
            <tr key={i} className={`result-row ${i % 2 === 0 ? "row-even" : "row-odd"}`}>

              {/* 문서 제목 - 정중앙 */}
              <td className="td-center">
                <div className="cell-inner">
                  <span className="doc-icon">📄</span>
                  <span className="doc-title" onClick={(e) => handleTitleClick(e, row.url)}>
                    {renderSingleLine(row.title) || "(제목 없음)"}
                  </span>
                </div>
              </td>

              {/* 유형 */}
              <td className="td-center">
                <ColorBadge text={renderSingleLine(row.type)} colorMap={TYPE_COLORS}
                  fallback={{ bg: "#ede9fe", color: "#5b21b6", border: "#c4b5fd" }} />
              </td>

              {/* 상태 */}
              <td className="td-center">
                <ColorBadge text={renderSingleLine(row.status)} colorMap={STATUS_COLORS}
                  fallback={{ bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" }} />
              </td>

              {/* 카테고리 */}
              <td className="td-center">
                <ColorBadge text={renderSingleLine(row.category)} colorMap={CATEGORY_COLORS}
                  fallback={{ bg: "#fef3c7", color: "#92400e", border: "#fde68a" }} />
              </td>

              {/* 출원번호 */}
              <td className={isMultiLine(row.appNum) ? "td-top" : "td-center"}>
                <div className="copy-wrap">
                  {renderWithIndent(row.appNum) || <span className="cell-empty">—</span>}
                  {row.appNum && (
                    <button className={`copy-btn${copied[`${i}-appNum`] ? " copied" : ""}`}
                      onClick={(e) => handleCopy(e, row.appNum, `${i}-appNum`)}>
                      {copied[`${i}-appNum`] ? "✓" : "복사"}
                    </button>
                  )}
                </div>
              </td>

              {/* 출원인 */}
              <td className={isMultiLine(row.appOwner) ? "td-top" : "td-center"}>
                <div className="copy-wrap">
                  {renderWithIndent(row.appOwner) || <span className="cell-empty">—</span>}
                  {row.appOwner && (
                    <button className={`copy-btn${copied[`${i}-appOwner`] ? " copied" : ""}`}
                      onClick={(e) => handleCopy(e, row.appOwner, `${i}-appOwner`)}>
                      {copied[`${i}-appOwner`] ? "✓" : "복사"}
                    </button>
                  )}
                </div>
              </td>

              {/* 대리인 코드 */}
              <td className={isMultiLine(row.agentCode) ? "td-top" : "td-center"}>
                <div className="copy-wrap">
                  {renderWithIndent(row.agentCode) || <span className="cell-empty">—</span>}
                  {row.agentCode && (
                    <button className={`copy-btn${copied[`${i}-agentCode`] ? " copied" : ""}`}
                      onClick={(e) => handleCopy(e, row.agentCode, `${i}-agentCode`)}>
                      {copied[`${i}-agentCode`] ? "✓" : "복사"}
                    </button>
                  )}
                </div>
              </td>

              {/* 마감일 */}
              <td className="td-center">
                {row.deadline
                  ? <span className="badge-date">{row.deadline}</span>
                  : <span className="cell-empty">—</span>}
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

        <button className="theme-toggle" onClick={() => setDark(!dark)}>
          {dark ? "☀️" : "🌙"}
        </button>

        <div className="logo-area">
          <h1 className="logo">
            <span className="g">G</span><span className="amp">&amp;</span>
            <span className="a">A</span><span className="ip"> IP</span>
          </h1>
          {!searched && <p className="subtitle">가엔 특허법률사무소 · 문서 통합 검색</p>}
        </div>

        <div className="search-wrap">
          <div className="search-box">
            <span className="icon">🔍</span>
            <input ref={inputRef} type="text"
              placeholder="문서명, 출원번호, 출원인, 대리인 코드..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown} autoFocus />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        <button className={searched ? "view-all-sm" : "view-all-lg"} onClick={handleViewAll}>
          📋 데이터 전체보기
        </button>

        <div className="results">
          {loading && (
            <div className="loading">
              <div className="spinner" />
              <p>{isAllMode ? "전체 데이터 불러오는 중..." : "Notion DB 검색 중..."}</p>
            </div>
          )}
          {error && <p className="error-msg">⚠️ {error}</p>}

          {!loading && searched && !isAllMode && results !== null && (
            results.length === 0
              ? <div className="no-result">
                  <p className="no-icon">📭</p>
                  <p className="no-text">검색 결과가 없습니다</p>
                  <p className="no-sub">다른 키워드로 시도해 보세요</p>
                </div>
              : <>
                  <p className="count-label">검색 결과 <strong>{results.length}건</strong></p>
                  {renderTable(results)}
                </>
          )}

          {!loading && isAllMode && pageData[currentPage] && (
            <>
              <p className="count-label">전체 데이터 · <strong>{currentPage}페이지</strong> ({pageData[currentPage].length}건)</p>
              {renderTable(filtered)}

              <div className="pagination">
                <button className="page-btn" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>← 이전</button>
                {knownPages.map((p) => (
                  <button key={p} className={`page-btn${currentPage === p ? " active" : ""}`} onClick={() => goToPage(p)}>{p}</button>
                ))}
                {hasNext && <button className="page-btn" onClick={() => goToPage(maxKnown + 1)}>다음 →</button>}
              </div>

              <div className="filter-wrap">
                <p className="filter-label">🔎 결과 내 검색</p>
                <div className="filter-box">
                  <input className="filter-input" type="text"
                    placeholder="현재 페이지에서 검색..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)} />
                  {filterQuery && <button className="filter-clear" onClick={() => setFilterQuery("")}>✕</button>}
                </div>
                {filterQuery && <p className="filter-count">{filtered.length}건 일치</p>}
              </div>
            </>
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
          align-items: center; padding: 0 20px 80px;
          background: linear-gradient(160deg, #f0f4ff 0%, #e8eeff 100%);
          color: #1f2937; transition: background 0.3s; position: relative;
        }
        .page.dark { background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }

        .theme-toggle {
          position: absolute; top: 20px; right: 20px;
          background: rgba(255,255,255,0.85); border: 2px solid #c7d2fe; border-radius: 50%;
          width: 42px; height: 42px; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(99,102,241,0.15);
        }
        .dark .theme-toggle { background: rgba(30,41,59,0.85); border-color: #334155; }

        .logo-area { margin-top: 13vh; margin-bottom: 28px; text-align: center; transition: margin 0.3s; }
        .searched .logo-area { margin-top: 28px; margin-bottom: 14px; }
        .logo { font-size: 54px; font-weight: 900; letter-spacing: -2px; line-height: 1; }
        .g, .a { color: #1e3a8a; }
        .dark .g, .dark .a { color: #6ea8fe; }
        .amp { color: #b45309; font-size: 46px; }
        .ip { color: #4f46e5; font-size: 34px; font-weight: 700; }
        .dark .ip { color: #818cf8; }
        .subtitle { color: #6b7280; font-size: 15px; margin-top: 10px; }

        .search-wrap { width: 100%; max-width: 660px; margin-bottom: 14px; transition: max-width 0.3s; }
        .searched .search-wrap { max-width: 100%; }
        .search-box {
          display: flex; align-items: center; background: #fff;
          border: 2px solid #c7d2fe; border-radius: 52px;
          padding: 11px 18px; box-shadow: 0 4px 24px rgba(99,102,241,0.12); gap: 10px;
        }
        .dark .search-box { background: #1e293b; border-color: #334155; }
        .icon { font-size: 18px; }
        input { flex: 1; border: none; outline: none; font-size: 16px; color: #1f2937; background: transparent; font-family: inherit; }
        .dark input { color: #e2e8f0; }
        .clear-btn { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 16px; }
        .search-btn {
          background: linear-gradient(135deg, #1e3a8a, #4f46e5); color: #fff;
          border: none; border-radius: 28px; padding: 9px 22px;
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        .search-btn:hover { opacity: 0.9; }

        .view-all-lg {
          background: #fff; color: #1e3a8a; border: 2px solid #c7d2fe; border-radius: 28px;
          padding: 11px 28px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
          margin-bottom: 36px; box-shadow: 0 2px 10px rgba(99,102,241,0.1); transition: all 0.2s;
        }
        .view-all-lg:hover { background: #eef2ff; border-color: #4f46e5; }
        .dark .view-all-lg { background: #1e293b; color: #818cf8; border-color: #334155; }
        .view-all-sm {
          background: #fff; color: #1e3a8a; border: 2px solid #c7d2fe; border-radius: 20px;
          padding: 6px 16px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
          margin-bottom: 18px; transition: all 0.2s;
        }
        .view-all-sm:hover { background: #eef2ff; border-color: #4f46e5; }
        .dark .view-all-sm { background: #1e293b; color: #818cf8; border-color: #334155; }

        .results { width: 100%; }
        .loading { display: flex; flex-direction: column; align-items: center; margin-top: 60px; gap: 16px; }
        .spinner { width: 36px; height: 36px; border: 3px solid #c7d2fe; border-top: 3px solid #4f46e5; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading p { color: #6b7280; font-size: 15px; }
        .error-msg { color: #dc2626; text-align: center; margin-top: 40px; }
        .no-result { text-align: center; margin-top: 60px; }
        .no-icon { font-size: 48px; }
        .no-text { font-size: 18px; font-weight: 700; margin-top: 12px; }
        .no-sub { color: #9ca3af; font-size: 14px; margin-top: 6px; }
        .count-label { color: #6b7280; font-size: 13px; margin-bottom: 10px; }
        .count-label strong { color: #1e3a8a; }
        .dark .count-label strong { color: #818cf8; }

        /* ── 테이블 ── */
        .table-outer {
          border-radius: 16px;
          box-shadow: 0 4px 32px rgba(30,58,138,0.12);
          border: 2px solid #c7d2fe;
          overflow-x: auto;
          margin-bottom: 24px;
          background: #fff;
        }
        .dark .table-outer { border-color: #334155; background: #1e293b; }

        table {
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
          width: max-content;
          min-width: 100%;
        }

        /* 헤더 */
        thead tr { background: linear-gradient(90deg, #1e3a8a 0%, #312e81 100%); }
        th {
          color: #fff; padding: 14px 20px;
          text-align: center; font-weight: 700; font-size: 12px;
          white-space: nowrap; letter-spacing: 0.4px;
          /* 헤더 세로 구분선 - 반투명 흰색 */
          border-right: 1px solid rgba(255,255,255,0.18);
        }
        th:last-child { border-right: none; }

        /* 행 */
        .row-even { background: #fff; }
        .row-odd  { background: #f7f8ff; }
        .dark .row-even { background: #1e293b; }
        .dark .row-odd  { background: #172035; }
        .result-row:hover { background: #eef2ff !important; }
        .dark .result-row:hover { background: #1e3a5f !important; }

        /* ── 셀 구분선 핵심 ──
           가로(border-bottom): 1.5px 살짝 굵게
           세로(border-right):  1px + 매우 연한 색 (희미하게)
        */
        td {
          padding: 12px 20px;
          border-bottom: 1.5px solid #dde3f5;   /* 가로선 - 살짝 굵고 뚜렷 */
          border-right: 1px solid #edf0fb;       /* 세로선 - 얇고 희미 */
          white-space: nowrap;
          text-align: center;
          vertical-align: middle;
        }
        td:last-child { border-right: none; }
        .dark td {
          border-bottom: 1.5px solid #2a3a55;   /* 다크모드 가로선 */
          border-right: 1px solid #222e42;       /* 다크모드 세로선 - 더 희미 */
        }
        .dark td:last-child { border-right: none; }

        /* 정중앙 정렬 */
        .td-center { vertical-align: middle; text-align: center; }
        .td-top    { vertical-align: top; padding-top: 12px; text-align: left; }

        /* 문서 제목 - 정중앙 */
        .cell-inner {
          display: flex; align-items: center; gap: 7px;
          justify-content: center;   /* 가로 정중앙 */
          white-space: nowrap;
        }
        .doc-icon { font-size: 15px; flex-shrink: 0; }
        .doc-title {
          color: #1e3a8a; font-weight: 700; font-size: 13px;
          cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
        }
        .dark .doc-title { color: #818cf8; }
        .doc-title:hover { color: #4f46e5; }

        .badge-date {
          background: #f0fdf4; color: #166534; border: 1.5px solid #bbf7d0;
          border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700; display: inline-block;
        }
        .cell-empty { color: #c9d0e8; font-size: 13px; }

        /* 복사 셀 */
        .copy-wrap { display: inline-flex; align-items: flex-start; gap: 8px; }
        .cell-val { font-size: 12px; color: #374151; white-space: nowrap; }
        .dark .cell-val { color: #cbd5e1; }
        .indent-block { display: flex; flex-direction: column; gap: 3px; text-align: left; }
        .first-line  { font-size: 12px; color: #374151; white-space: nowrap; }
        .indent-line { font-size: 12px; color: #374151; white-space: nowrap; padding-left: 16px; }
        .dark .first-line, .dark .indent-line { color: #cbd5e1; }

        .copy-btn {
          flex-shrink: 0; background: #eef2ff; color: #4f46e5;
          border: 1.5px solid #c7d2fe; border-radius: 5px; padding: 2px 8px;
          font-size: 10px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .copy-btn:hover { background: #e0e7ff; }
        .copy-btn.copied { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
        .dark .copy-btn { background: #1e3a6e; color: #818cf8; border-color: #334155; }
        .dark .copy-btn.copied { background: #14532d; color: #86efac; border-color: #064e3b; }

        /* 페이지네이션 */
        .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
        .page-btn {
          background: #fff; color: #1e3a8a; border: 2px solid #c7d2fe; border-radius: 10px;
          padding: 7px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .page-btn:hover:not(:disabled) { background: #eef2ff; border-color: #4f46e5; }
        .page-btn.active { background: linear-gradient(135deg, #1e3a8a, #4f46e5); color: #fff; border-color: transparent; }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .dark .page-btn { background: #1e293b; color: #818cf8; border-color: #334155; }
        .dark .page-btn.active { background: #312e81; color: #fff; }

        /* 결과 내 검색 */
        .filter-wrap {
          background: #fff; border: 1.5px solid #c7d2fe; border-radius: 16px;
          padding: 20px 24px; margin-bottom: 32px; box-shadow: 0 2px 12px rgba(99,102,241,0.08);
        }
        .dark .filter-wrap { background: #1e293b; border-color: #334155; }
        .filter-label { font-size: 13px; font-weight: 700; color: #1e3a8a; margin-bottom: 10px; }
        .dark .filter-label { color: #818cf8; }
        .filter-box {
          display: flex; align-items: center; background: #f5f7ff;
          border: 2px solid #c7d2fe; border-radius: 32px; padding: 8px 16px; gap: 8px;
        }
        .dark .filter-box { background: #0f172a; border-color: #475569; }
        .filter-input { flex: 1; border: none; outline: none; font-size: 14px; color: #1f2937; background: transparent; font-family: inherit; }
        .dark .filter-input { color: #e2e8f0; }
        .filter-clear { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 14px; }
        .filter-count { font-size: 12px; color: #6b7280; margin-top: 8px; }

        /* 팝업 */
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 999;
          backdrop-filter: blur(4px);
        }
        .modal {
          background: #fff; border-radius: 22px; padding: 36px 40px;
          max-width: 370px; width: 90%; box-shadow: 0 24px 64px rgba(0,0,0,0.2); text-align: center;
        }
        .dark .modal { background: #1e293b; color: #e2e8f0; }
        .modal-icon { font-size: 42px; margin-bottom: 14px; }
        .modal-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
        .modal-sub { font-size: 13px; color: #6b7280; margin-bottom: 26px; }
        .modal-btns { display: flex; flex-direction: column; gap: 10px; }
        .modal-btn {
          border: none; border-radius: 13px; padding: 14px;
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity 0.15s;
        }
        .modal-btn:hover { opacity: 0.85; }
        .modal-btn.primary   { background: linear-gradient(135deg, #1e3a8a, #4f46e5); color: #fff; }
        .modal-btn.secondary { background: #eef2ff; color: #1e3a8a; }
        .modal-btn.cancel    { background: #f3f4f6; color: #6b7280; }
        .dark .modal-btn.secondary { background: #1e3a6e; color: #818cf8; }
        .dark .modal-btn.cancel    { background: #334155; color: #94a3b8; }
      `}</style>
    </>
  );
}
