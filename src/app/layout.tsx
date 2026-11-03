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
  themeColor: "#0098d1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}