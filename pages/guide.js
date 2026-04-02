import { useState, useRef, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const NOTION_COLOR = {
  default: { bg: "#e5e7eb", text: "#374151", darkBg: "#374151", darkText: "#d1d5db" },
  gray:    { bg: "#f3f4f6", text: "#4b5563", darkBg: "#374151", darkText: "#d1d5db" },
  brown:   { bg: "#f5e6d8", text: "#7c3f1e", darkBg: "#3b1506", darkText: "#e2b48a" },
  orange:  { bg: "#ffedd5", text: "#9a3412", darkBg: "#431407", darkText: "#fdba74" },
  yellow:  { bg: "#fef9c3", text: "#854d0e", darkBg: "#422006", darkText: "#fde68a" },
  green:   { bg: "#dcfce7", text: "#166534", darkBg: "#14532d", darkText: "#86efac" },
  blue:    { bg: "#dbeafe", text: "#1e40af", darkBg: "#1e3a6e", darkText: "#93c5fd" },
  purple:  { bg: "#ede9fe", text: "#5b21b6", darkBg: "#3b0764", darkText: "#c4b5fd" },
  pink:    { bg: "#fce7f3", text: "#9d174d", darkBg: "#500724", darkText: "#f9a8d4" },
  red:     { bg: "#fee2e2", text: "#991b1b", darkBg: "#450a0a", darkText: "#fca5a5" },
};

function notionBadgeStyle(color, dark) {
  const c = NOTION_COLOR[color] || NOTION_COLOR.default;
  return dark
    ? { background: c.darkBg, color: c.darkText }
    : { background: c.bg, color: c.text };
}

export default function GuidePage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tableVisible, setTableVisible] = useState(false);

  // 콘텐츠 팝업 상태
  const [contentPopup, setContentPopup] = useState(null); // { title, blocks, loading }
  const [filePopup, setFilePopup] = useState(null); // { files, pos }
  const [downloading, setDownloading] = useState({});
  const [notionPopup, setNotionPopup] = useState(null);

  const tableOuterRef = useRef(null);
  const filePopupRef = useRef(null);
  const contentModalRef = useRef(null);

  useEffect(() => {
    fetchForms();
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      setResults(data.results);
      setTimeout(() => setTableVisible(true), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 파일 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!filePopup) return;
    const handleOutside = (e) => {
      if (filePopupRef.current && filePopupRef.current.contains(e.target)) return;
      if (e.target.closest(".fp-trigger")) return;
      setFilePopup(null);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [filePopup]);

  // 콘텐츠 팝업 열기
  const openContent = async (row) => {
    setContentPopup({ title: row.title, blocks: null, loading: true });
    try {
      const res = await fetch(`/api/blocks?pageId=${row.pageId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "콘텐츠 로드 실패");
      setContentPopup({ title: row.title, blocks: data.blocks, loading: false });
    } catch (err) {
      setContentPopup({ title: row.title, blocks: [], loading: false, error: err.message });
    }
  };

  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation();
    e.preventDefault();
    setDownloading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = {
          pdf: "application/pdf", hwpx: "application/octet-stream", hwp: "application/octet-stream",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        };
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "파일", accept: { [mimeMap[ext] || "application/octet-stream"]: [`.${ext}`] } }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      if (err.name !== "AbortError") alert("다운로드 실패: " + err.message);
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
      setFilePopup(null);
    }
  };

  const openInNotion = () => {
    if (!notionPopup?.url) return;
    const deepLink = notionPopup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    window.location.href = deepLink;
    setNotionPopup(null);
  };

  const openInBrowser = () => {
    if (!notionPopup?.url) return;
    window.open(notionPopup.url, "_blank");
    setNotionPopup(null);
  };

  // 블록 렌더링
  const renderBlock = (block, idx) => {
    const { type, text, level, checked } = block;
    if (type === "divider") {
      return <hr key={idx} style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "12px 0" }} />;
    }
    if (level === 1) return <h2 key={idx} style={{ fontSize: 18, fontWeight: 800, margin: "16px 0 6px", color: dark ? "#e2e8f0" : "#13274F" }}>{text}</h2>;
    if (level === 2) return <h3 key={idx} style={{ fontSize: 15, fontWeight: 700, margin: "12px 0 4px", color: dark ? "#cbd5e1" : "#1a3a8f" }}>{text}</h3>;
    if (level === 3) return <h4 key={idx} style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 3px", color: dark ? "#94a3b8" : "#374151" }}>{text}</h4>;
    if (type === "bulleted_list_item") return <p key={idx} style={{ fontSize: 13, margin: "3px 0", paddingLeft: 16, color: dark ? "#d1d5db" : "#374151" }}>• {text}</p>;
    if (type === "numbered_list_item") return <p key={idx} style={{ fontSize: 13, margin: "3px 0", paddingLeft: 16, color: dark ? "#d1d5db" : "#374151" }}>- {text}</p>;
    if (type === "to_do") return <p key={idx} style={{ fontSize: 13, margin: "3px 0", paddingLeft: 16, color: dark ? "#d1d5db" : "#374151" }}>{checked ? "☑" : "☐"} {text}</p>;
    if (type === "quote") return <blockquote key={idx} style={{ borderLeft: "3px solid #1a3a8f", paddingLeft: 12, margin: "8px 0", fontStyle: "italic", color: dark ? "#94a3b8" : "#6b7280", fontSize: 13 }}>{text}</blockquote>;
    if (type === "code") return <pre key={idx} style={{ background: dark ? "#0f172a" : "#f1f5f9", borderRadius: 6, padding: "8px 12px", fontSize: 12, overflowX: "auto", margin: "6px 0", color: dark ? "#e2e8f0" : "#1f2937" }}>{text}</pre>;
    return <p key={idx} style={{ fontSize: 13, margin: "4px 0", color: dark ? "#d1d5db" : "#374151", lineHeight: 1.7 }}>{text}</p>;
  };

  return (
    <>
      <Head>
        <title>문서 작성 방법 및 양식 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* 파일 팝업 */}
      {filePopup && (
        <div ref={filePopupRef}
          style={{ position: "fixed", left: filePopup.pos.x + 14, top: filePopup.pos.y - 10, zIndex: 600,
            background: dark ? "#1e293b" : "#fff", border: `1.5px solid ${dark ? "#334155" : "#e5e9f5"}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(19,39,79,0.18)", padding: 6,
            minWidth: 140, display: "flex", flexDirection: "column", gap: 4 }}
          onMouseDown={(e) => e.stopPropagation()}>
          <a href={filePopup.file.url} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 7,
              textDecoration: "none", textAlign: "center",
              background: dark ? "#1e3a6e" : "#eef1fb", color: dark ? "#93c5fd" : "#1a3a8f", display: "block" }}
            onClick={() => setFilePopup(null)}>🔍 미리보기</a>
          <button
            style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 7, textAlign: "center",
              background: downloading[filePopup.key] ? (dark ? "#1e293b" : "#f3f4f6") : (dark ? "#14532d" : "#f0fdf4"),
              color: downloading[filePopup.key] ? "#9ca3af" : (dark ? "#86efac" : "#166534"),
              border: "none", cursor: downloading[filePopup.key] ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            onClick={(e) => handleDownload(e, filePopup.file.url, filePopup.file.name, filePopup.key)}
            disabled={downloading[filePopup.key]}>
            {downloading[filePopup.key] ? "⏳ 준비 중..." : "⬇ 다운로드"}
          </button>
        </div>
      )}

      {/* 콘텐츠 팝업 */}
      {contentPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 900, padding: "20px 16px" }}
          onClick={() => setContentPopup(null)}>
          <div ref={contentModalRef}
            style={{ background: dark ? "#1e293b" : "#fff", borderRadius: 20, padding: "28px 32px",
              maxWidth: 640, width: "100%", maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 24px 60px rgba(0,0,0,0.28)", position: "relative" }}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setContentPopup(null)}
              style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none",
                fontSize: 20, cursor: "pointer", color: dark ? "#94a3b8" : "#9ca3af", lineHeight: 1 }}>✕</button>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: dark ? "#e2e8f0" : "#13274F",
              marginBottom: 20, paddingRight: 24, borderBottom: `1px solid ${dark ? "#334155" : "#e5e7eb"}`, paddingBottom: 14 }}>
              📄 {contentPopup.title}
            </h2>
            {contentPopup.loading ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ width: 32, height: 32, border: "3px solid #d0d9f0", borderTop: "3px solid #1a3a8f",
                  borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <p style={{ color: "#6b7280", fontSize: 13 }}>콘텐츠 불러오는 중...</p>
              </div>
            ) : contentPopup.error ? (
              <p style={{ color: "#dc2626", fontSize: 13 }}>⚠️ {contentPopup.error}</p>
            ) : contentPopup.blocks && contentPopup.blocks.length === 0 ? (
              <p style={{ color: dark ? "#94a3b8" : "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                콘텐츠가 없습니다.
              </p>
            ) : (
              <div style={{ lineHeight: 1.7 }}>
                {(contentPopup.blocks || []).map((block, idx) => renderBlock(block, idx))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notion 팝업 */}
      {notionPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setNotionPopup(null)}>
          <div style={{ background: dark ? "#1e293b" : "#fff", borderRadius: 20, padding: "32px 36px",
            maxWidth: 360, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center",
            color: dark ? "#e2e8f0" : "#1f2937" }}
            onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>📄</p>
            <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>노션에서 보시겠습니까?</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={openInNotion}
                style={{ background: "#1a3a8f", color: "#fff", border: "none", borderRadius: 12,
                  padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                예 — Notion 앱으로 열기
              </button>
              <button onClick={openInBrowser}
                style={{ background: dark ? "#1e3a6e" : "#eef1fb", color: dark ? "#93c5fd" : "#1a3a8f",
                  border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>
                브라우저로 열기
              </button>
              <button onClick={() => setNotionPopup(null)}
                style={{ background: dark ? "#334155" : "#f3f4f6", color: dark ? "#94a3b8" : "#6b7280",
                  border: "none", borderRadius: 12, padding: "13px", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>
                아니오
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`page${dark ? " dark" : ""}`}>

        {/* 상단 버튼들 */}
        <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? "라이트 모드" : "다크 모드"}>
          {dark ? "☀️" : "🌙"}
        </button>
        <button className="back-btn" onClick={() => router.push("/")} title="홈으로">
          ←
        </button>

        {/* 로고 */}
        <div className="logo-area" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <div className="logo-wrap">
            <div className="logo-top-rule" />
            <h1 className="logo-main">Guardian &amp; Angel</h1>
            <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
            <div className="logo-mid-rule" />
            <p className="logo-sub-kr">가엔 특허법률사무소</p>
            <div className="logo-bot-rule" />
          </div>
        </div>

        {/* 페이지 제목 */}
        <div className="page-title-wrap">
          <h2 className="page-title">📋 문서 작성 방법 및 양식</h2>
          <p className="page-subtitle">카테고리: <span className="cat-badge">문서 양식</span>으로 분류된 문서 목록입니다</p>
        </div>

        <div className="results">
          {loading && (
            <div className="loading">
              <div className="spinner" />
              <p>Notion DB 불러오는 중...</p>
            </div>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          {!loading && results !== null && (
            results.length === 0 ? (
              <div className="no-result">
                <p className="no-icon">📭</p>
                <p className="no-text">문서 양식이 없습니다</p>
                <p className="no-sub">카테고리가 &lsquo;문서 양식&rsquo;인 항목이 존재하지 않습니다</p>
              </div>
            ) : (
              <div className={`fade-wrap${tableVisible ? " visible" : ""}`}>
                <p className="count">총 {results.length}건의 양식</p>
                <div className="table-outer" ref={tableOuterRef}>
                  <table>
                    <thead>
                      <tr>
                        <th>문서명</th>
                        <th>콘텐츠</th>
                        <th>서류작업상태(작업자)</th>
                        <th>파일다운링크</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} className={`result-row ${i % 2 === 0 ? "row-even" : "row-odd"}`}>

                          {/* 문서명 */}
                          <td className="td-title">
                            <div className="cell-inner">
                              <span className="doc-icon">📄</span>
                              <span className="doc-title"
                                onClick={() => setNotionPopup({ url: row.url })}>
                                {row.title}
                              </span>
                            </div>
                          </td>

                          {/* 콘텐츠 — 열람하기 버튼 */}
                          <td className="td-center">
                            <button className="view-btn" onClick={() => openContent(row)}>
                              열람하기
                            </button>
                          </td>

                          {/* 서류작업상태(작업자) */}
                          <td className="td-center">
                            {row.docWorkStatusItem ? (
                              <span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color, dark)}>
                                {row.docWorkStatusItem.name}
                              </span>
                            ) : <span className="dash">—</span>}
                          </td>

                          {/* 파일다운링크 */}
                          <td className="td-files">
                            {row.fileLinks && row.fileLinks.length > 0 ? (
                              <div className="file-links">
                                {row.fileLinks.map((file, j) => {
                                  const popupKey = `${i}-${j}`;
                                  const isOpen = filePopup?.key === popupKey;
                                  return (
                                    <span key={j}
                                      className={`file-link fp-trigger${isOpen ? " active" : ""}`}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        if (isOpen) { setFilePopup(null); }
                                        else { setFilePopup({ key: popupKey, file, pos: { x: e.clientX, y: e.clientY } }); }
                                      }}>
                                      📄 {file.name} ▾
                                    </span>
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

                <div className="notion-db-wrap">
                  <button className="notion-db-btn"
                    onClick={() => window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a", "_blank")}>
                    📋 G&A IP 문서 DB 전체 보기 (Notion)
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; min-height: 100vh; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease, transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; padding: 0 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%);
          color: #1f2937; transition: background 0.3s, color 0.3s; position: relative;
          box-sizing: border-box; animation: slideUpFade 0.7s ease both;
        }
        .page.dark { background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; }

        .theme-toggle {
          position: absolute; top: 20px; right: 20px;
          background: none; border: 2px solid #d0d9f0; border-radius: 50%;
          width: 40px; height: 40px; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: border-color 0.2s;
        }
        .dark .theme-toggle { border-color: #475569; }

        .back-btn {
          position: absolute; top: 20px; left: 20px;
          background: none; border: 2px solid #d0d9f0; border-radius: 50%;
          width: 40px; height: 40px; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: border-color 0.2s;
          font-weight: 700; color: #1a3a8f; font-family: inherit;
        }
        .dark .back-btn { border-color: #475569; color: #93c5fd; }
        .back-btn:hover { border-color: #1a3a8f; }
        .dark .back-btn:hover { border-color: #93c5fd; }

        .logo-area { margin-top: 8vh; margin-bottom: 8px; text-align: center; transition: margin 0.3s; }
        .logo-wrap { display: inline-block; text-align: center; }
        .logo-top-rule { width: 380px; height: 1px; background: #13274F; margin: 0 auto 12px; }
        .logo-main { font-family: 'EB Garamond', serif; font-size: 38px; font-weight: 700; color: #13274F; letter-spacing: -0.5px; line-height: 1.1; margin: 0; }
        .dark .logo-main { color: #e2e8f0; }
        .logo-sub-en { font-size: 11px; font-weight: 400; color: #13274F; letter-spacing: 6px; margin: 6px 0 10px; text-transform: uppercase; }
        .dark .logo-sub-en { color: #94a3b8; }
        .logo-mid-rule { width: 220px; height: 1px; background: #13274F; margin: 0 auto 10px; }
        .dark .logo-mid-rule { background: #475569; }
        .logo-sub-kr { font-family: 'Noto Serif KR', serif; font-size: 18px; font-weight: 700; color: #13274F; letter-spacing: 2px; margin: 0 0 10px; }
        .dark .logo-sub-kr { color: #e2e8f0; }
        .logo-bot-rule { width: 380px; height: 1px; background: #13274F; margin: 0 auto; }
        .dark .logo-top-rule, .dark .logo-bot-rule { background: #475569; }

        .page-title-wrap { text-align: center; margin: 20px 0 28px; }
        .page-title { font-size: 22px; font-weight: 800; color: #13274F; margin-bottom: 8px; }
        .dark .page-title { color: #e2e8f0; }
        .page-subtitle { font-size: 13px; color: #6b7280; }
        .cat-badge { background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 5px; font-weight: 700; font-size: 12px; }
        .dark .cat-badge { background: #14532d; color: #86efac; }

        .results { width: 100%; max-width: 1000px; padding-bottom: 60px; }
        .loading { display: flex; flex-direction: column; align-items: center; margin-top: 60px; gap: 16px; }
        .spinner { width: 36px; height: 36px; border: 3px solid #d0d9f0; border-top: 3px solid #1a3a8f; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .loading p { color: #6b7280; font-size: 15px; }
        .error { color: #dc2626; text-align: center; margin-top: 40px; }
        .no-result { text-align: center; margin-top: 60px; }
        .no-icon { font-size: 48px; }
        .no-text { font-size: 18px; font-weight: 600; margin-top: 12px; }
        .no-sub { color: #9ca3af; font-size: 14px; margin-top: 6px; }
        .count { color: #6b7280; font-size: 13px; margin-bottom: 12px; }

        .table-outer { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(26,58,143,0.08); overflow-x: auto; border: 1px solid #e5e9f5; }
        .dark .table-outer { background: #1e293b; border-color: #334155; }
        table { border-collapse: separate; border-spacing: 0; font-size: 13px; width: max-content; min-width: 100%; }

        th { background: #1a3a8f; color: #fff; padding: 11px 16px; text-align: center; font-weight: 700; font-size: 12px; white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.15); }
        th:last-child { border-right: none; }
        .dark th { background: #1e3a6e; }
        th:first-child { position: sticky; left: 0; z-index: 3; background: #1a3a8f; border-right: 2px solid rgba(255,255,255,0.3); }
        .dark th:first-child { background: #1e3a6e; }

        .result-row { transition: background 0.12s; }
        .result-row:hover td { background: #f0f4ff; }
        .dark .result-row:hover td { background: #1e3a5f; }

        td { padding: 10px 16px; border-bottom: 1.5px solid #dde3f5; border-right: 1px solid #edf0fb; white-space: nowrap; text-align: center; vertical-align: middle; background: inherit; }
        td:last-child { border-right: none; }
        .dark td { border-bottom-color: #2a3a55; border-right-color: #222e42; }
        td:first-child { position: sticky; left: 0; z-index: 2; background: #fff; border-right: 2px solid #dde3f5; }
        .dark td:first-child { background: #1e293b; border-right-color: #2a3a55; }
        .result-row:hover td:first-child { background: #f0f4ff; }
        .dark .result-row:hover td:first-child { background: #1e3a5f; }
        .row-odd td:first-child { background: #f7f8ff; }
        .dark .row-odd td:first-child { background: #172035; }
        .row-odd { background: #f7f8ff; }
        .row-even { background: #fff; }
        .dark .row-odd { background: #172035; }
        .dark .row-even { background: #1e293b; }

        .td-title { vertical-align: middle; text-align: left; min-width: 200px; }
        .td-center { vertical-align: middle; text-align: center; }
        .td-files { vertical-align: middle; text-align: left; min-width: 180px; }

        .cell-inner { display: flex; align-items: center; gap: 6px; }
        .doc-icon { font-size: 14px; flex-shrink: 0; }
        .doc-title { color: #1a3a8f; font-weight: 600; font-size: 13px; cursor: pointer; text-decoration: underline; }
        .dark .doc-title { color: #93c5fd; }
        .doc-title:hover { opacity: 0.75; }

        .badge { border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 700; display: inline-block; }
        .dash { color: #d1d5db; }

        .view-btn {
          background: #1a3a8f; color: #fff; border: none; border-radius: 8px;
          padding: 6px 16px; font-size: 12px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: background 0.15s; white-space: nowrap;
        }
        .view-btn:hover { background: #0d1e3d; }
        .dark .view-btn { background: #1e3a6e; }
        .dark .view-btn:hover { background: #2a4a8e; }

        .file-links { display: flex; flex-direction: column; gap: 4px; }
        .file-link { font-size: 12px; color: #1a3a8f; padding: 3px 8px; background: #eef1fb; border-radius: 5px; white-space: nowrap; display: inline-block; cursor: pointer; user-select: none; transition: background 0.15s; }
        .file-link:hover, .file-link.active { background: #d0d9f0; }
        .dark .file-link { background: #1e3a6e; color: #93c5fd; }
        .dark .file-link:hover, .dark .file-link.active { background: #2a4a8e; }

        .notion-db-wrap { text-align: center; margin-top: 24px; padding-bottom: 20px; }
        .notion-db-btn { background: #fff; color: #1e3a8a; border: 2px solid #c7d2fe; border-radius: 28px; padding: 12px 28px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 2px 10px rgba(99,102,241,0.12); transition: all 0.2s; }
        .notion-db-btn:hover { background: #eef2ff; border-color: #4f46e5; }
        .dark .notion-db-btn { background: #1e293b; color: #818cf8; border-color: #334155; }

        @media (max-width: 480px) {
          .logo-main { font-size: 28px; }
          .logo-top-rule, .logo-bot-rule { width: 260px; }
          .logo-sub-kr { font-size: 14px; }
          .back-btn { top: 12px; left: 12px; width: 34px; height: 34px; font-size: 15px; }
          .theme-toggle { top: 12px; right: 12px; width: 34px; height: 34px; font-size: 15px; }
        }
      `}</style>
    </>
  );
}
