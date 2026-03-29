import { useState, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Upload() {
  const [folder, setFolder] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const router = useRouter();

  const handleFiles = (e) => {
    setFiles(Array.from(e.target.files));
    setResults([]);
    setError(null);
  };

  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpload = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    if (files.length === 0) { setError("파일을 선택하세요"); return; }
    setUploading(true); setError(null); setResults([]);

    const uploaded = [];
    for (const file of files) {
      try {
        const fileData = await toBase64(file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileData,
            contentType: file.type || "application/octet-stream",
            folder: folder.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "업로드 실패");
        uploaded.push({ name: file.name, url: data.url, ok: true });
      } catch (err) {
        uploaded.push({ name: file.name, error: err.message, ok: false });
      }
    }
    setResults(uploaded);
    setUploading(false);
  };

  return (
    <>
      <Head>
        <title>G&A IP — 파일 업로드</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page">
        <div className="header" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <h1 className="logo">Guardian &amp; Angel</h1>
          <p className="logo-sub">INTELLECTUAL PROPERTY · 가엔 특허법률사무소</p>
          <p className="back">← 검색으로 돌아가기</p>
        </div>

        <div className="card">
          <h2 className="title">📁 파일 업로드</h2>
          <p className="desc">R2 저장소에 파일을 업로드합니다</p>

          <label className="label">사건 폴더명</label>
          <input
            className="input"
            placeholder="예: T우선심사설명서(3류_브랜드명)"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />

          <label className="label">파일 선택 (복수 선택 가능)</label>
          <div className="file-area" onClick={() => fileRef.current?.click()}>
            {files.length === 0
              ? <p className="file-hint">클릭하여 파일 선택</p>
              : <ul className="file-list">{files.map((f, i) => <li key={i}>📄 {f.name}</li>)}</ul>
            }
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFiles} />
          </div>

          {error && <p className="error">⚠️ {error}</p>}

          <button className="btn" onClick={handleUpload} disabled={uploading}>
            {uploading ? "업로드 중..." : "업로드 시작"}
          </button>

          {results.length > 0 && (
            <div className="results">
              <p className="results-title">업로드 결과</p>
              {results.map((r, i) => (
                <div key={i} className={`result-item ${r.ok ? "ok" : "fail"}`}>
                  <span>{r.ok ? "✅" : "❌"} {r.name}</span>
                  {r.ok && (
                    <button className="copy-btn" onClick={() => navigator.clipboard.writeText(r.url)}>
                      URL 복사
                    </button>
                  )}
                  {!r.ok && <span className="err-msg">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; min-height: 100vh; background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%); }
      `}</style>

      <style jsx>{`
        .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; }
        .header { text-align: center; margin-bottom: 32px; }
        .logo { font-family: 'EB Garamond', serif; font-size: 32px; color: #13274F; font-weight: 700; }
        .logo-sub { font-size: 11px; color: #6b7280; letter-spacing: 2px; margin-top: 4px; }
        .back { font-size: 12px; color: #9ca3af; margin-top: 8px; }
        .card { width: 100%; max-width: 560px; background: #fff; border-radius: 20px; padding: 36px; box-shadow: 0 4px 24px rgba(19,39,79,0.10); }
        .title { font-size: 20px; font-weight: 800; color: #13274F; margin-bottom: 6px; }
        .desc { font-size: 13px; color: #6b7280; margin-bottom: 28px; }
        .label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 8px; margin-top: 20px; }
        .input { width: 100%; padding: 12px 16px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; font-family: inherit; outline: none; background: #f8faff; }
        .input:focus { border-color: #13274F; }
        .file-area { margin-top: 8px; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 24px; cursor: pointer; text-align: center; background: #f8faff; transition: border-color 0.2s; }
        .file-area:hover { border-color: #13274F; }
        .file-hint { color: #9ca3af; font-size: 14px; }
        .file-list { list-style: none; text-align: left; font-size: 13px; color: #374151; display: flex; flex-direction: column; gap: 4px; }
        .error { color: #dc2626; font-size: 13px; margin-top: 12px; }
        .btn { margin-top: 24px; width: 100%; padding: 14px; background: #13274F; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.2s; }
        .btn:hover { background: #0d1e3d; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .results { margin-top: 24px; }
        .results-title { font-size: 14px; font-weight: 700; color: #374151; margin-bottom: 12px; }
        .result-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; gap: 8px; }
        .result-item.ok { background: #f0fdf4; color: #166534; }
        .result-item.fail { background: #fef2f2; color: #991b1b; }
        .copy-btn { background: #dcfce7; color: #166534; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .err-msg { font-size: 11px; color: #991b1b; }
      `}</style>
    </>
  );
}
