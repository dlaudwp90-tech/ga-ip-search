import { useState, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Upload() {
  const [folder, setFolder] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [existingFiles, setExistingFiles] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState(new Set());
  const [notionWarning, setNotionWarning] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const fileRef = useRef(null);
  const router = useRouter();

  const addFiles = (newFiles) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name))];
    });
    setResults([]); setError(null); setUploadDone(false); setUploadProgress(0);
  };

  const handleFiles = (e) => addFiles(e.target.files);
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const loadExistingFiles = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    setLoadingExisting(true); setCheckedKeys(new Set());
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", folder: folder.trim() }),
    });
    const data = await res.json();
    setExistingFiles(data.files || []);
    setLoadingExisting(false);
  };

  const toggleCheck = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedKeys.size === existingFiles.length) {
      setCheckedKeys(new Set());
    } else {
      setCheckedKeys(new Set(existingFiles.map((f) => f.key)));
    }
  };

  const handleDelete = async (file) => {
    setDeletingKeys((prev) => new Set(prev).add(file.key));
    await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", key: file.key, folder: folder.trim(), publicUrl: file.url }),
    });
    setExistingFiles((prev) => prev.filter((f) => f.key !== file.key));
    setCheckedKeys((prev) => { const next = new Set(prev); next.delete(file.key); return next; });
    setDeletingKeys((prev) => { const next = new Set(prev); next.delete(file.key); return next; });
  };

  const handleDeleteSelected = async () => {
    if (checkedKeys.size === 0) return;
    if (!confirm(`선택한 ${checkedKeys.size}개 파일을 삭제하시겠습니까?`)) return;
    const toDelete = existingFiles.filter((f) => checkedKeys.has(f.key));
    setDeletingKeys(new Set(toDelete.map((f) => f.key)));
    for (const file of toDelete) {
      await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", key: file.key, folder: folder.trim(), publicUrl: file.url }),
      });
    }
    setExistingFiles((prev) => prev.filter((f) => !checkedKeys.has(f.key)));
    setCheckedKeys(new Set());
    setDeletingKeys(new Set());
  };

  const handleUpload = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    if (files.length === 0) { setError("파일을 선택하세요"); return; }
    setUploading(true); setError(null); setResults([]);
    setNotionWarning(false); setUploadProgress(0); setUploadDone(false);

    const uploaded = [];
    let anyNotionMissing = false;
    const total = files.length;

    for (let idx = 0; idx < total; idx++) {
      const file = files[idx];
      try {
        const presignRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "presign",
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            folder: folder.trim(),
          }),
        });
        const { presignedUrl, publicUrl } = await presignRes.json();

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("R2 업로드 실패");

        const notifyRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "notify", folder: folder.trim(), publicUrl }),
        });
        const notifyData = await notifyRes.json();
        if (!notifyData.notionFound) anyNotionMissing = true;

        uploaded.push({ name: file.name, url: publicUrl, ok: true });
      } catch (err) {
        uploaded.push({ name: file.name, error: err.message, ok: false });
      }
      setUploadProgress(Math.round(((idx + 1) / total) * 100));
    }

    setResults(uploaded);
    if (anyNotionMissing) setNotionWarning(true);
    setUploadDone(true);
    setUploading(false);
    if (existingFiles.length > 0) loadExistingFiles();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const allChecked = existingFiles.length > 0 && checkedKeys.size === existingFiles.length;
  const someChecked = checkedKeys.size > 0;

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
          <div className="folder-row">
            <input
              className="input"
              placeholder="예: 클로드테스트(상표)"
              value={folder}
              onChange={(e) => { setFolder(e.target.value); setExistingFiles([]); setCheckedKeys(new Set()); }}
              onKeyDown={(e) => e.key === "Enter" && loadExistingFiles()}
            />
            <button className="folder-btn" onClick={loadExistingFiles} disabled={loadingExisting}>
              {loadingExisting ? "조회 중..." : "파일 조회"}
            </button>
          </div>

          {/* 기존 파일 목록 */}
          {existingFiles.length > 0 && (
            <div className="existing-section">
              <div className="existing-header">
                <label className="check-all">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  <span>전체 선택 ({existingFiles.length}개)</span>
                </label>
                {someChecked && (
                  <button className="delete-selected-btn" onClick={handleDeleteSelected}>
                    🗑 선택 삭제 ({checkedKeys.size}개)
                  </button>
                )}
              </div>
              {existingFiles.map((f, i) => (
                <div key={i} className={`existing-item${checkedKeys.has(f.key) ? " checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checkedKeys.has(f.key)}
                    onChange={() => toggleCheck(f.key)}
                    className="item-check"
                  />
                  <span className="existing-name">📄 {f.name}</span>
                  <span className="existing-size">{formatSize(f.size)}</span>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(f)}
                    disabled={deletingKeys.has(f.key)}
                  >
                    {deletingKeys.has(f.key) ? "삭제 중..." : "🗑"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="label" style={{ marginTop: "24px" }}>파일 선택 (클릭 또는 드래그 앤 드롭)</label>
          <div
            className={`file-area${dragging ? " dragging" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            {files.length === 0 ? (
              <p className="file-hint">📂 클릭하거나 파일을 여기에 끌어다 놓으세요</p>
            ) : (
              <ul className="file-list">
                {files.map((f, i) => (
                  <li key={i}>
                    <span>📄 {f.name}</span>
                    <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={handleFiles} />
          </div>

          {error && <p className="error">⚠️ {error}</p>}

          {notionWarning && (
            <div className="notion-warning">
              ⚠️ Notion DB에서 일치하는 문서를 찾지 못했습니다.<br />
              사건 폴더명이 Notion 문서 제목과 정확히 일치하는지 확인해주세요.
            </div>
          )}

          {/* 업로드 버튼 */}
          <button
            className={`btn${uploadDone ? " done" : ""}`}
            onClick={uploadDone ? undefined : handleUpload}
            disabled={uploading || uploadDone}
          >
            <span className="btn-text">
              {uploadDone
                ? "✅ 업로드 완료"
                : uploading
                ? `업로드 중 (${uploadProgress}%)`
                : "업로드 시작"}
            </span>
            {uploading && (
              <span className="btn-fill" style={{ width: `${uploadProgress}%` }} />
            )}
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
        .folder-row { display: flex; gap: 8px; }
        .input { flex: 1; padding: 12px 16px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 14px; font-family: inherit; outline: none; background: #f8faff; }
        .input:focus { border-color: #13274F; }
        .folder-btn { background: #eef1fb; color: #1a3a8f; border: 1.5px solid #c7d2fe; border-radius: 10px; padding: 0 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .folder-btn:hover { background: #d0d9f0; }
        .folder-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .existing-section { margin-top: 16px; border: 1.5px solid #e5e9f5; border-radius: 12px; overflow: hidden; }
        .existing-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8faff; border-bottom: 1px solid #e5e9f5; }
        .check-all { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #6b7280; cursor: pointer; }
        .check-all input { cursor: pointer; width: 15px; height: 15px; }
        .delete-selected-btn { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .delete-selected-btn:hover { background: #fee2e2; }
        .existing-item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #f0f4ff; font-size: 13px; transition: background 0.1s; }
        .existing-item:last-child { border-bottom: none; }
        .existing-item.checked { background: #f0f4ff; }
        .item-check { width: 15px; height: 15px; cursor: pointer; flex-shrink: 0; }
        .existing-name { flex: 1; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .existing-size { color: #9ca3af; font-size: 11px; flex-shrink: 0; }
        .delete-btn { background: #fef2f2; color: #991b1b; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .delete-btn:hover { background: #fee2e2; }
        .delete-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .file-area { margin-top: 8px; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 24px; cursor: pointer; background: #f8faff; transition: border-color 0.2s, background 0.2s; min-height: 90px; display: flex; align-items: center; justify-content: center; }
        .file-area:hover, .file-area.dragging { border-color: #13274F; background: #eef1fb; }
        .file-hint { color: #9ca3af; font-size: 14px; text-align: center; }
        .file-list { list-style: none; width: 100%; display: flex; flex-direction: column; gap: 6px; }
        .file-list li { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #374151; background: #f0f4ff; border-radius: 6px; padding: 6px 10px; }
        .remove-btn { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 12px; }
        .remove-btn:hover { color: #dc2626; }
        .error { color: #dc2626; font-size: 13px; margin-top: 12px; }
        .notion-warning { margin-top: 14px; background: #fffbeb; border: 1.5px solid #fcd34d; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #92400e; line-height: 1.6; }

        /* 업로드 버튼 + 프로그레스 */
        .btn {
          margin-top: 24px; width: 100%; padding: 14px;
          background: #13274F; color: #fff; border: none; border-radius: 10px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
          position: relative; overflow: hidden; transition: background 0.3s;
        }
        .btn:hover:not(:disabled) { background: #0d1e3d; }
        .btn:disabled { cursor: not-allowed; }
        .btn.done { background: #166534; cursor: default; }
        .btn-text { position: relative; z-index: 1; }
        .btn-fill {
          position: absolute; left: 0; top: 0; height: 100%;
          background: rgba(255, 255, 255, 0.18);
          transition: width 0.4s ease;
          z-index: 0; border-radius: 10px 0 0 10px;
        }

        .results { margin-top: 24px; }
        .results-title { font-size: 14px; font-weight: 700; color: #374151; margin-bottom: 12px; }
        .result-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; gap: 8px; }
        .result-item.ok { background: #f0fdf4; color: #166534; }
        .result-item.fail { background: #fef2f2; color: #991b1b; }
        .copy-btn { background: #dcfce7; color: #166634; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .err-msg { font-size: 11px; color: #991b1b; }
      `}</style>
    </>
  );
}
