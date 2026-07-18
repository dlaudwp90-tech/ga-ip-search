// pages/_app.js
// ─────────────────────────────────────────────────────────────
// Clerk 제거 후 단순 렌더. (로그인 세션은 middleware + 각 화면이 처리)
// ⚠ 배포 순서: 로그인 화면·index.js·middleware 전환이 끝나 로그인이
//    정상 확인된 "정리 단계"에서 이 파일을 올리세요.
// ─────────────────────────────────────────────────────────────

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
