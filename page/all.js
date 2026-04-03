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

const NOTION_COLOR = {
  default: { bg:"#e5e7eb",text:"#374151",darkBg:"#374151",darkText:"#d1d5db" },
  gray:    { bg:"#f3f4f6",text:"#4b5563",darkBg:"#374151",darkText:"#d1d5db" },
  brown:   { bg:"#f5e6d8",text:"#7c3f1e",darkBg:"#3b1506",darkText:"#e2b48a" },
  orange:  { bg:"#ffedd5",text:"#9a3412",darkBg:"#431407",darkText:"#fdba74" },
  yellow:  { bg:"#fef9c3",text:"#854d0e",darkBg:"#422006",darkText:"#fde68a" },
  green:   { bg:"#dcfce7",text:"#166534",darkBg:"#14532d",darkText:"#86efac" },
  blue:    { bg:"#dbeafe",text:"#1e40af",darkBg:"#1e3a6e",darkText:"#93c5fd" },
  purple:  { bg:"#ede9fe",text:"#5b21b6",darkBg:"#3b0764",darkText:"#c4b5fd" },
  pink:    { bg:"#fce7f3",text:"#9d174d",darkBg:"#500724",darkText:"#f9a8d4" },
  red:     { bg:"#fee2e2",text:"#991b1b",darkBg:"#450a0a",darkText:"#fca5a5" },
};

function notionBadgeStyle(color, dark) {
  const c = NOTION_COLOR[color] || NOTION_COLOR.default;
  return dark ? { background: c.darkBg, color: c.darkText } : { background: c.bg, color: c.text };
}

