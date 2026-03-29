import { useState, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Upload() {
  const [folder, setFolder] = useState("");
  const [folderStatus, setFolderStatus] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [existingFiles, setExistingFiles] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState(new Set());
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  // 중복 파일 처리 모달
  const [dupModal, setDupModal] = useState(null); // { conflicts: [{file, existingKey}], decisions: {fileName: 'replace'|'rename'} }
  const [dupDecisions, setDupDecisions] = useState({});

  const fileRef = useRef(null);
  const router = useRouter();

  const handleFolderChange = (e) => {
    setFolder(e.target.value);
    setFolderStatus(null);
    setExistingFiles([]);
    setCheckedKeys(new Set());
    setUploadDone(false);
    setUploadProgress(0);
    setResults([]);
  };

  const checkFolder = async (folderName) => {
    if (!folderName.trim()) return;
    setFolderStatus("checking");
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", folder: folderName.trim() }),
    });
    const data = await res.json();
    setFolderStatus(data.exists ? "ok" : "fail");
  };

  const handleFolderBlur = () => checkFolder(folder);
  const handleFolderKeyDown = (e) => { if (e.key === "Enter") checkFolder(folder); };

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
    return data.files || [];
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

  // 새 이름 생성: 파일명(1).ext, 파일명(2).ext ...
  const getNewName = (fileName, existingNames) => {
    const lastDot = fileName.lastIndexOf(".");
    const base = lastDot > -1 ? fileName.slice(0, lastDot) : fileName;
    const ext = lastDot > -1 ? fileName.slice(lastDot) : "";
    let n = 1;
    while (existingNames.has(`${base}(${n})${ext}`)) n++;
    return `${base}(${n})${ext}`;
  };

  // 업로드 시작 — 중복 체크 먼저
  const handleUpload = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    if (folderStatus !== "ok") { setError("Notion DB에서 확인된 폴더명이 아닙니다"); return; }
    if (files.length === 0) { setError("파일을 선택하세요"); return; }

    // 최신 기존 파일 목록 가져오기
    const latest = await loadExistingFiles();
    const existingNames = new Set(latest.map((f) => f.name));

    // 중복 파일 확인
    const conflicts = files.filter((f) => existingNames.has(f.name));
    if (conflicts.length > 0) {
      // 초기 결정: 모두 "replace"
      const initDecisions = {};
      conflicts.forEach((f) => { initDecisions[f.name] = "replace"; });
      setDupDecisions(initDecisions);
      setDupModal({ conflicts, existingNames });
      return;
    }

    // 중복 없으면 바로 업로드
    await doUpload(files, {}, existingNames);
  };

  // 모달 확인 후 업로드 실행
  const handleDupConfirm = async () => {
    const { existingNames } = dupModal;
    setDupModal(null);
    await doUpload(files, dupDecisions, existingNames);
  };

  // 실제 업로드 처리
  const doUpload = async (fileList, decisions, existingNames) => {
    setUploading(true); setError(null); setResults([]);
    setUploadProgress(0); setUploadDone(false);

    const uploaded = [];
    const total = fileList.length;
    // 현재 존재하는 이름 셋 (새 이름 충돌 방지용)
    const usedNames = new Set(existingNames);

    for (let idx = 0; idx < total; idx++) {
      const file = fileList[idx];
      let targetName = file.name;

      if (decisions[file.name] === "rename") {
        targetName = getNewName(file.name, usedNames);
      }
      usedNames.add(targetName);

      try {
        const presignRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "presign",
            fileName: targetName,
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

        // 교체인 경우 기존 Notion URL과 동일 → notify 불필요 (URL 동일)
        // 새 이름인 경우 새 URL 추가
        if (decisions[file.name] !== "replace" || targetName !== file.name) {
          await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "notify", folder: folder.trim(), publicUrl }),
          });
        }

        const label = targetName !== file.name ? `${file.name} → ${targetName}` : file.name;
        uploaded.push({ name: label, url: publicUrl, ok: true });
      } catch (err) {
        uploaded.push({ name: file.name, error: err.message, ok: false });
      }
      setUploadProgress(Math.round(((idx + 1) / total) * 100));
    }

    setResults(uploaded);
    setUploadDone(true);
    setUploading(false);
    loadExistingFiles();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  const allChecked = existingFiles.length > 0 && checkedKeys.size === existingFiles.length;
  const someChecked = checkedKeys.size > 0;
  const canUpload = folderStatus === "ok" && files.length > 0 && !uploading && !uploadDone;

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
            <div className={`input-wrap${folderStatus === "ok" ? " ok" : folderStatus === "fail" ? " fail" : ""}`}>
              <input
                className="input"
                placeholder="예: 클로드테스트(상표)"
                value={folder}
                onChange={handleFolderChange}
                onBlur={handleFolderBlur}
                onKeyDown={handleFolderKeyDown}
              />
              {folderStatus === "checking" && <span className="status-icon spin">⏳</span>}
              {folderStatus === "ok" && <span className="status-icon">✅</span>}
              {folderStatus === "fail" && <span className="status-icon">❌</span>}
            </div>
            <button className="folder-btn" onClick={() => { checkFolder(folder); loadExistingFiles(); }} disabled={loadingExisting || folderStatus === "checking"}>
              {loadingExisting ? "조회 중..." : "파일 조회"}
            </button>
          </div>

          {folderStatus === "ok" && (
            <p className="folder-msg ok">✅ Notion DB에서 일치하는 문서를 찾았습니다. 업로드를 진행할 수 있습니다.</p>
          )}
          {folderStatus === "fail" && (
            <p className="folder-msg fail">❌ Notion DB에서 일치하는 문서를 찾지 못했습니다. 폴더명을 다시 확인해주세요.</p>
          )}

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
                  <input type="checkbox" checked={checkedKeys.has(f.key)} onChange={() => toggleCheck(f.key)} className="item-check" />
                  <span className="existing-name">📄 {f.name}</span>
                  <span className="existing-size">{formatSize(f.size)}</span>
                  <button className="delete-btn" onClick={() => handleDelete(f)} disabled={deletingKeys.has(f.key)}>
                    {deletingKeys.has(f.key) ? "삭제 중..." : "🗑"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="label" style={{ marginTop: "24px" }}>파일 선택 (클릭 또는 드래그 앤 드롭)</label>
          <div
            className={`file-area${dragging ? " dragging" : ""}${folderStatus === "fail" ? " disabled" : ""}`}
            onClick={() => folderStatus !== "fail" && fileRef.current?.click()}
            onDrop={folderStatus !== "fail" ? handleDrop : undefined}
            onDragOver={folderStatus !== "fail" ? handleDragOver : undefined}
            onDragLeave={handleDragLeave}
          >
            {files.length === 0 ? (
              <p className="file-hint">
                {folderStatus === "fail" ? "⛔ 폴더명을 먼저 확인하세요" : "📂 클릭하거나 파일을 여기에 끌어다 놓으세요"}
              </p>
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

          <button
            className={`btn${uploadDone ? " done" : ""}${folderStatus === "fail" ? " blocked" : ""}`}
            onClick={canUpload ? handleUpload : undefined}
            disabled={!canUpload}
          >
            <span className="btn-text">
              {uploadDone ? "✅ 업로드 완료"
                : uploading ? `업로드 중 (${uploadProgress}%)`
                : folderStatus === "fail" ? "⛔ 업로드 불가"
                : folderStatus !== "ok" ? "폴더명을 먼저 확인하세요"
                : "업로드 시작"}
            </span>
            {uploading && <span className="btn-fill" style={{ width: `${uploadProgress}%` }} />}
          </button>

          {results.length > 0 && (
            <div className="results">
              <p className="results-title">업로드 결과</p>
              {results.map((r, i) => (
                <div key={i} className={`result-item ${r.ok ? "ok" : "fail"}`}>
                  <span>{r.ok ? "✅" : "❌"} {r.name}</span>
                  {r.ok && (
                    <button className="copy-btn" onClick={() => navigator.clipboard.writeText(r.url)}>URL 복사</button>
                  )}
                  {!r.ok && <span className="err-msg">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 중복 파일 처리 모달 */}
      {dupModal && (
        <div className="dup-overlay" onClick={() => setDupModal(null)}>
          <div className="dup-modal" onClick={(e) => e.stopPropagation()}>
            <p className="dup-title">⚠️ 동일한 파일이 이미 존재합니다</p>
            <p className="dup-sub">각 파일의 처리 방법을 선택해주세요</p>

            <div className="dup-list">
              {dupModal.conflicts.map((file, i) => (
                <div key={i} className="dup-item">
                  <span className="dup-filename">📄 {file.name}</span>
                  <div className="dup-btns">
                    <button
                      className={`dup-btn${dupDecisions[file.name] === "replace" ? " selected-replace" : ""}`}
                      onClick={() => setDupDecisions((prev) => ({ ...prev, [file.name]: "replace" }))}
                    >
                      🔄 교체
                    </button>
                    <button
                      className={`dup-btn${dupDecisions[file.name] === "rename" ? " selected-rename" : ""}`}
                      onClick={() => setDupDecisions((prev) => ({ ...prev, [file.name]: "rename" }))}
                    >
                      📋 새 이름으로
                    </button>
                  </div>
                  {dupDecisions[file.name] === "rename" && (
                    <p className="dup-preview">
                      → {getNewName(file.name, dupModal.existingNames)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="dup-all-row">
              <button className="dup-all-btn" onClick={() => {
                const next = {};
                dupModal.conflicts.forEach((f) => { next[f.name] = "replace"; });
                setDupDecisions(next);
              }}>모두 교체</button>
              <button className="dup-all-btn rename" onClick={() => {
                const next = {};
                dupModal.conflicts.forEach((f) => { next[f.name] = "rename"; });
                setDupDecisions(next);
              }}>모두 새 이름으로</button>
            </div>

            <div className="dup-actions">
              <button className="dup-confirm" onClick={handleDupConfirm}>확인 후 업로드</button>
              <button className="dup-cancel" onClick={() => setDupModal(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; min-height: 100vh; background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%); }
        @keyframes spin { to { transform: rotate(360deg); } }
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
        .input-wrap { flex: 1; display: flex; align-items: center; border: 1.5px solid #cbd5e1; border-radius: 10px; background: #f8faff; padding-right: 10px; transition: border-color 0.2s; }
        .input-wrap.ok { border-color: #16a34a; background: #f0fdf4; }
        .input-wrap.fail { border-color: #dc2626; background: #fef2f2; }
        .input { flex: 1; padding: 12px 16px; border: none; outline: none; font-size: 14px; font-family: inherit; background: transparent; }
        .status-icon { font-size: 16px; flex-shrink: 0; }
        .spin { display: inline-block; animation: spin 0.8s linear infinite; }

        .folder-msg { font-size: 12px; margin-top: 8px; padding: 8px 12px; border-radius: 8px; }
        .folder-msg.ok { background: #f0fdf4; color: #166534; }
        .folder-msg.fail { background: #fef2f2; color: #991b1b; }

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
        .file-area:hover:not(.disabled), .file-area.dragging { border-color: #13274F; background: #eef1fb; }
        .file-area.disabled { cursor: not-allowed; background: #fef2f2; border-color: #fecaca; }
        .file-hint { color: #9ca3af; font-size: 14px; text-align: center; }
        .file-area.disabled .file-hint { color: #ef4444; }
        .file-list { list-style: none; width: 100%; display: flex; flex-direction: column; gap: 6px; }
        .file-list li { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #374151; background: #f0f4ff; border-radius: 6px; padding: 6px 10px; }
        .remove-btn { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 12px; }
        .remove-btn:hover { color: #dc2626; }
        .error { color: #dc2626; font-size: 13px; margin-top: 12px; }

        .btn { margin-top: 24px; width: 100%; padding: 14px; background: #13274F; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; position: relative; overflow: hidden; transition: background 0.3s; }
        .btn:hover:not(:disabled):not(.blocked):not(.done) { background: #0d1e3d; }
        .btn:disabled:not(.blocked):not(.done) { background: #94a3b8; cursor: not-allowed; }
        .btn.blocked { background: #dc2626; cursor: not-allowed; }
        .btn.done { background: #166534; cursor: default; }
        .btn-text { position: relative; z-index: 1; }
        .btn-fill { position: absolute; left: 0; top: 0; height: 100%; background: rgba(255,255,255,0.18); transition: width 0.4s ease; z-index: 0; border-radius: 10px 0 0 10px; }

        .results { margin-top: 24px; }
        .results-title { font-size: 14px; font-weight: 700; color: #374151; margin-bottom: 12px; }
        .result-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; gap: 8px; }
        .result-item.ok { background: #f0fdf4; color: #166534; }
        .result-item.fail { background: #fef2f2; color: #991b1b; }
        .copy-btn { background: #dcfce7; color: #166634; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .err-msg { font-size: 11px; color: #991b1b; }

        /* 중복 파일 모달 */
        .dup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 999; padding: 16px; }
        .dup-modal { background: #fff; border-radius: 20px; padding: 28px; max-width: 480px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
        .dup-title { font-size: 17px; font-weight: 800; color: #13274F; margin-bottom: 6px; }
        .dup-sub { font-size: 13px; color: #6b7280; margin-bottom: 20px; }

        .dup-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; max-height: 300px; overflow-y: auto; }
        .dup-item { background: #f8faff; border: 1.5px solid #e5e9f5; border-radius: 12px; padding: 12px 14px; }
        .dup-filename { font-size: 13px; color: #374151; font-weight: 600; display: block; margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dup-btns { display: flex; gap: 8px; }
        .dup-btn { flex: 1; padding: 8px; border: 1.5px solid #e5e9f5; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; background: #fff; color: #6b7280; transition: all 0.15s; }
        .dup-btn.selected-replace { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
        .dup-btn.selected-rename { background: #f0fdf4; border-color: #86efac; color: #166534; }
        .dup-btn:hover { border-color: #cbd5e1; }
        .dup-preview { font-size: 11px; color: #166534; margin-top: 6px; padding: 4px 8px; background: #f0fdf4; border-radius: 5px; }

        .dup-all-row { display: flex; gap: 8px; margin-bottom: 16px; padding-top: 4px; border-top: 1px solid #f0f4ff; padding-top: 14px; }
        .dup-all-btn { flex: 1; padding: 8px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dup-all-btn.rename { background: #f0fdf4; color: #166534; border-color: #86efac; }
        .dup-all-btn:hover { opacity: 0.85; }

        .dup-actions { display: flex; gap: 10px; }
        .dup-confirm { flex: 1; padding: 13px; background: #13274F; color: #fff; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dup-confirm:hover { background: #0d1e3d; }
        .dup-cancel { padding: 13px 20px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .dup-cancel:hover { background: #e5e7eb; }
      `}</style>
    </>
  );
}
