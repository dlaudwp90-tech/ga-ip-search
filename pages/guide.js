import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// ─── Notion 색상 팔레트 ────────────────────────────────────────────────────
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

// 인라인 텍스트 색상 (Notion color annotation)
const TEXT_COLORS = {
  gray: "#6b7280", brown: "#92400e", orange: "#c2410c", yellow: "#b45309",
  green: "#166534", blue: "#1d4ed8", purple: "#7e22ce", pink: "#be185d", red: "#b91c1c",
  gray_background: null, brown_background: null, orange_background: null,
  yellow_background: null, green_background: null, blue_background: null,
  purple_background: null, pink_background: null, red_background: null,
};
const BG_COLORS = {
  gray_background: "#f3f4f6", brown_background: "#fef3c7",
  orange_background: "#ffedd5", yellow_background: "#fef9c3",
  green_background: "#dcfce7", blue_background: "#dbeafe",
  purple_background: "#ede9fe", pink_background: "#fce7f3",
  red_background: "#fee2e2",
};
const CALLOUT_BG = {
  gray:   "#f9fafb", brown:  "#fdf6ee", orange: "#fff7ed", yellow: "#fefce8",
  green:  "#f0fdf4", blue:   "#eff6ff", purple: "#faf5ff", pink:   "#fdf2f8",
  red:    "#fef2f2", default:"#f9fafb",
};

function notionBadgeStyle(color, dark) {
  const c = NOTION_COLOR[color] || NOTION_COLOR.default;
  return dark ? { background: c.darkBg, color: c.darkText } : { background: c.bg, color: c.text };
}

