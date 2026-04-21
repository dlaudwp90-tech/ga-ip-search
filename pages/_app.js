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
};

export default function App({ Component, pageProps }) {
  return (
    <ClerkProvider {...pageProps} appearance={clerkAppearance}>
      <Component {...pageProps} />
    </ClerkProvider>
  );
}