export default function AllPage() {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const [tableVisible, setTableVisible] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [filePopup, setFilePopup] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState({});
  const [copied, setCopied] = useState({});
  const [notionPopup, setNotionPopup] = useState(null);

  const tableOuterRef = useRef(null);
  const filePopupRef = useRef(null);
  const bottomRef = useRef(null);

  const toggleRow = (idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));

  // 초기 로드
  useEffect(() => {
    fetchPage(null, true);
    fetchTotalCount();
  }, []);

  const fetchPage = async (cursor, isInitial = false) => {
    if (isInitial) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch("/api/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor, mode: "page" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      if (isInitial) {
        setResults(data.results);
        setTimeout(() => setTableVisible(true), 50);
      } else {
        setResults(prev => [...prev, ...data.results]);
      }
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) { setError(err.message); }
    finally { if (isInitial) setLoading(false); else setLoadingMore(false); }
  };

  const fetchAllRemaining = async () => {
    if (!nextCursor) return;
    setLoadingAll(true);
    try {
      const res = await fetch("/api/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor: nextCursor, mode: "all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "로드 실패");
      setResults(prev => [...prev, ...data.results]);
      setHasMore(false);
      setNextCursor(null);
    } catch (err) { setError(err.message); }
    finally { setLoadingAll(false); }
  };

  const fetchTotalCount = async () => {
    try {
      const res = await fetch("/api/count");
      const data = await res.json();
      if (res.ok) setTotalCount(data.count);
    } catch (e) {}
  };

  // 파일 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!filePopup) return;
    const handle = (e) => {
      if (filePopupRef.current?.contains(e.target)) return;
      if (e.target.closest(".file-link-wrap")) return;
      setFilePopup(null);
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("touchstart", handle); };
  }, [filePopup]);

  const handleTitleClick = (e, url) => {
    e.stopPropagation();
    setFilePopup(null);
    setNotionPopup({ url });
  };

  const handleCopy = (e, value, key) => {
    e.stopPropagation();
    if (!value || value === "—") return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500);
    });
  };

  const isMultiLine = (text) => text && text.includes("\n");

  const handleDownload = async (e, url, fileName, key) => {
    e.stopPropagation(); e.preventDefault();
    setDownloading(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      if (window.showSaveFilePicker) {
        const ext = fileName.split(".").pop().toLowerCase();
        const mimeMap = { pdf:"application/pdf",hwpx:"application/octet-stream",hwp:"application/octet-stream",
          pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
          docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",htl:"application/octet-stream" };
        const fh = await window.showSaveFilePicker({ suggestedName: fileName,
          types:[{ description:"파일", accept:{ [mimeMap[ext]||"application/octet-stream"]:[`.${ext}`] } }] });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        const bUrl = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=bUrl; a.download=fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(bUrl);
      }
    } catch (err) { if (err.name !== "AbortError") alert("다운로드 실패: "+err.message); }
    finally { setDownloading(p => ({ ...p, [key]: false })); setFilePopup(null); }
  };

  const remainingCount = totalCount !== null ? Math.max(0, totalCount - results.length) : null;

  return (
    <>
      <Head>
        <title>문서 전체 보기 — G&A IP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      {/* 파일 팝업 */}
      {filePopup && results && (() => {
        const [ri, ci] = filePopup.split("-").map(Number);
        const row = results[ri];
        if (!row?.fileLinks) return null;
        const links = row.fileLinks.split("\n").filter(Boolean);
        const link = links[ci];
        if (!link) return null;
        const fileName = decodeURIComponent(link.split("/").pop());
        const dlKey = `dl-${filePopup}`;
        return (
          <div ref={filePopupRef}
            style={{ position:"fixed", left:popupPos.x+14, top:popupPos.y-10, zIndex:500,
              background:dark?"#1e293b":"#fff", border:`1.5px solid ${dark?"#334155":"#e5e9f5"}`,
              borderRadius:10, boxShadow:"0 8px 24px rgba(19,39,79,0.18)", padding:6,
              minWidth:140, display:"flex", flexDirection:"column", gap:4 }}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            <a href={link} target="_blank" rel="noreferrer"
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textDecoration:"none",
                textAlign:"center", background:dark?"#1e3a6e":"#eef1fb", color:dark?"#93c5fd":"#1a3a8f", display:"block" }}
              onClick={()=>setFilePopup(null)}>🔍 미리보기</a>
            <button
              style={{ fontSize:12, fontWeight:700, padding:"8px 14px", borderRadius:7, textAlign:"center",
                background:downloading[dlKey]?(dark?"#1e293b":"#f3f4f6"):(dark?"#14532d":"#f0fdf4"),
                color:downloading[dlKey]?"#9ca3af":(dark?"#86efac":"#166534"),
                border:"none", cursor:downloading[dlKey]?"not-allowed":"pointer", fontFamily:"inherit" }}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
              onClick={e=>handleDownload(e,link,fileName,dlKey)} disabled={downloading[dlKey]}>
              {downloading[dlKey]?"⏳ 준비 중...":"⬇ 다운로드"}
            </button>
          </div>
        );
      })()}

      {/* Notion 팝업 */}
      {notionPopup && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:999 }} onClick={()=>setNotionPopup(null)}>
          <div style={{ background:dark?"#1e293b":"#fff",borderRadius:20,padding:"32px 36px",
            maxWidth:360,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.25)",textAlign:"center",
            color:dark?"#e2e8f0":"#1f2937" }} onClick={e=>e.stopPropagation()}>
            <p style={{fontSize:40,marginBottom:12}}>📄</p>
            <p style={{fontSize:18,fontWeight:800,marginBottom:6}}>노션에서 보시겠습니까?</p>
            <p style={{fontSize:13,color:"#6b7280",marginBottom:24}}>Notion 앱 또는 브라우저로 열 수 있습니다.</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button style={{background:"#1a3a8f",color:"#fff",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{ window.location.href=notionPopup.url.replace("https://www.notion.so/","notion://www.notion.so/"); setNotionPopup(null); }}>
                예 — Notion 앱으로 열기
              </button>
              <button style={{background:dark?"#1e3a6e":"#eef1fb",color:dark?"#93c5fd":"#1a3a8f",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{ window.open(notionPopup.url,"_blank"); setNotionPopup(null); }}>
                브라우저로 열기
              </button>
              <button style={{background:dark?"#334155":"#f3f4f6",color:dark?"#94a3b8":"#6b7280",border:"none",borderRadius:12,padding:13,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>setNotionPopup(null)}>아니오</button>
            </div>
          </div>
        </div>
      )}

      <div className={`page${dark?" dark":""}`}>

        <button className="theme-toggle" onClick={()=>setDark(!dark)} title={dark?"라이트 모드":"다크 모드"}>
          {dark?"☀️":"🌙"}
        </button>
        <button className="back-btn" onClick={()=>router.push("/")} title="홈으로">←</button>

        <div className="logo-area" onClick={()=>router.push("/")} style={{cursor:"pointer"}}>
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
          <h2 className="page-title">📂 문서 전체 보기</h2>
          <p className="page-subtitle">생성 순서 기준 · 전체 DB 조회
            {totalCount !== null && <span className="total-badge"> 총 {totalCount}건</span>}
          </p>
        </div>

        <div className="results">
          {loading && (
            <div className="loading"><div className="spinner"/><p>Notion DB 불러오는 중...</p></div>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          {!loading && results.length === 0 && !error && (
            <div className="no-result">
              <p className="no-icon">📭</p><p className="no-text">문서가 없습니다</p>
            </div>
          )}
          {results.length > 0 && (
            <div className={`fade-wrap${tableVisible?" visible":""}`}>
              <p className="count">📄 {results.length}건 표시 중{hasMore ? ` (전체 ${totalCount??'…'}건)` : ` / 전체 ${results.length}건`}</p>
              <div className="table-outer" ref={tableOuterRef}>
                <table>
                  <thead>
                    <tr>
                      <th>문서 제목</th>
                      <th>유형</th>
                      <th>상태</th>
                      <th>서류작업상태</th>
                      <th>파일</th>
                      <th>출원번호</th>
                      <th>출원인(특허고객번호)</th>
                      <th>대리인 코드</th>
                      <th>마감일</th>
                      <th>카테고리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={i} className={`result-row ${i%2===0?"row-even":"row-odd"}`}>

                        <td className="td-nowrap">
                          <div className="cell-inner">
                            <span className="doc-icon">📄</span>
                            <span className="doc-title" onClick={e=>handleTitleClick(e,row.url)}>
                              {renderSingleLine(row.title)}
                            </span>
                          </div>
                        </td>

                        <td className="td-nowrap">
                          {row.typeItems?.length>0 ? (
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                              {row.typeItems.map((t,k)=>(
                                <span key={k} className="badge" style={notionBadgeStyle(t.color,dark)}>{t.name}</span>
                              ))}
                            </div>
                          ) : <span className="dash">—</span>}
                        </td>

                        <td className="td-nowrap">
                          {row.statusItem
                            ? <span className="badge" style={notionBadgeStyle(row.statusItem.color,dark)}>{row.statusItem.name}</span>
                            : <span className="dash">—</span>}
                        </td>

                        <td className="td-nowrap">
                          {row.docWorkStatusItem
                            ? <span className="badge" style={notionBadgeStyle(row.docWorkStatusItem.color,dark)}>{row.docWorkStatusItem.name}</span>
                            : <span className="dash">—</span>}
                        </td>

                        <td className="td-files">
                          {row.fileLinks ? (() => {
                            const files = row.fileLinks.split("\n").filter(Boolean);
                            const isExpanded = !!expandedRows[i];
                            const LIMIT = 1;
                            const show = isExpanded ? files : files.slice(0,LIMIT);
                            const hasMoreFiles = files.length > LIMIT;
                            return (
                              <div className="file-expand-wrap">
                                <div className="file-links">
                                  {show.map((link,j)=>{
                                    const fileName = decodeURIComponent(link.split("/").pop());
                                    const pk = `${i}-${j}`;
                                    const isOpen = filePopup===pk;
                                    return (
                                      <div key={j} className="file-link-wrap">
                                        <span className={`file-link${isOpen?" active":""}`}
                                          onMouseDown={e=>{
                                            e.stopPropagation();
                                            if(isOpen){setFilePopup(null);}
                                            else{setPopupPos({x:e.clientX,y:e.clientY});setFilePopup(pk);}
                                          }}>
                                          📄 {fileName} ▾
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {hasMoreFiles && (
                                  <button className={`expand-btn${isExpanded?" expanded":""}`}
                                    onClick={e=>{e.stopPropagation();toggleRow(i);}}>
                                    {isExpanded?"↑ 접기":`+${files.length-LIMIT} 더보기`}
                                  </button>
                                )}
                              </div>
                            );
                          })() : <span className="dash">—</span>}
                        </td>

                        <td className={isMultiLine(row.appNum)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.appNum)}
                            {row.appNum && (
                              <button className={`copy-btn${copied[`${i}-a`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.appNum,`${i}-a`)}>
                                {copied[`${i}-a`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className={isMultiLine(row.appOwner)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.appOwner)}
                            {row.appOwner && (
                              <button className={`copy-btn${copied[`${i}-o`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.appOwner,`${i}-o`)}>
                                {copied[`${i}-o`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className={isMultiLine(row.agentCode)?"td-top":"td-nowrap"}>
                          <div className="copy-wrap">
                            {renderWithIndent(row.agentCode)}
                            {row.agentCode && (
                              <button className={`copy-btn${copied[`${i}-c`]?" copied":""}`}
                                onClick={e=>handleCopy(e,row.agentCode,`${i}-c`)}>
                                {copied[`${i}-c`]?"✓":"복사"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="td-nowrap">
                          <span className="cell-text">{row.deadline||"—"}</span>
                        </td>

                        <td className="td-nowrap">
                          {row.categoryItems?.length>0 ? (
                            <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center"}}>
                              {row.categoryItems.map((c,k)=>(
                                <span key={k} className="badge" style={notionBadgeStyle(c.color,dark)}>{c.name}</span>
                              ))}
                            </div>
                          ) : <span className="dash">—</span>}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 더보기 버튼 영역 */}
              {hasMore && (
                <div className="load-more-area" ref={bottomRef}>
                  <div className="load-more-info">
                    <span className="lm-loaded">{results.length}건 표시 중</span>
                    {remainingCount !== null && (
                      <span className="lm-remaining">/ 남은 문서 {remainingCount}건</span>
                    )}
                  </div>
                  <div className="load-more-btns">
                    <button className="lm-btn lm-btn-page" onClick={()=>fetchPage(nextCursor)} disabled={loadingMore||loadingAll}>
                      {loadingMore
                        ? <><span className="lm-spin"/>불러오는 중...</>
                        : <>⬇ 25개 더 불러오기</>}
                    </button>
                    <button className="lm-btn lm-btn-all" onClick={fetchAllRemaining} disabled={loadingMore||loadingAll}>
                      {loadingAll
                        ? <><span className="lm-spin"/>전체 불러오는 중...</>
                        : <>⬇ 남은 {remainingCount!==null?`${remainingCount}개 `:""}전체 보기</>}
                    </button>
                  </div>
                </div>
              )}

              {!hasMore && results.length > 0 && (
                <p className="all-loaded">✅ 전체 {results.length}건 모두 표시되었습니다</p>
              )}

              <div className="notion-db-wrap">
                <button className="notion-db-btn"
                  onClick={()=>window.open("https://www.notion.so/328c05f9ee4c80e8bd4dec05e76bf10a","_blank")}>
                  📋 G&A IP 문서 DB 전체 보기 (Notion)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Noto Sans KR','Malgun Gothic',sans-serif; min-height:100vh; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes slideUpFade { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fade-wrap { opacity:0; transform:translateY(8px); transition:opacity .3s ease,transform .3s ease; }
        .fade-wrap.visible { opacity:1; transform:translateY(0); }
      `}</style>

      <style jsx>{`
        .page { min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:0 16px;
          background:linear-gradient(180deg,#ffffff 0%,#f4f6fc 100%); color:#1f2937;
          transition:background .3s,color .3s; position:relative; box-sizing:border-box;
          animation:slideUpFade .7s ease both; }
        .page.dark { background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%); color:#e2e8f0; }

        .theme-toggle { position:absolute; top:20px; right:20px; background:none; border:2px solid #d0d9f0;
          border-radius:50%; width:40px; height:40px; font-size:18px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; transition:border-color .2s; }
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
        .logo-main { font-family:'EB Garamond',serif; font-size:38px; font-weight:700; color:#13274F; letter-spacing:-0.5px; line-height:1.1; margin:0; }
        .dark .logo-main { color:#e2e8f0; }
        .logo-sub-en { font-size:11px; color:#13274F; letter-spacing:6px; margin:6px 0 10px; text-transform:uppercase; }
        .dark .logo-sub-en { color:#94a3b8; }
        .logo-mid-rule { width:220px; height:1px; background:#13274F; margin:0 auto 10px; }
        .dark .logo-mid-rule { background:#475569; }
        .logo-sub-kr { font-family:'Noto Serif KR',serif; font-size:18px; font-weight:700; color:#13274F; letter-spacing:2px; margin:0 0 10px; }
        .dark .logo-sub-kr { color:#e2e8f0; }
        .logo-bot-rule { width:380px; height:1px; background:#13274F; margin:0 auto; }
        .dark .logo-top-rule,.dark .logo-bot-rule { background:#475569; }

        .page-title-wrap { text-align:center; margin:20px 0 28px; }
        .page-title { font-size:22px; font-weight:800; color:#13274F; margin-bottom:8px; }
        .dark .page-title { color:#e2e8f0; }
        .page-subtitle { font-size:13px; color:#6b7280; }
        .total-badge { background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:5px; font-weight:700; font-size:12px; margin-left:6px; }
        .dark .total-badge { background:#1e3a6e; color:#93c5fd; }

        .results { width:100%; max-width:1200px; padding-bottom:60px; }
        .loading { display:flex; flex-direction:column; align-items:center; margin-top:60px; gap:16px; }
        .spinner { width:36px; height:36px; border:3px solid #d0d9f0; border-top:3px solid #1a3a8f; border-radius:50%; animation:spin .8s linear infinite; }
        .loading p { color:#6b7280; font-size:15px; }
        .error { color:#dc2626; text-align:center; margin-top:40px; }
        .no-result { text-align:center; margin-top:60px; }
        .no-icon { font-size:48px; } .no-text { font-size:18px; font-weight:600; margin-top:12px; }
        .count { color:#6b7280; font-size:13px; margin-bottom:12px; }

        .table-outer { background:#fff; border-radius:16px; box-shadow:0 2px 16px rgba(26,58,143,0.08);
          overflow-x:auto; border:1px solid #e5e9f5; }
        .dark .table-outer { background:#1e293b; border-color:#334155; }
        table { border-collapse:separate; border-spacing:0; font-size:13px; width:max-content; min-width:100%; }

        th { background:#1a3a8f; color:#fff; padding:11px 16px; text-align:center; font-weight:700;
          font-size:12px; white-space:nowrap; border-right:1px solid rgba(255,255,255,0.15);
          position:sticky; top:0; z-index:3; }
        th:last-child { border-right:none; }
        .dark th { background:#1e3a6e; }
        th:first-child { position:sticky; left:0; top:0; z-index:5; background:#1a3a8f; border-right:2px solid rgba(255,255,255,0.3); }
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
        .row-odd:hover td:first-child,.row-even:hover td:first-child { background:#f0f4ff; }
        .dark .row-odd:hover td:first-child,.dark .row-even:hover td:first-child { background:#1e3a5f; }

        .td-nowrap { vertical-align:middle; text-align:center; }
        .td-top { vertical-align:top; padding-top:10px; text-align:left; }
        .td-files { vertical-align:middle; text-align:left; min-width:200px; }
        .cell-inner { display:flex; align-items:center; justify-content:center; gap:6px; }
        .doc-icon { font-size:14px; flex-shrink:0; }
        .doc-title { color:#1a3a8f; font-weight:600; font-size:13px; cursor:pointer; text-decoration:underline; }
        .dark .doc-title { color:#93c5fd; }
        .doc-title:hover { opacity:0.75; }

        .badge { border-radius:5px; padding:2px 7px; font-size:11px; font-weight:700; display:inline-block; }
        .dash { color:#d1d5db; }

        .file-expand-wrap { display:flex; width:100%; align-items:flex-start; justify-content:space-between; gap:8px; }
        .expand-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:2px 6px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit;
          transition:background .15s; white-space:nowrap; }
        .expand-btn:hover { background:#d0d9f0; }
        .expand-btn.expanded { background:#e0f2fe; color:#0369a1; }
        .dark .expand-btn { background:#1e3a6e; color:#93c5fd; }

        .copy-wrap { display:inline-flex; align-items:flex-start; gap:6px; }
        .cell-text { font-size:12px; color:#6b7280; white-space:nowrap; }
        .dark .cell-text { color:#94a3b8; }
        .indent-block { display:flex; flex-direction:column; gap:3px; text-align:left; }
        .first-line,.indent-line { font-size:12px; color:#6b7280; white-space:nowrap; }
        .indent-line { padding-left:16px; }
        .dark .first-line,.dark .indent-line { color:#94a3b8; }
        .copy-btn { flex-shrink:0; background:#eef1fb; color:#1a3a8f; border:none; border-radius:4px;
          padding:2px 7px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; transition:background .15s; }
        .copy-btn:hover { background:#d0d9f0; }
        .copy-btn.copied { background:#dcfce7; color:#166634; }
        .dark .copy-btn { background:#1e3a6e; color:#93c5fd; }
        .dark .copy-btn.copied { background:#14532d; color:#86efac; }

        .file-links { display:flex; flex-direction:column; gap:4px; }
        .file-link-wrap { position:relative; display:inline-block; }
        .file-link { font-size:12px; color:#1a3a8f; padding:3px 8px; background:#eef1fb; border-radius:5px;
          white-space:nowrap; display:inline-block; cursor:pointer; user-select:none; transition:background .15s; }
        .file-link:hover,.file-link.active { background:#d0d9f0; }
        .dark .file-link { background:#1e3a6e; color:#93c5fd; }
        .dark .file-link:hover,.dark .file-link.active { background:#2a4a8e; }

        /* ── 더보기 버튼 영역 ── */
        .load-more-area { margin-top:20px; padding:20px; background:#fff; border-radius:16px;
          border:1px solid #e5e9f5; box-shadow:0 2px 12px rgba(26,58,143,0.06); text-align:center; }
        .dark .load-more-area { background:#1e293b; border-color:#334155; }
        .load-more-info { margin-bottom:14px; font-size:13px; color:#6b7280; display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap; }
        .lm-loaded { font-weight:600; color:#374151; }
        .dark .lm-loaded { color:#d1d5db; }
        .lm-remaining { color:#1a3a8f; font-weight:600; }
        .dark .lm-remaining { color:#93c5fd; }
        .load-more-btns { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .lm-btn { display:flex; align-items:center; gap:7px; border:none; border-radius:12px; padding:12px 22px;
          font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; white-space:nowrap; }
        .lm-btn:disabled { opacity:0.55; cursor:not-allowed; }
        .lm-btn-page { background:#eef1fb; color:#1a3a8f; border:2px solid #c7d2fe; }
        .lm-btn-page:hover:not(:disabled) { background:#dde5fb; border-color:#818cf8; }
        .dark .lm-btn-page { background:#1e3a6e; color:#93c5fd; border-color:#334155; }
        .lm-btn-all { background:#1a3a8f; color:#fff; box-shadow:0 2px 10px rgba(26,58,143,0.25); }
        .lm-btn-all:hover:not(:disabled) { background:#0d1e3d; }
        .dark .lm-btn-all { background:#2a4a8e; }
        .lm-spin { width:14px; height:14px; border:2px solid rgba(255,255,255,0.4); border-top:2px solid #fff;
          border-radius:50%; animation:spin .7s linear infinite; display:inline-block; flex-shrink:0; }
        .lm-btn-page .lm-spin { border-color:rgba(26,58,143,0.25); border-top-color:#1a3a8f; }

        .all-loaded { text-align:center; margin-top:16px; color:#16a34a; font-size:13px; font-weight:600; padding:10px; }
        .dark .all-loaded { color:#4ade80; }

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
