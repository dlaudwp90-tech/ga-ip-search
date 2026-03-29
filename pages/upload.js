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
  const [deletingKey, setDeletingKey] = useState(null);
  const [notionWarning, setNotionWarning] = useState(false);
  const fileRef = useRef(null);
  const router = useRouter();

  const addFiles = (newFiles) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !names.has(f.name))];
    });
    setResults([]); setError(null);
  };

  const handleFiles = (e) => addFiles(e.target.files);
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const loadExistingFiles = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    setLoadingExisting(true);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", folder: folder.trim() }),
    });
    const data = await res.json();
    setExistingFiles(data.files || []);
    setLoadingExisting(false);
  };

  const handleDelete = async (file) => {
    if (!confirm(`"${file.name}" 을 삭제하시겠습니까?`)) return;
    setDeletingKey(file.key);
    await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        key: file.key,
        folder: folder.trim(),
        publicUrl: file.url,
      }),
    });
    setExistingFiles((prev) => prev.filter((f) => f.key !== file.key));
    setDeletingKey(null);
  };

  const handleUpload = async () => {
    if (!folder.trim()) { setError("사건 폴더명을 입력하세요"); return; }
    if (files.length === 0) { setError("파일을 선택하세요"); return; }
    setUploading(true); setError(null); setResults([]); setNotionWarning(false);

    const uploaded = [];
    let anyNotionMissing = false;

    for (const file of files) {
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

        uploaded.push({ name: file.name, url: publicUrl, ok: true, notionUpdated: notifyData.notionUpdated });
      } catch (err) {
        uploaded.push({ name: file.name, error: err.message, ok: false });
      }
    }

    setResults(uploaded);
    if (anyNotionMissing) setNotionWarning(true);
    setUploading(false);
    // 기존 파일 목록 갱신
    if (existingFiles.length > 0) loadExistingFiles();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
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
          <h2 className
