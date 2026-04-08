import { SignIn } from "@clerk/nextjs";
import Head from "next/head";

export default function Login() {
  return (
    <>
      <Head>
        <title>Guardian &amp; Angel IP — 직원 로그인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        {/* 로고 */}
        <div className="logo-wrap">
          <div className="logo-top-rule" />
          <h1 className="logo-main">Guardian &amp; Angel</h1>
          <p className="logo-sub-en">INTELLECTUAL PROPERTY</p>
          <div className="logo-mid-rule" />
          <p className="logo-sub-kr">가엔 특허법률사무소</p>
          <div className="logo-bot-rule" />
        </div>

        {/* Clerk 로그인 컴포넌트 */}
        <SignIn
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: "#13274F",
              colorText: "#13274F",
              colorBackground: "#ffffff",
              colorInputBackground: "#f8faff",
              colorInputText: "#13274F",
              borderRadius: "10px",
              fontFamily: "'Noto Sans KR', sans-serif",
            },
            elements: {
              rootBox: { width: "100%", maxWidth: "420px" },
              card: {
                boxShadow: "none",
                border: "none",
                padding: "0",
                background: "transparent",
              },
              headerTitle: { display: "none" },
              headerSubtitle: { display: "none" },
              socialButtonsBlockButton: {
                border: "1.5px solid #cbd5e1",
                borderRadius: "10px",
                fontFamily: "'Noto Sans KR', sans-serif",
                fontWeight: "500",
                color: "#13274F",
              },
              formButtonPrimary: {
                background: "#13274F",
                borderRadius: "10px",
                fontFamily: "'Noto Sans KR', sans-serif",
                fontWeight: "700",
                fontSize: "15px",
                "&:hover": { background: "#0d1e3d" },
              },
              formFieldInput: {
                borderRadius: "10px",
                border: "1.5px solid #cbd5e1",
                fontFamily: "'Noto Sans KR', sans-serif",
                fontSize: "15px",
              },
              footerActionLink: { color: "#13274F", fontWeight: "600" },
              dividerLine: { background: "#e2e8f0" },
              dividerText: { color: "#94a3b8" },
            },
          }}
        />
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Noto Sans KR', sans-serif;
          min-height: 100vh;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(180deg, #ffffff 0%, #f4f6fc 100%);
          padding: 40px 16px;
          gap: 36px;
          animation: slideUp 0.6s ease both;
        }

        /* 로고 */
        .logo-wrap {
          display: inline-block;
          text-align: center;
        }
        .logo-top-rule {
          width: 340px; height: 1px;
          background: #13274F;
          margin: 0 auto 16px;
        }
        .logo-main {
          font-family: 'EB Garamond', 'Georgia', serif;
          font-size: 38px; font-weight: 700;
          color: #13274F;
          letter-spacing: -0.5px; line-height: 1.15;
          margin: 0;
        }
        .logo-sub-en {
          font-size: 11px; font-weight: 400;
          color: #13274F; letter-spacing: 5px;
          margin: 8px 0 10px;
          text-transform: uppercase;
        }
        .logo-mid-rule {
          width: 200px; height: 1px;
          background: #13274F;
          margin: 0 auto 10px;
        }
        .logo-sub-kr {
          font-family: 'Noto Serif KR', serif;
          font-size: 18px; font-weight: 700;
          color: #13274F; letter-spacing: 2px;
          margin: 0 0 10px;
        }
        .logo-bot-rule {
          width: 340px; height: 1px;
          background: #13274F;
          margin: 0 auto;
        }

        @media (max-width: 400px) {
          .logo-main { font-size: 28px; }
          .logo-top-rule, .logo-bot-rule { width: 260px; }
          .logo-mid-rule { width: 160px; }
        }
      `}</style>
    </>
  );
}