// ─── Rich Text 렌더러 ──────────────────────────────────────────────────────
function RichText({ segments = [], dark }) {
  return (
    <>
      {segments.map((seg, i) => {
        const { text, href, annotations: a } = seg;
        const colorStyle = {};
        if (a.color && a.color !== "default") {
          if (a.color.endsWith("_background")) {
            colorStyle.backgroundColor = BG_COLORS[a.color] || "transparent";
            colorStyle.borderRadius = 3;
            colorStyle.padding = "1px 3px";
          } else {
            colorStyle.color = TEXT_COLORS[a.color] || undefined;
          }
        }
        const style = {
          fontWeight:     a.bold          ? 700         : undefined,
          fontStyle:      a.italic        ? "italic"    : undefined,
          textDecoration: [a.underline ? "underline" : "", a.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
          fontFamily:     a.code          ? "monospace" : undefined,
          background:     a.code          ? (dark ? "#1e293b" : "#f1f5f9") : colorStyle.backgroundColor,
          color:          colorStyle.color,
          borderRadius:   a.code          ? 4            : colorStyle.borderRadius,
          padding:        a.code          ? "1px 5px"   : colorStyle.padding,
          fontSize:       a.code          ? "0.88em"    : undefined,
          border:         a.code          ? `1px solid ${dark ? "#334155" : "#e2e8f0"}` : undefined,
        };
        const content = text;
        if (href) {
          return (
            <a key={i} href={href} target="_blank" rel="noreferrer"
              style={{ ...style, color: dark ? "#93c5fd" : "#1d4ed8", textDecoration: "underline" }}>
              {content}
            </a>
          );
        }
        return <span key={i} style={style}>{content}</span>;
      })}
    </>
  );
}

// ─── 블록 렌더러 (재귀) ────────────────────────────────────────────────────
function BlockRenderer({ blocks, dark, depth = 0, toggleStates, setToggleStates }) {
  const baseText  = { fontSize: 14, lineHeight: 1.75, color: dark ? "#d1d5db" : "#374151" };
  const indent    = { marginLeft: depth * 20 };

  return (
    <>
      {blocks.map((block, idx) => {
        const key = `${block.id || idx}`;

        switch (block.type) {

          // ── 단락 ──────────────────────────────────────────────────────────
          case "paragraph":
            return (
              <p key={key} style={{ ...baseText, ...indent, margin: "4px 0 6px" }}>
                {block.richText.length > 0
                  ? <RichText segments={block.richText} dark={dark} />
                  : <br />}
              </p>
            );

          // ── 제목 ──────────────────────────────────────────────────────────
          case "heading_1":
            return (
              <h2 key={key} style={{ ...indent, fontSize: 22, fontWeight: 800, margin: "24px 0 8px",
                color: dark ? "#e2e8f0" : "#13274F",
                borderBottom: `2px solid ${dark ? "#334155" : "#e5e7eb"}`, paddingBottom: 6 }}>
                <RichText segments={block.richText} dark={dark} />
              </h2>
            );
          case "heading_2":
            return (
              <h3 key={key} style={{ ...indent, fontSize: 17, fontWeight: 700, margin: "18px 0 6px",
                color: dark ? "#cbd5e1" : "#1a3a8f" }}>
                <RichText segments={block.richText} dark={dark} />
              </h3>
            );
          case "heading_3":
            return (
              <h4 key={key} style={{ ...indent, fontSize: 14, fontWeight: 700, margin: "14px 0 4px",
                color: dark ? "#94a3b8" : "#374151" }}>
                <RichText segments={block.richText} dark={dark} />
              </h4>
            );

          // ── 글머리 목록 ───────────────────────────────────────────────────
          case "bulleted_list_item":
            return (
              <div key={key} style={{ ...indent, margin: "3px 0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ ...baseText, marginTop: 2, flexShrink: 0, color: dark ? "#94a3b8" : "#6b7280" }}>
                    {depth === 0 ? "•" : depth === 1 ? "◦" : "▪"}
                  </span>
                  <span style={baseText}><RichText segments={block.richText} dark={dark} /></span>
                </div>
                {block.children.length > 0 && (
                  <BlockRenderer blocks={block.children} dark={dark} depth={depth + 1}
                    toggleStates={toggleStates} setToggleStates={setToggleStates} />
                )}
              </div>
            );

          // ── 번호 목록 ─────────────────────────────────────────────────────
          case "numbered_list_item":
            return (
              <div key={key} style={{ ...indent, margin: "3px 0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ ...baseText, marginTop: 2, flexShrink: 0, minWidth: 16, textAlign: "right",
                    color: dark ? "#94a3b8" : "#6b7280" }}>
                    {idx + 1}.
                  </span>
                  <span style={baseText}><RichText segments={block.richText} dark={dark} /></span>
                </div>
                {block.children.length > 0 && (
                  <BlockRenderer blocks={block.children} dark={dark} depth={depth + 1}
                    toggleStates={toggleStates} setToggleStates={setToggleStates} />
                )}
              </div>
            );

          // ── 체크박스 ──────────────────────────────────────────────────────
          case "to_do":
            return (
              <div key={key} style={{ ...indent, display: "flex", gap: 8, alignItems: "flex-start", margin: "3px 0" }}>
                <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0,
                  color: block.checked ? "#16a34a" : (dark ? "#94a3b8" : "#9ca3af") }}>
                  {block.checked ? "☑" : "☐"}
                </span>
                <span style={{ ...baseText, textDecoration: block.checked ? "line-through" : "none",
                  color: block.checked ? (dark ? "#6b7280" : "#9ca3af") : baseText.color }}>
                  <RichText segments={block.richText} dark={dark} />
                </span>
              </div>
            );

          // ── 인용 ──────────────────────────────────────────────────────────
          case "quote":
            return (
              <blockquote key={key} style={{ ...indent, margin: "8px 0",
                borderLeft: `4px solid ${dark ? "#4f6baf" : "#1a3a8f"}`,
                paddingLeft: 14, paddingTop: 4, paddingBottom: 4,
                background: dark ? "rgba(30,58,110,0.2)" : "rgba(219,234,254,0.3)",
                borderRadius: "0 6px 6px 0" }}>
                <span style={{ ...baseText, fontStyle: "italic", color: dark ? "#94a3b8" : "#4b5563" }}>
                  <RichText segments={block.richText} dark={dark} />
                </span>
                {block.children.length > 0 && (
                  <BlockRenderer blocks={block.children} dark={dark} depth={depth}
                    toggleStates={toggleStates} setToggleStates={setToggleStates} />
                )}
              </blockquote>
            );

          // ── 코드 블록 ─────────────────────────────────────────────────────
          case "code":
            return (
              <div key={key} style={{ ...indent, margin: "10px 0" }}>
                {block.language && block.language !== "plain text" && (
                  <div style={{ fontSize: 11, color: dark ? "#64748b" : "#94a3b8",
                    background: dark ? "#0f172a" : "#e2e8f0",
                    padding: "3px 10px", borderRadius: "6px 6px 0 0",
                    display: "inline-block", marginBottom: -1 }}>
                    {block.language}
                  </div>
                )}
                <pre style={{
                  background: dark ? "#0f172a" : "#f8fafc",
                  border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`,
                  borderRadius: block.language && block.language !== "plain text" ? "0 6px 6px 6px" : 6,
                  padding: "12px 16px", overflowX: "auto", margin: 0,
                  fontSize: 13, lineHeight: 1.6, color: dark ? "#e2e8f0" : "#1f2937",
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Courier New', monospace",
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>
                  <RichText segments={block.richText} dark={dark} />
                </pre>
              </div>
            );

          // ── 구분선 ────────────────────────────────────────────────────────
          case "divider":
            return (
              <hr key={key} style={{
                border: "none", margin: "16px 0",
                borderTop: `1px solid ${dark ? "#334155" : "#e5e7eb"}`,
              }} />
            );

          // ── 이미지 ────────────────────────────────────────────────────────
          case "image":
            return block.imageUrl ? (
              <figure key={key} style={{ ...indent, margin: "14px 0", textAlign: "center" }}>
                <img src={block.imageUrl} alt={block.caption?.map(c => c.text).join("") || "이미지"}
                  style={{ maxWidth: "100%", borderRadius: 8,
                    border: `1px solid ${dark ? "#334155" : "#e5e7eb"}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }} />
                {block.caption && block.caption.length > 0 && (
                  <figcaption style={{ marginTop: 6, fontSize: 12, color: dark ? "#64748b" : "#9ca3af" }}>
                    <RichText segments={block.caption} dark={dark} />
                  </figcaption>
                )}
              </figure>
            ) : null;

          // ── 콜아웃 ────────────────────────────────────────────────────────
          case "callout": {
            const bgColor = CALLOUT_BG[block.color?.replace("_background", "")] || CALLOUT_BG.default;
            return (
              <div key={key} style={{
                ...indent, margin: "10px 0", display: "flex", gap: 10, alignItems: "flex-start",
                background: dark ? "rgba(30,58,110,0.25)" : bgColor,
                border: `1px solid ${dark ? "#334155" : "#e5e7eb"}`,
                borderRadius: 8, padding: "12px 14px",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {block.iconType === "emoji" ? block.icon : "💡"}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={baseText}><RichText segments={block.richText} dark={dark} /></span>
                  {block.children.length > 0 && (
                    <BlockRenderer blocks={block.children} dark={dark} depth={depth}
                      toggleStates={toggleStates} setToggleStates={setToggleStates} />
                  )}
                </div>
              </div>
            );
          }

          // ── 토글 ──────────────────────────────────────────────────────────
          case "toggle": {
            const isOpen = !!toggleStates[block.id];
            return (
              <div key={key} style={{ ...indent, margin: "4px 0" }}>
                <div
                  style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer",
                    padding: "3px 0", userSelect: "none" }}
                  onClick={() => setToggleStates(prev => ({ ...prev, [block.id]: !isOpen }))}>
                  <span style={{ fontSize: 12, color: dark ? "#94a3b8" : "#6b7280",
                    marginTop: 4, flexShrink: 0, transition: "transform 0.15s",
                    display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                    ▶
                  </span>
                  <span style={{ ...baseText, fontWeight: 500 }}>
                    <RichText segments={block.richText} dark={dark} />
                  </span>
                </div>
                {isOpen && block.children.length > 0 && (
                  <div style={{ marginLeft: 20, marginTop: 4,
                    borderLeft: `2px solid ${dark ? "#334155" : "#e5e7eb"}`,
                    paddingLeft: 12 }}>
                    <BlockRenderer blocks={block.children} dark={dark} depth={depth + 1}
                      toggleStates={toggleStates} setToggleStates={setToggleStates} />
                  </div>
                )}
              </div>
            );
          }

          // ── 테이블 ────────────────────────────────────────────────────────
          case "table": {
            const rows = block.children.filter(c => c.type === "table_row");
            if (rows.length === 0) return null;
            return (
              <div key={key} style={{ ...indent, margin: "14px 0", overflowX: "auto" }}>
                <table style={{
                  borderCollapse: "collapse", width: "100%", fontSize: 13,
                  border: `1px solid ${dark ? "#334155" : "#d1d5db"}`, borderRadius: 6, overflow: "hidden",
                }}>
                  <tbody>
                    {rows.map((row, ri) => {
                      const isHeader = block.hasColumnHeader && ri === 0;
                      const isRowHeader = block.hasRowHeader;
                      return (
                        <tr key={ri} style={{ background: isHeader ? (dark ? "#1e3a6e" : "#1a3a8f") : undefined }}>
                          {row.cells.map((cell, ci) => {
                            const Tag = (isHeader || (isRowHeader && ci === 0)) ? "th" : "td";
                            return (
                              <Tag key={ci} style={{
                                padding: "8px 12px",
                                border: `1px solid ${dark ? "#334155" : "#d1d5db"}`,
                                color: isHeader ? "#fff" : (dark ? "#d1d5db" : "#374151"),
                                background: !isHeader && ri % 2 === 1
                                  ? (dark ? "rgba(30,58,110,0.12)" : "rgba(219,234,254,0.2)") : undefined,
                                fontWeight: isHeader || (isRowHeader && ci === 0) ? 700 : 400,
                                textAlign: "left", verticalAlign: "top",
                              }}>
                                <RichText segments={cell} dark={dark} />
                              </Tag>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }

          // ── 컬럼 레이아웃 ─────────────────────────────────────────────────
          case "column_list":
            return (
              <div key={key} style={{ ...indent, display: "flex", gap: 16, margin: "10px 0",
                flexWrap: "wrap" }}>
                {block.children.map((col, ci) => (
                  <div key={ci} style={{ flex: 1, minWidth: 180 }}>
                    <BlockRenderer blocks={col.children} dark={dark} depth={depth}
                      toggleStates={toggleStates} setToggleStates={setToggleStates} />
                  </div>
                ))}
              </div>
            );

          // ── 북마크 ────────────────────────────────────────────────────────
          case "bookmark":
          case "link_preview":
            return block.url ? (
              <div key={key} style={{ ...indent, margin: "10px 0" }}>
                <a href={block.url} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: dark ? "#1e293b" : "#f1f5f9",
                    border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`,
                    color: dark ? "#93c5fd" : "#1d4ed8", textDecoration: "none",
                    maxWidth: "100%", wordBreak: "break-all" }}>
                  🔗 {block.url}
                </a>
              </div>
            ) : null;

          // ── 수식 ──────────────────────────────────────────────────────────
          case "equation":
            return (
              <div key={key} style={{ ...indent, margin: "8px 0", padding: "8px 14px",
                background: dark ? "#0f172a" : "#f8fafc",
                border: `1px solid ${dark ? "#334155" : "#e2e8f0"}`, borderRadius: 6,
                fontFamily: "monospace", fontSize: 14, color: dark ? "#e2e8f0" : "#1f2937" }}>
                {block.expression}
              </div>
            );

          // ── 기타 (child_page, unsupported 등) ────────────────────────────
          default:
            if (block.plainText) {
              return (
                <p key={key} style={{ ...baseText, ...indent, margin: "4px 0 6px" }}>
                  <RichText segments={block.richText} dark={dark} />
                </p>
              );
            }
            return null;
        }
      })}
    </>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────
export default function GuidePage() {
  const router = useRouter();
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tableVisible, setTableVisible] = useState(false);

  const [contentPopup, setContentPopup] = useState(null);
  const [toggleStates, setToggleStates] = useState({});
  const [filePopup, setFilePopup] = useState(null);
  const [downloading, setDownloading] = useState({});
  const [notionPopup, setNotionPopup] = useState(null);

  const tableOuterRef = useRef(null);
  const filePopupRef  = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => { fetchForms(); }, []);

  const fetchForms = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      setResults(data.results);
      setTimeout(() => setTableVisible(true), 50);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // 파일 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!filePopup) return;
    const handle = (e) => {
      if (filePopupRef.current?.contains(e.target)) return;
      if (e.target.closest(".fp-trigger")) return;
      setFilePopup(null);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [filePopup]);

  // 콘텐츠 팝업 열기
  const openContent = async (row) => {
    setContentPopup({ title: row.title, blocks: null, loading: true });
    setToggleStates({});
    try {
      const res  = await fetch(`/api/blocks?pageId=${row.pageId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "콘텐츠 로드 실패");
      setContentPopup({ title: row.title, blocks: data.blocks, loading: false });
    } catch (err) {
      setContentPopup({ title: row.title, blocks: [], loading: false, error: err.message });
    }
  };

  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation(); e.preventDefault();
    setDownloading(p => ({ ...p, [key]: true }));
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = {
          pdf: "application/pdf", hwpx: "application/octet-stream", hwp: "application/octet-stream",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        };
        const fh = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "파일", accept: { [mimeMap[ext] || "application/octet-stream"]: [`.${ext}`] } }],
        });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const bUrl = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = bUrl; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(bUrl);
      }
    } catch (err) { if (err.name !== "AbortError") alert("다운로드 실패: " + err.message); }
    finally { setDownloading(p => ({ ...p, [key]: false })); setFilePopup(null); }
  };

  const openInNotion = () => {
    if (!notionPopup?.url) return;
    window.location.href = notionPopup.url.replace("https://www.notion.so/", "notion://www.notion.so/");
    setNotionPopup(null);
  };
  const openInBrowser = () => {
    if (!notionPopup?.url) return;
    window.open(notionPopup.url, "_blank");
    setNotionPopup(null);
  };

  return (
    <>
      <Head>
        <title>문서 작성 방법 및 양식 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* ── 파일 팝업 ──────────────────────────────────────────────────── */}
      {filePopup && (
        <div ref={filePopupRef}
          style={{ position: "fixed", left: filePopup.pos.x + 14, top: filePopup.pos.y - 10,
            zIndex: 600, background: dark ? "#1e293b" : "#fff",
            border: `1.5px solid ${dark ? "#334155" : "#e5e9f5"}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(19,39,79,0.18)",
            padding: 6, minWidth: 140, display: "flex", flexDirection: "column", gap: 4 }}
          onMouseDown={e => e.stopPropagation()}>
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
            onClick={e => handleDownload(e, filePopup.file.url, filePopup.file.name, filePopup.key)}
            disabled={downloading[filePopup.key]}>
            {downloading[filePopup.key] ? "⏳ 준비 중..." : "⬇ 다운로드"}
          </button>
        </div>
      )}

      {/* ── 콘텐츠 팝업 ────────────────────────────────────────────────── */}
      {contentPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 900, padding: "16px" }}
          onClick={() => setContentPopup(null)}>
          <div
            style={{ background: dark ? "#1e293b" : "#fff", borderRadius: 16,
              width: "min(1100px, calc(100vw - 32px))",
              maxHeight: "min(88vh, 860px)",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.3)", position: "relative", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>

            {/* 헤더 */}
            <div style={{ padding: "20px 28px 16px",
              borderBottom: `1px solid ${dark ? "#334155" : "#e5e7eb"}`,
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: dark ? "#e2e8f0" : "#13274F",
                  margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {contentPopup.title}
                </h2>
              </div>
              <button onClick={() => setContentPopup(null)}
                style={{ flexShrink: 0, background: dark ? "#334155" : "#f1f5f9",
                  border: "none", borderRadius: "50%", width: 32, height: 32,
                  fontSize: 16, cursor: "pointer", color: dark ? "#94a3b8" : "#6b7280",
                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
              {contentPopup.loading ? (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div style={{ width: 36, height: 36, border: "3px solid #d0d9f0",
                    borderTop: "3px solid #1a3a8f", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
                  <p style={{ color: "#6b7280", fontSize: 14 }}>본문 불러오는 중...</p>
                </div>
              ) : contentPopup.error ? (
                <p style={{ color: "#dc2626", fontSize: 13, padding: "20px 0" }}>⚠️ {contentPopup.error}</p>
              ) : !contentPopup.blocks || contentPopup.blocks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: dark ? "#94a3b8" : "#9ca3af" }}>
                  <p style={{ fontSize: 36, marginBottom: 10 }}>📭</p>
                  <p style={{ fontSize: 14 }}>본문 내용이 없습니다.</p>
                </div>
              ) : (
                <BlockRenderer
                  blocks={contentPopup.blocks}
                  dark={dark}
                  depth={0}
                  toggleStates={toggleStates}
                  setToggleStates={setToggleStates}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Notion 링크 팝업 ───────────────────────────────────────────── */}
      {notionPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setNotionPopup(null)}>
          <div style={{ background: dark ? "#1e293b" : "#fff", borderRadius: 20,
            padding: "32px 36px", maxWidth: 360, width: "90%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center",
            color: dark ? "#e2e8f0" : "#1f2937" }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>📄</p>
            <p style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>노션에서 보시겠습니까?</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={openInNotion}
                style={{ background: "#1a3a8f", color: "#fff", border: "none", borderRadius: 12,
                  padding: 13, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                예 — Notion 앱으로 열기
              </button>
              <button onClick={openInBrowser}
                style={{ background: dark ? "#1e3a6e" : "#eef1fb", color: dark ? "#93c5fd" : "#1a3a8f",
                  border: "none", borderRadius: 12, padding: 13, fontSize: 14,
                  fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                브라우저로 열기
              </button>
              <button onClick={() => setNotionPopup(null)}
                style={{ background: dark ? "#334155" : "#f3f4f6", color: dark ? "#94a3b8" : "#6b7280",
                  border: "none", borderRadius: 12, padding: 13, fontSize: 14,
                  fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                아니오
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메인 페이지 ────────────────────────────────────────────────── */}
      <div className={`page${dark ? " dark" : ""}`}>

        <button className="theme-toggle" onClick={() => setDark(!dark)} title={dark ? "라이트 모드" : "다크 모드"}>
          {dark ? "☀️" : "🌙"}
        </button>
        <button className="back-btn" onClick={() => router.push("/")} title="홈으로">←</button>

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

        <div className="page-title-wrap">
          <h2 className="page-title">📋 문서 작성 방법 및 양식</h2>
          <p className="page-subtitle">카테고리 <span className="cat-badge">문서 양식</span>으로 분류된 문서 목록입니다</p>
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
                <p className="no-sub">카테고리가 &lsquo;문서 양식&rsquo;인 항목이 없습니다</p>
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

                          <td className="td-title">
                            <div className="cell-inner">
                              <span className="doc-icon">📄</span>
                              <span className="doc-title" onClick={() => setNotionPopup({ url: row.url })}>
                                {row.title}
                              </span>
                            </div>
                          </td>

                          <td className="td-center">
                            <button className="view-btn" onClick={() => openContent(row)}>열람하기</button>
                          </td>

                          <td className="td-center">
                            {row.docWorkStatusItem
                              ? <span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color, dark)}>{row.docWorkStatusItem.name}</span>
                              : <span className="dash">—</span>}
                          </td>

                          <td className="td-files">
                            {row.fileLinks && row.fileLinks.length > 0 ? (
                              <div className="file-links">
                                {row.fileLinks.map((file, j) => {
                                  const pk = `${i}-${j}`;
                                  return (
                                    <span key={j}
                                      className={`file-link fp-trigger${filePopup?.key === pk ? " active" : ""}`}
                                      onMouseDown={e => {
                                        e.stopPropagation();
                                        if (filePopup?.key === pk) setFilePopup(null);
                                        else setFilePopup({ key: pk, file, pos: { x: e.clientX, y: e.clientY } });
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
        @keyframes slideUpFade { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease, transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box;
          animation:slideUpFade .7s ease both; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }

        .theme-toggle { position:absolute; top:20px; right:20px; background:none;
          border:2px solid #d0d9f0; border-radius:50%; width:40px; height:40px; font-size:18px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
        .dark .theme-toggle { border-color:#475569; }

        .back-btn { position:absolute; top:20px; left:20px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s;
          font-weight:700; color:#1a3a8f; font-family:inherit; }
        .dark .back-btn { border-color:#475569; color:#93c5fd; }
        .back-btn:hover { border-color:#1a3a8f; }
        .dark .back-btn:hover { border-color:#93c5fd; }

        .logo-area { margin-top:8vh; margin-bottom:8px; text-align:center; }
        .logo-wrap { display:inline-block; text-align:center; }
        .logo-top-rule { width:380px; height:1px; background:#13274F; margin:0 auto 12px; }
        .logo-main { font-family:'EB Garamond',serif; font-size:38px; font-weight:700; color:#13274F;
          letter-spacing:-0.5px; line-height:1.1; margin:0; }
        .dark .logo-main { color:#e2e8f0; }
        .logo-sub-en { font-size:11px; color:#13274F; letter-spacing:6px; margin:6px 0 10px; text-transform:uppercase; }
        .dark .logo-sub-en { color:#94a3b8; }
        .logo-mid-rule { width:220px; height:1px; background:#13274F; margin:0 auto 10px; }
        .dark .logo-mid-rule { background:#475569; }
        .logo-sub-kr { font-family:'Noto Serif KR',serif; font-size:18px; font-weight:700; color:#13274F;
          letter-spacing:2px; margin:0 0 10px; }
        .dark .logo-sub-kr { color:#e2e8f0; }
        .logo-bot-rule { width:380px; height:1px; background:#13274F; margin:0 auto; }
        .dark .logo-top-rule,.dark .logo-bot-rule { background:#475569; }

        .page-title-wrap { text-align:center; margin:20px 0 28px; }
        .page-title { font-size:22px; font-weight:800; color:#13274F; margin-bottom:8px; }
        .dark .page-title { color:#e2e8f0; }
        .page-subtitle { font-size:13px; color:#6b7280; }
        .cat-badge { background:#dcfce7; color:#166534; padding:2px 8px; border-radius:5px; font-weight:700; font-size:12px; }
        .dark .cat-badge { background:#14532d; color:#86efac; }

        .results { width:100%; max-width:1100px; padding-bottom:60px; }
        .loading { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f;
          border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon { font-size:48px; }
        .no-text { font-size:18px; font-weight:600; margin-top:12px; }
        .no-sub { color:#9ca3af; font-size:14px; margin-top:6px; }
        .count { color:#6b7280; font-size:13px; margin-bottom:12px; }

        .table-outer { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(26,58,143,0.08);
          overflow-x:auto; border:1px solid #e5e9f5; }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }

        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700;
          font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15); }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }
        th:first-child { position:sticky; left:0; z-index:3; background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.3); }
        .dark th:first-child { background:#1e3a6e; }

        .result-row { transition:background .12s; }
        .result-row:hover td { background:#f0f4ff; }
        .dark .result-row:hover td { background:#1e3a5f; }

        td { padding:10px 16px; border-bottom:1.5px solid #dde3f5; border-right:1px solid #edf0fb;
          white-space:nowrap; text-align:center; vertical-align:middle; background:inherit; }
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

        .td-title { vertical-align:middle; text-align:left; min-width:200px; }
        .td-center { vertical-align:middle; text-align:center; }
        .td-files { vertical-align:middle; text-align:left; min-width:180px; }

        .cell-inner { display:flex; align-items:center; gap:6px; }
        .doc-icon { font-size:14px; flex-shrink:0; }
        .doc-title { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:0.75; }

        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .dash { color:#d1d5db; }

        .view-btn { background:#1a3a8f; color:#fff; border:none; border-radius:8px; padding:6px 16px;
          font-size:12px; font-weight:700; cursor:pointer; font-family:inherit;
          transition:background .15s; white-space:nowrap; }
        .view-btn:hover { background:#0d1e3d; }
        .dark .view-btn { background:#1e3a6e; }
        .dark .view-btn:hover { background:#2a4a8e; }

        .file-links { display:flex; flex-direction:column; gap:4px; }
        .file-link { font-size:12px; color:#1a3a8f; padding:3px 8px; background:#eef1fb;
          border-radius:5px; white-space:nowrap; display:inline-block;
          cursor:pointer; user-select:none; transition:background .15s; }
        .file-link:hover,.file-link.active { background:#d0d9f0; }
        .dark .file-link { background:#1e3a6e; color:#93c5fd; }
        .dark .file-link:hover,.dark .file-link.active { background:#2a4a8e; }

        .notion-db-wrap { text-align:center; margin-top:24px; padding-bottom:20px; }
        .notion-db-btn { background:#fff; color:#1e3a8a; border:2px solid #c7d2fe; border-radius:28px;
          padding:12px 28px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;
          box-shadow:0 2px 10px rgba(99,102,241,0.12); transition:all .2s; }
        .notion-db-btn:hover { background:#eef2ff; border-color:#4f46e5; }
        .dark .notion-db-btn { background:#1e293b; color:#818cf8; border-color:#334155; }

        @media (max-width:480px) {
          .logo-main { font-size:28px; }
          .logo-top-rule,.logo-bot-rule { width:260px; }
          .logo-sub-kr { font-size:14px; }
          .back-btn { top:12px; left:12px; width:34px; height:34px; font-size:15px; }
          .theme-toggle { top:12px; right:12px; width:34px; height:34px; font-size:15px; }
        }
      `}</style>
    </>
  );
}
