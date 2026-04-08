import { ClerkProvider } from "@clerk/nextjs";

const clerkAppearance = {
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
    card: {
      boxShadow: "none",
      border: "none",
      padding: "0",
      background: "transparent",
    },
    headerTitle: { display: "none" },
    headerSubtitle: { display: "none" },
    formButtonPrimary: {
      background: "#13274F",
      borderRadius: "10px",
      fontFamily: "'Noto Sans KR', sans-serif",
      fontWeight: "700",
      fontSize: "15px",
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
};

export default function App({ Component, pageProps }) {
  return (
    <ClerkProvider {...pageProps} appearance={clerkAppearance}>
      <Component {...pageProps} />
    </ClerkProvider>
  );
}
