import "./globals.css";
import SwRegister from "./sw-register";

export const metadata = {
  title: "Money-Charger",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  other: { "facebook-domain-verification": "12d8083l156si0pkos1ccju46umqvw" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e2a37",
};

const SKRIP_TEMA = `
try {
  var t = localStorage.getItem("mc_tema");
  if (!t) t = matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "terang";
  document.documentElement.dataset.theme = t === "gelap" ? "dark" : "light";
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKRIP_TEMA }} />
      </head>
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}