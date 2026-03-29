import { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
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
      // 페이드아웃 시작
      setFadeOut(true);
      setTimeout(() => {
        router.push("/");
      }, 600);
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <>
      <Head>
        <title>Guardian &amp; Angel IP — 접근 코드 입력</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={`page ${fadeOut ? "fade-out" : "fade-in"}`}>
        <div className="card">

          {/* 로고 */}
          <div className="logo-wrap">
            <div className="logo-top-rule" />
            <h1 className="logo-main">Guardian &amp; Angel</h1>
            <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
            <div className="logo-mid-rule" />
            <p className="logo-sub-kr">가엔 특허법률사무소</p>
            <div className="logo-bot-rule" />
          </div>

          <p className="label">접근 코드를 입력하세요</p>

          <div className="input-wrap">
            <input
              type="password"
              className={`input ${error ? "input-error" : ""}`}
              placeholder="• • • • • • • •"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>

          {error && <p className="error-msg">❌ 코드가 올바르지 않습니다</p>}

          <button className="btn" onClick={handleSubmit} disabled={loading}>
            {loading ? "확인 중..." : "입장하기"}
          </button>

        </div>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans KR', sans-serif; min-height: 100vh; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%);
          padding: 24px 16px;
        }
        .fade-in  { animation: fadeIn  0.5s ease both; }
        .fade-out { animation: fadeOut 0.6s ease both; }

        .card {
          text-align: center;
          width: 100%; max-width: 420px;
          animation: slideUp 0.6s ease both;
        }

        /* 로고 */
        .logo-wrap { display: inline-block; text-align: center; margin-bottom: 40px; }
        .logo-top-rule {
          width: 340px; height: 1px; background: #13274F;
          margin: 0 auto 16px;
        }
        .logo-main {
          font-family: 'EB Garamond', 'Georgia', 'Times New Roman', serif;
          font-size: 38px; font-weight: 700;
          color: #13274F; letter-spacing: -0.5px; line-height: 1.15;
          margin: 0;
        }
        .logo-sub-en {
          font-family: 'Noto Sans KR', sans-serif;
          font-size: 11px; font-weight: 400;
          color: #13274F; letter-spacing: 5px;
          margin: 8px 0 10px;
          text-transform: uppercase;
        }
        .logo-mid-rule {
          width: 200px; height: 1px; background: #13274F;
          margin: 0 auto 10px;
        }
        .logo-sub-kr {
          font-family: 'Noto Serif KR', 'Noto Sans KR', serif;
          font-size: 18px; font-weight: 700;
          color: #13274F; letter-spacing: 2px;
          margin: 0 0 10px;
        }
        .logo-bot-rule {
          width: 340px; height: 1px; background: #13274F;
          margin: 0 auto;
        }

        /* 입력 영역 */
        .label {
          font-size: 14px; color: #6b7280;
          margin-bottom: 16px; letter-spacing: 0.5px;
        }
        .input-wrap { margin-bottom: 8px; }
        .input {
          width: 100%; padding: 14px 18px;
          font-size: 16px; font-family: inherit;
          background: #f8faff;
          border: 1.5px solid #cbd5e1; border-radius: 10px;
          outline: none; text-align: center;
          letter-spacing: 6px; color: #13274F;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input:focus {
          border-color: #13274F;
          box-shadow: 0 0 0 3px rgba(19,39,79,0.08);
        }
        .input-error { border-color: #dc2626; }
        .error-msg {
          color: #dc2626; font-size: 13px;
          margin-bottom: 12px;
        }
        .btn {
          margin-top: 16px; width: 100%; padding: 14px;
          background: #13274F; color: #fff;
          border: none; border-radius: 10px;
          font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          letter-spacing: 0.5px;
          transition: background 0.2s, opacity 0.2s;
        }
        .btn:hover { background: #0d1e3d; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 400px) {
          .logo-main { font-size: 28px; }
          .logo-top-rule, .logo-bot-rule { width: 260px; }
          .logo-mid-rule { width: 160px; }
        }
      `}</style>
    </>
  );
}
