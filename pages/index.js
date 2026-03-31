import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

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

function FilePopup({ filePopup, popupPos, results, downloading, setFilePopup, handleDownload, filePopupRef }) {
  if (!filePopup) return null;
  const [rowIdx, colIdx] = filePopup.split("-").map(Number);
  const row = results?.[rowIdx];
  if (!row?.fileLinks) return null;
  const links = row.fileLinks.split("\n").filter(Boolean);
  const link = links[colIdx];
  if (!link) return null;
  const fileName = decodeURIComponent(link.split("/").pop());
  const dlKey = `dl-${filePopup}`;
  return (
    <div ref={filePopupRef} className="file-popup-fixed"
      style={{ left: popupPos.x + 14, top: popupPos.y - 10 }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}>
      <a href={link} target="_blank" rel="noreferrer" className="popup-btn preview"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setFilePopup(null)}>🔍 미리보기</a>
      <button className={`popup-btn download${downloading[dlKey] ? " loading" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => handleDownload(e, link, fileName, dlKey)}
        disabled={downloading[dlKey]}>
        {downloading[dlKey] ? "⏳ 준비 중..." : "⬇ 다운로드"}
      </button>
    </div>
  );
}

// 리스트용 파일 목록 팝업
function FileListPopup({ row, rowIdx, pos, onClose, setFilePopup, setPopupPos }) {
  if (!row?.fileLinks) return null;
  const links = row.fileLinks.split("\n").filter(Boolean);
  return (
    <div className="file-list-popup" style={{ left: pos.x + 14, top: pos.y - 10 }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}>
      <p className="flp-title">📁 파일 목록</p>
      {links.map((link, j) => {
        const fileName = decodeURIComponent(link.split("/").pop());
        return (
          <div key={j} className="flp-item"
            onMouseDown={(e) => {
              e.stopPropagation();
              onClose();
              setPopupPos({ x: e.clientX, y: e.clientY });
              setFilePopup(`${rowIdx}-${j}`);
            }}>
            📄 {fileName}
          </div>
        );
      })}
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
  const [filePopup, setFilePopup] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState({});
  const [tableVisible, setTableVisible] = useState(false);
  const [isRecent, setIsRecent] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  // 리스트 파일 팝업
  const [listFilePopup, setListFilePopup] = useState(null); // { rowIdx, pos }

  const inputRef = useRef(null);
  const tableOuterRef = useRef(null);
  const filePopupRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    fetchRecent();
  }, []);

  const fetchRecent = async () => {
    setLoading(true); setTableVisible(false);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent" }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
        setIsRecent(true);
        setTimeout(() => setTableVisible(true), 50);
      }
    } catch (err) {}
    finally { setLoading(false); }
  };

  // 외부 클릭 시 팝업 닫기
  useEffect(() => {
    if (!filePopup && !listFilePopup) return;
    const handleOutside = (e) => {
      if (filePopupRef.current && filePopupRef.current.contains(e.target)) return;
      if (e.target.closest(".file-link-wrap") || e.target.closest(".file-list-popup") || e.target.closest(".list-file-btn")) return;
      if (tableOuterRef.current) {
        const rect = tableOuterRef.current.getBoundingClientRect();
        if (e.clientX > rect.right - 20 || e.clientY > rect.bottom - 20) return;
        if (e.target === tableOuterRef.current) return;
      }
      setFilePopup(null);
      setListFilePopup(null);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [filePopup, listFilePopup]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setFilePopup(null); setListFilePopup(null);
    setTableVisible(false);
    await new Promise((r) => setTimeout(r, 280));
    setLoading(true); setError(null); setResults(null); setSearched(true); setIsRecent(false);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 실패");
      setResults(data.results);
      setTimeout(() => setTableVisible(true), 50);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleClear = () => {
    setQuery(""); setSearched(false); setResults(null); setError(null);
    setFilePopup(null); setListFilePopup(null); setTableVisible(false); setIsRecent(false);
    fetchRecent();
    inputRef.current?.focus();
  };

  const handleTitleClick = (e, url) => {
    e.stopPropagation(); setFilePopup(null); setListFilePopup(null);
    setPopup({ url });
  };
  const openInNotion = () => { if (!popup?.url) return; window.location.href = popup.url.replace("https://www.notion.so/", "notion://www.notion.so/"); setPopup(null); };
  const openInBrowser = () => { if (!popup?.url) return; window.open(popup.url, "_blank"); setPopup(null); };

  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 1500);
    });
  };

  const isMultiLine = (text) => text && text.includes("\n");

  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation(); e.preventDefault();
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = { pdf: "application/pdf", hwpx: "application/octet-stream", hwp: "application/octet-stream", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", htl: "application/octet-stream" };
        const fh = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: "파일", accept: { [mimeMap[ext] || "application/octet-stream"]: [`.${ext}`] } }] });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const bu = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = bu; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(bu);
      }
    } catch (err) { if (err.name !== "AbortError") alert("다운로드 실패: " + err.message); }
    finally { setDownloading((prev) => ({ ...prev, [key]: false })); setFilePopup(null); }
  };

  const getFileLinks = (row) => row?.fileLinks ? row.fileLinks.split("\n").filter(Boolean) : [];

  // 뷰 모드 렌더러
  const renderTable = () => (
    <div className="table-outer" ref={tableOuterRef}>
      <table>
        <thead>
          <tr>
            <th>문서 제목</th><th>유형</th><th>상태</th><th>카테고리</th>
            <th>출원번호</th><th>출원인(특허고객번호)</th><th>대리인 코드</th><th>마감일</th><th>파일</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => (
            <tr key={i} className={`result-row ${i % 2 === 0 ? "row-even" : "row-odd"}`}>
              <td className="td-nowrap">
                <div className="cell-inner">
                  <span className="doc-icon">📄</span>
                  <span className="doc-title" onClick={(e) => handleTitleClick(e, row.url)}>{renderSingleLine(row.title)}</span>
                </div>
              </td>
              <td className="td-nowrap">{row.type ? <span className="badge type">{renderSingleLine(row.type)}</span> : <span className="dash">—</span>}</td>
              <td className="td-nowrap">{row.status ? <span className="badge status">{renderSingleLine(row.status)}</span> : <span className="dash">—</span>}</td>
              <td className="td-nowrap">{row.category ? <span className="badge category">{renderSingleLine(row.category)}</span> : <span className="dash">—</span>}</td>
              <td className={isMultiLine(row.appNum) ? "td-top" : "td-nowrap"}>
                <div className="copy-wrap">{renderWithIndent(row.appNum)}{row.appNum && <button className={`copy-btn${copied[`${i}-appNum`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appNum, `${i}-appNum`)}>{copied[`${i}-appNum`] ? "✓" : "복사"}</button>}</div>
              </td>
              <td className={isMultiLine(row.appOwner) ? "td-top" : "td-nowrap"}>
                <div className="copy-wrap">{renderWithIndent(row.appOwner)}{row.appOwner && <button className={`copy-btn${copied[`${i}-appOwner`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appOwner, `${i}-appOwner`)}>{copied[`${i}-appOwner`] ? "✓" : "복사"}</button>}</div>
              </td>
              <td className={isMultiLine(row.agentCode) ? "td-top" : "td-nowrap"}>
                <div className="copy-wrap">{renderWithIndent(row.agentCode)}{row.agentCode && <button className={`copy-btn${copied[`${i}-agentCode`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.agentCode, `${i}-agentCode`)}>{copied[`${i}-agentCode`] ? "✓" : "복사"}</button>}</div>
              </td>
              <td className="td-nowrap"><span className="cell-text">{row.deadline || "—"}</span></td>
              <td className="td-files">
                {row.fileLinks ? (
                  <div className="file-links">
                    {getFileLinks(row).map((link, j) => {
                      const fileName = decodeURIComponent(link.split("/").pop());
                      const popupKey = `${i}-${j}`;
                      const isOpen = filePopup === popupKey;
                      return (
                        <div key={j} className="file-link-wrap">
                          <span className={`file-link${isOpen ? " active" : ""}`}
                            onMouseDown={(e) => { e.stopPropagation(); if (isOpen) { setFilePopup(null); } else { setPopupPos({ x: e.clientX, y: e.clientY }); setFilePopup(popupKey); } }}>
                            📄 {fileName} ▾
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : <span className="dash">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCards = () => (
    <div className="card-grid">
      {results.map((row, i) => {
        const files = getFileLinks(row);
        return (
          <div key={i} className="card">
            <div className="card-header">
              <span className="card-title" onClick={(e) => handleTitleClick(e, row.url)}>📄 {row.title}</span>
              <div className="card-badges">
                {row.type && <span className="badge type">{renderSingleLine(row.type)}</span>}
                {row.status && <span className="badge status">{renderSingleLine(row.status)}</span>}
              </div>
            </div>
            <div className="card-body">
              {row.category && <div className="card-row"><span className="cl">카테고리</span><span className="badge category">{renderSingleLine(row.category)}</span></div>}
              {row.appNum && <div className="card-row"><span className="cl">출원번호</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appNum)}<button className={`copy-btn${copied[`c${i}-appNum`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appNum, `c${i}-appNum`)}>{copied[`c${i}-appNum`] ? "✓" : "복사"}</button></div></div>}
              {row.appOwner && <div className="card-row"><span className="cl">출원인</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appOwner)}<button className={`copy-btn${copied[`c${i}-appOwner`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appOwner, `c${i}-appOwner`)}>{copied[`c${i}-appOwner`] ? "✓" : "복사"}</button></div></div>}
              {row.agentCode && <div className="card-row"><span className="cl">대리인</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.agentCode)}<button className={`copy-btn${copied[`c${i}-agentCode`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.agentCode, `c${i}-agentCode`)}>{copied[`c${i}-agentCode`] ? "✓" : "복사"}</button></div></div>}
              {row.deadline && <div className="card-row"><span className="cl">마감일</span><span className="cell-text">{row.deadline}</span></div>}
            </div>
            {files.length > 0 && (
              <div className="card-files">
                {files.map((link, j) => {
                  const fileName = decodeURIComponent(link.split("/").pop());
                  const popupKey = `${i}-${j}`;
                  const isOpen = filePopup === popupKey;
                  return (
                    <div key={j} className="file-link-wrap">
                      <span className={`file-link${isOpen ? " active" : ""}`}
                        onMouseDown={(e) => { e.stopPropagation(); if (isOpen) { setFilePopup(null); } else { setPopupPos({ x: e.clientX, y: e.clientY }); setFilePopup(popupKey); } }}>
                        📄 {fileName} ▾
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderList = () => (
    <div className="list-wrap">
      {results.map((row, i) => {
        const files = getFileLinks(row);
        const isListFileOpen = listFilePopup?.rowIdx === i;
        return (
          <div key={i} className="list-item">
            <div className="list-main">
              <span className="list-dot" />
              <span className="list-title doc-title" onClick={(e) => handleTitleClick(e, row.url)}>{row.title}</span>
              <div className="list-meta">
                {row.type && <span className="badge type">{renderSingleLine(row.type)}</span>}
                {row.status && <span className="badge status">{renderSingleLine(row.status)}</span>}
                {row.category && <span className="badge category">{renderSingleLine(row.category)}</span>}
                {row.appNum && <div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appNum)}<button className={`copy-btn${copied[`l${i}-appNum`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appNum, `l${i}-appNum`)}>{copied[`l${i}-appNum`] ? "✓" : "복사"}</button></div>}
                {row.appOwner && <div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appOwner)}<button className={`copy-btn${copied[`l${i}-appOwner`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appOwner, `l${i}-appOwner`)}>{copied[`l${i}-appOwner`] ? "✓" : "복사"}</button></div>}
                {row.agentCode && <div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.agentCode)}<button className={`copy-btn${copied[`l${i}-agentCode`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.agentCode, `l${i}-agentCode`)}>{copied[`l${i}-agentCode`] ? "✓" : "복사"}</button></div>}
                {row.deadline && <span className="cell-text">{row.deadline}</span>}
                {files.length > 0 && (
                  <button className={`list-file-btn${isListFileOpen ? " active" : ""}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (isListFileOpen) { setListFilePopup(null); }
                      else { setListFilePopup({ rowIdx: i, pos: { x: e.clientX, y: e.clientY } }); setFilePopup(null); }
                    }}>
                    📄 {files.length}개 ▾
                  </button>
                )}
                {files.length === 0 && <span className="dash" style={{fontSize:"11px"}}>파일 없음</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTimeline = () => (
    <div className="timeline-wrap">
      {results.map((row, i) => {
        const files = getFileLinks(row);
        const dateStr = row.deadline || null;
        return (
          <div key={i} className="tl-item">
            <div className="tl-left">
              <div className="tl-date">{dateStr ? dateStr.replace(/-/g, ".").slice(2) : "—"}</div>
              {i < results.length - 1 && <div className="tl-line" />}
            </div>
            <div className="tl-card">
              <div className="tl-card-header">
                <span className="tl-title doc-title" onClick={(e) => handleTitleClick(e, row.url)}>{row.title}</span>
                <div className="tl-badges">
                  {row.type && <span className="badge type">{renderSingleLine(row.type)}</span>}
                  {row.status && <span className="badge status">{renderSingleLine(row.status)}</span>}
                  {row.category && <span className="badge category">{renderSingleLine(row.category)}</span>}
                </div>
              </div>
              <div className="tl-details">
                {row.appNum && <div className="tl-row"><span className="cl">출원번호</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appNum)}<button className={`copy-btn${copied[`t${i}-appNum`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appNum, `t${i}-appNum`)}>{copied[`t${i}-appNum`] ? "✓" : "복사"}</button></div></div>}
                {row.appOwner && <div className="tl-row"><span className="cl">출원인</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.appOwner)}<button className={`copy-btn${copied[`t${i}-appOwner`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.appOwner, `t${i}-appOwner`)}>{copied[`t${i}-appOwner`] ? "✓" : "복사"}</button></div></div>}
                {row.agentCode && <div className="tl-row"><span className="cl">대리인</span><div className="copy-wrap" style={{gap:"4px"}}>{renderWithIndent(row.agentCode)}<button className={`copy-btn${copied[`t${i}-agentCode`] ? " copied" : ""}`} onClick={(e) => handleCopy(e, row.agentCode, `t${i}-agentCode`)}>{copied[`t${i}-agentCode`] ? "✓" : "복사"}</button></div></div>}
              </div>
              {files.length > 0 && (
                <div className="tl-files">
                  {files.map((link, j) => {
                    const fileName = decodeURIComponent(link.split("/").pop());
                    const popupKey = `${i}-${j}`;
                    const isOpen = filePopup === popupKey;
                    return (
                      <div key={j} className="file-link-wrap">
                        <span className={`file-link${isOpen ? " active" : ""}`}
                          onMouseDown={(e) => { e.stopPropagation(); if (isOpen) { setFilePopup(null); } else { setPopupPos({ x: e.clientX, y: e.clientY }); setFilePopup(popupKey); } }}>
                          📄 {fileName} ▾
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

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
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* 파일 팝업 (테이블/카드/타임라인용) */}
      <FilePopup filePopup={filePopup} popupPos={popupPos} results={results} downloading={downloading} setFilePopup={setFilePopup} handleDownload={handleDownload} filePopupRef={filePopupRef} />

      {/* 리스트용 파일 목록 팝업 */}
      {listFilePopup && results && (
        <FileListPopup
          row={results[listFilePopup.rowIdx]}
          rowIdx={listFilePopup.rowIdx}
          pos={listFilePopup.pos}
          onClose={() => setListFilePopup(null)}
          setFilePopup={setFilePopup}
          setPopupPos={setPopupPos}
        />
      )}

      <div className={`page${searched ? " searched" : ""}${dark ? " dark" : ""}`}>
        <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? "라이트 모드" : "다크 모드"}>{dark ? "☀️" : "🌙"}</button>
        <button className="upload-btn" onClick={() => router.push("/upload")} title="파일 업로드">📁</button>

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
            <input ref={inputRef} type="text" placeholder="문서명, 출원번호, 출원인, 대리인 코드..."
              value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
            {query && <button className="clear-btn" onClick={handleClear}>✕</button>}
            <button className="search-btn" onClick={handleSearch}>검색</button>
          </div>
        </div>

        <div className="results">
          {loading && (
            <div className="loading"><div className="spinner" /><p>Notion DB 검색 중...</p></div>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          {!loading && results !== null && (
            results.length === 0 ? (
              <div className={`fade-wrap${tableVisible ? " visible" : ""}`}>
                <div className="no-result"><p className="no-icon">📭</p><p className="no-text">검색 결과가 없습니다</p><p className="no-sub">다른 키워드로 시도해 보세요</p></div>
              </div>
            ) : (
              <div className={`fade-wrap${tableVisible ? " visible" : ""}`}>
                {/* 카운트 + 뷰 토글 */}
                <div className="results-header">
                  <p className="count">{isRecent ? "🕐 최근 수정된 문서 5건" : `검색 결과 ${results.length}건`}</p>
                  <div className="view-toggle">
                    {[["table","🗂 테이블"],["card","🃏 카드"],["list","☰ 리스트"],["timeline","📅 타임라인"]].map(([v, label]) => (
                      <button key={v} className={`vbtn${viewMode === v ? " active" : ""}`} onClick={() => { setViewMode(v); setFilePopup(null); setListFilePopup(null); }}>{label}</button>
                    ))}
                  </div>
                </div>

                {viewMode === "table" && renderTable()}
                {viewMode === "card" && renderCards()}
                {viewMode === "list" && renderList()}
                {viewMode === "timeline" && renderTimeline()}

                <div className="notion-db-wrap">
                  <button className="notion-db-btn" onClick={() => window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a", "_blank")}>
                    📋 G&A IP 문서 DB 전체 보기 (Notion)
                  </button>
                </div>
              </div>
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
        @keyframes slideUpFade { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .file-popup-fixed {
          position: fixed; z-index: 500;
          background: #fff; border: 1.5px solid #e5e9f5; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(19,39,79,0.18);
          padding: 6px; min-width: 140px; display: flex; flex-direction: column; gap: 4px;
        }
        .file-list-popup {
          position: fixed; z-index: 500;
          background: #fff; border: 1.5px solid #e5e9f5; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(19,39,79,0.18);
          padding: 8px; min-width: 220px; display: flex; flex-direction: column; gap: 2px;
        }
        .flp-title { font-size: 11px; font-weight: 700; color: #6b7280; padding: 2px 6px 6px; border-bottom: 1px solid #e5e9f5; margin-bottom: 4px; }
        .flp-item { font-size: 12px; color: #1a3a8f; padding: 6px 10px; border-radius: 7px; cursor: pointer; }
        .flp-item:hover { background: #eef1fb; }
        .popup-btn { font-size:12px; font-weight:700; padding:8px 14px; border-radius:7px; text-decoration:none; white-space:nowrap; text-align:center; cursor:pointer; border:none; font-family:inherit; transition:background .15s; display:block; }
        .popup-btn.preview { background:#eef1fb; color:#1a3a8f; }
        .popup-btn.preview:hover { background:#d0d9f0; }
        .popup-btn.download { background:#f0fdf4; color:#166534; }
        .popup-btn.download:hover { background:#dcfce7; }
        .popup-btn.download.loading { background:#f3f4f6; color:#9ca3af; cursor:not-allowed; }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease, transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px; background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937; transition:background .3s,color .3s; position:relative; box-sizing:border-box; animation:slideUpFade .7s ease both; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }
        .theme-toggle { position:absolute; top:20px; right:20px; background:none; border:2px solid #d0d9f0; border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .dark .theme-toggle { border-color:#475569; }
        .upload-btn { position:absolute; top:20px; right:70px; background:none; border:2px solid #d0d9f0; border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .dark .upload-btn { border-color:#475569; }
        .logo-area { margin-top:10vh; margin-bottom:32px; text-align:center; transition:margin .3s; }
        .searched .logo-area { margin-top:24px; margin-bottom:16px; }
        .searched .logo-area:hover .logo-hint { opacity:1; }
        .logo-wrap { display:inline-block; text-align:center; }
        .logo-top-rule { width:520px; height:1px; background:#13274F; margin:0 auto 18px; }
        .logo-main { font-family:'EB Garamond',serif; font-size:56px; font-weight:700; color:#13274F; letter-spacing:-0.5px; line-height:1.1; margin:0; }
        .dark .logo-main { color:#e2e8f0; }
        .logo-sub-en { font-size:13px; font-weight:400; color:#13274F; letter-spacing:6px; margin:10px 0 14px; text-transform:uppercase; }
        .dark .logo-sub-en { color:#94a3b8; }
        .logo-mid-rule { width:300px; height:1px; background:#13274F; margin:0 auto 14px; }
        .dark .logo-top-rule,.dark .logo-mid-rule,.dark .logo-bot-rule { background:#475569; }
        .logo-sub-kr { font-family:'Noto Serif KR',serif; font-size:26px; font-weight:700; color:#13274F; letter-spacing:2px; margin:0 0 14px; }
        .dark .logo-sub-kr { color:#e2e8f0; }
        .logo-bot-rule { width:520px; height:1px; background:#13274F; margin:0 auto; }
        .logo-hint { font-size:11px; color:#94a3b8; margin-top:6px; opacity:0; transition:opacity .2s; }
        .subtitle { color:#6b7280; font-size:13px; margin-top:12px; letter-spacing:3px; text-transform:uppercase; }
        .searched .logo-main { font-size:30px; }
        .searched .logo-sub-en { font-size:10px; letter-spacing:4px; margin:6px 0 8px; }
        .searched .logo-sub-kr { font-size:15px; margin-bottom:8px; }
        .searched .logo-top-rule,.searched .logo-bot-rule { width:300px; }
        .searched .logo-mid-rule { width:170px; }
        @media (max-width:480px) { .logo-main{font-size:36px} .logo-top-rule,.logo-bot-rule{width:300px} .logo-sub-kr{font-size:18px} .logo-sub-en{font-size:11px;letter-spacing:4px} .searched .logo-main{font-size:22px} .searched .logo-top-rule,.searched .logo-bot-rule{width:200px} }
        .search-wrap { width:100%; max-width:600px; margin-bottom:24px; transition:max-width .3s; }
        .searched .search-wrap { max-width:100%; }
        .search-box { display:flex; align-items:center; background:#f8faff; border:1.5px solid #cbd5e1; border-radius:10px; padding:6px 6px 6px 16px; box-shadow:0 2px 12px rgba(19,39,79,0.08); gap:8px; }
        .dark .search-box { background:#1e293b; border-color:#334155; }
        .icon { font-size:17px; flex-shrink:0; }
        input { flex:1; border:none; outline:none; font-size:16px; color:#1f2937; background:transparent; font-family:inherit; min-width:0; }
        .dark input { color:#e2e8f0; }
        .clear-btn { background:none; border:none; cursor:pointer; color:#9ca3af; font-size:15px; padding:0 2px; flex-shrink:0; }
        .search-btn { background:#13274F; color:#fff; border:none; border-radius:8px; padding:9px 18px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; }
        .search-btn:hover { background:#0d1e3d; }
        @media (max-width:480px) { .search-btn{padding:9px 14px;font-size:13px} input{font-size:16px} }
        .results { width:100%; max-width:1100px; padding-bottom:60px; }
        .loading { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f; border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon { font-size:48px; }
        .no-text { font-size:18px; font-weight:600; margin-top:12px; }
        .no-sub { color:#9ca3af; font-size:14px; margin-top:6px; }

        /* 결과 헤더 + 뷰 토글 */
        .results-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
        .count { color:#6b7280; font-size:13px; }
        .view-toggle { display:flex; gap:4px; }
        .vbtn { padding:5px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; background:#fff; color:#6b7280; transition:all .15s; font-family:inherit; white-space:nowrap; }
        .vbtn:hover:not(.active) { background:#f4f6fc; }
        .vbtn.active { background:#13274F; color:#fff; border-color:#13274F; }
        .dark .vbtn { background:#1e293b; color:#94a3b8; border-color:#334155; }
        .dark .vbtn.active { background:#1e3a6e; color:#fff; border-color:#1e3a6e; }

        /* 테이블 */
        .table-outer { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(26,58,143,0.08); overflow-x:auto; border:1px solid #e5e9f5; }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }
        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700; font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15); }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }
        th:first-child { position:sticky; left:0; z-index:3; background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.3); }
        .dark th:first-child { background:#1e3a6e; }
        .result-row { transition:background .12s; }
        .result-row:hover td { background:#f0f4ff; }
        .dark .result-row:hover td { background:#1e3a5f; }
        td { padding:10px 16px; border-bottom:1.5px solid #dde3f5; border-right:1px solid #edf0fb; white-space:nowrap; text-align:center; vertical-align:middle; background:inherit; }
        td:last-child { border-right:none; }
        .dark td { border-bottom-color:#2a3a55; border-right-color:#222e42; }
        td:first-child { position:sticky; left:0; z-index:2; background:#fff; border-right:2px solid #dde3f5; }
        .dark td:first-child { background:#1e293b; border-right-color:#2a3a55; }
        .result-row:hover td:first-child { background:#f0f4ff; }
        .dark .result-row:hover td:first-child { background:#1e3a5f; }
        .row-odd td:first-child { background:#f7f8ff; }
        .dark .row-odd td:first-child { background:#172035; }
        .row-odd { background:#f7f8ff; }
        .row-even { background:#fff; }
        .dark .row-odd { background:#172035; }
        .dark .row-even { background:#1e293b; }
        .row-odd:hover td:first-child,.row-even:hover td:first-child { background:#f0f4ff; }
        .dark .row-odd:hover td:first-child,.dark .row-even:hover td:first-child { background:#1e3a5f; }
        .td-nowrap { vertical-align:middle; text-align:center; }
        .td-top { vertical-align:top; padding-top:10px; text-align:left; }
        .td-files { vertical-align:middle; text-align:left; min-width:200px; }
        .cell-inner { display:flex; align-items:center; justify-content:center; gap:6px; }
        .doc-icon { font-size:14px; flex-shrink:0; }
        .doc-title { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:.75; }
        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .badge.type { background:#eef1fb; color:#1a3a8f; }
        .badge.status { background:#f0fdf4; color:#166534; }
        .badge.category { background:#fef3c7; color:#92400e; }
        .dark .badge.type { background:#1e3a6e; color:#93c5fd; }
        .dark .badge.status { background:#14532d; color:#86efac; }
        .dark .badge.category { background:#451a03; color:#fcd34d; }
        .dash { color:#d1d5db; }
        .copy-wrap { display:inline-flex; align-items:flex-start; gap:6px; }
        .cell-text { font-size:12px; color:#6b7280; white-space:nowrap; }
        .dark .cell-text { color:#94a3b8; }
        .indent-block { display:flex; flex-direction:column; gap:3px; text-align:left; }
        .first-line { font-size:12px; color:#6b7280; white-space:nowrap; }
        .indent-line { font-size:12px; color:#6b7280; white-space:nowrap; padding-left:16px; }
        .dark .first-line,.dark .indent-line { color:#94a3b8; }
        .copy-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px; padding:2px 7px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
        .copy-btn:hover { background:#d0d9f0; }
        .copy-btn.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn { background:#1e3a6e; color:#93c5fd; }
        .dark .copy-btn.copied { background:#14532d; color:#86efac; }
        .file-links { display:flex; flex-direction:column; gap:4px; }
        .file-link-wrap { position:relative; display:inline-block; }
        .file-link { font-size:12px; color:#1a3a8f; padding:3px 8px; background:#eef1fb; border-radius:5px; white-space:nowrap; display:inline-block; cursor:pointer; user-select:none; transition:background .15s; }
        .file-link:hover,.file-link.active { background:#d0d9f0; }
        .dark .file-link { background:#1e3a6e; color:#93c5fd; }
        .dark .file-link:hover,.dark .file-link.active { background:#2a4a8e; }

        /* 카드 뷰 */
        .card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
        .card { background:#fff; border:1.5px solid #e5e9f5; border-radius:14px; padding:16px; }
        .dark .card { background:#1e293b; border-color:#334155; }
        .card-header { margin-bottom:10px; }
        .card-title { font-size:13px; font-weight:700; color:#1a3a8f; cursor:pointer; text-decoration:underline; display:block; margin-bottom:6px; }
        .dark .card-title { color:#93c5fd; }
        .card-badges { display:flex; flex-wrap:wrap; gap:4px; }
        .card-body { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
        .card-row { display:flex; align-items:flex-start; gap:8px; font-size:12px; }
        .cl { color:#9ca3af; font-size:11px; min-width:48px; flex-shrink:0; padding-top:2px; }
        .card-files { border-top:1px solid #e5e9f5; padding-top:10px; display:flex; flex-wrap:wrap; gap:4px; }
        .dark .card-files { border-color:#334155; }

        /* 리스트 뷰 */
        .list-wrap { background:#fff; border:1.5px solid #e5e9f5; border-radius:14px; overflow:hidden; }
        .dark .list-wrap { background:#1e293b; border-color:#334155; }
        .list-item { border-bottom:1px solid #f0f4ff; }
        .dark .list-item { border-color:#222e42; }
        .list-item:last-child { border-bottom:none; }
        .list-main { display:flex; align-items:center; gap:8px; padding:10px 16px; flex-wrap:wrap; }
        .list-dot { width:6px; height:6px; border-radius:50%; background:#1a3a8f; flex-shrink:0; }
        .list-title { font-size:13px; font-weight:600; min-width:120px; }
        .list-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px; flex:1; }
        .list-file-btn { background:#eef1fb; color:#1a3a8f; border:none; border-radius:5px; padding:2px 8px; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .list-file-btn:hover,.list-file-btn.active { background:#d0d9f0; }
        .dark .list-file-btn { background:#1e3a6e; color:#93c5fd; }
        .dark .list-file-btn:hover,.dark .list-file-btn.active { background:#2a4a8e; }

        /* 타임라인 뷰 */
        .timeline-wrap { display:flex; flex-direction:column; }
        .tl-item { display:flex; gap:12px; }
        .tl-left { display:flex; flex-direction:column; align-items:center; width:56px; flex-shrink:0; padding-top:12px; }
        .tl-date { font-size:10px; color:#9ca3af; text-align:center; line-height:1.4; white-space:nowrap; }
        .tl-line { width:1px; background:#e5e9f5; flex:1; margin-top:6px; min-height:16px; }
        .dark .tl-line { background:#334155; }
        .tl-card { flex:1; background:#fff; border:1.5px solid #e5e9f5; border-radius:12px; padding:12px 14px; margin-bottom:10px; }
        .dark .tl-card { background:#1e293b; border-color:#334155; }
        .tl-card-header { margin-bottom:8px; }
        .tl-title { font-size:13px; font-weight:700; color:#1a3a8f; cursor:pointer; text-decoration:underline; display:block; margin-bottom:6px; }
        .dark .tl-title { color:#93c5fd; }
        .tl-badges { display:flex; flex-wrap:wrap; gap:4px; }
        .tl-details { display:flex; flex-direction:column; gap:4px; margin-bottom:8px; }
        .tl-row { display:flex; align-items:flex-start; gap:8px; font-size:12px; }
        .tl-files { border-top:1px solid #e5e9f5; padding-top:8px; display:flex; flex-wrap:wrap; gap:4px; }
        .dark .tl-files { border-color:#334155; }

        /* Notion 버튼 */
        .notion-db-wrap { text-align:center; margin-top:24px; padding-bottom:20px; }
        .notion-db-btn { background:#fff; color:#1e3a8a; border:2px solid #c7d2fe; border-radius:28px; padding:12px 28px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 2px 10px rgba(99,102,241,0.12); transition:all .2s; }
        .notion-db-btn:hover { background:#eef2ff; border-color:#4f46e5; }
        .dark .notion-db-btn { background:#1e293b; color:#818cf8; border-color:#334155; }

        .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:999; }
        .modal { background:#fff; border-radius:20px; padding:32px 36px; max-width:360px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.25); text-align:center; }
        .dark .modal { background:#1e293b; color:#e2e8f0; }
        .modal-icon { font-size:40px; margin-bottom:12px; }
        .modal-title { font-size:18px; font-weight:800; margin-bottom:6px; }
        .modal-sub { font-size:13px; color:#6b7280; margin-bottom:24px; }
        .modal-btns { display:flex; flex-direction:column; gap:10px; }
        .modal-btn { border:none; border-radius:12px; padding:13px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .15s; }
        .modal-btn:hover { opacity:.82; }
        .modal-btn.primary { background:#1a3a8f; color:#fff; }
        .modal-btn.secondary { background:#eef1fb; color:#1a3a8f; }
        .modal-btn.cancel { background:#f3f4f6; color:#6b7280; }
        .dark .modal-btn.secondary { background:#1e3a6e; color:#93c5fd; }
        .dark .modal-btn.cancel { background:#334155; color:#94a3b8; }
      `}</style>
    </>
  );
}
