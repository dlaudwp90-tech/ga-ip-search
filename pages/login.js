import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <>
      <Head>
        <title>G&A IP — 접근 코드 입력</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <div className="page">
        <div className="card">
          <h1 className="logo">
            <span className="g">G</span>
            <span className="amp">&amp;</span>
            <span className="a">A</span>
            <span className="ip"> IP</span>
          </h1>
          <p className="subtitle">가엔 특허법률사무소 · 문서 통합 검색</p>
          <p className="label">초대 코드를 입력하세요</p>
          <input
            type="password"
            className={`input ${error ? "input-error" : ""}`}
            placeholder="초대 코드"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
          {error && <p className="error-msg">❌ 코드가 올바르지 않습니다</p>}
          <button className="btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "확인 중..." : "입장하기"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(160deg, #f8f9ff 0%, #eef1fb 100%);
          font-family: 'Noto Sans KR', sans-serif; padding: 16px;
        }
        .card {
          background: #fff; border-radius: 24px; padding: 48px 40px;
          box-shadow: 0 8px 40px rgba(26,58,143,0.12);
          max-width: 380px; width: 100%; text-align: center;
        }
        .logo { font-size: 48px; font-weight: 900; letter-spacing: -2px; line-height: 1; margin-bottom: 8px; }
        .g, .a { color: #1a3a8f; }
        .amp { color: #c9973a; font-size: 40px; }
        .ip { color: #4a6fd4; font-size: 28px; font-weight: 700; }
        .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
        .label { font-size: 15px; font-weight: 700; color: #374151; margin-bottom: 12px; }
        .input {
          width: 100%; padding: 13px 16px; font-size: 16px; font-family: inherit;
          border: 2px solid #d0d9f0; border-radius: 12px; outline: none;
          text-align: center; letter-spacing: 4px; color: #1f2937;
          transition: border-color 0.2s; box-sizing: border-box;
        }
        .input:focus { border-color: #1a3a8f; }
        .input-error { border-color: #dc2626; }
        .error-msg { color: #dc2626; font-size: 13px; margin-top: 8px; }
        .btn {
          margin-top: 20px; width: 100%; padding: 14px;
          background: #1a3a8f; color: #fff; border: none; border-radius: 12px;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: background 0.2s;
        }
        .btn:hover { background: #14307a; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </>
  );
}
