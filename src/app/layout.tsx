import "./globals.css";

export const metadata = {
  title: "Money-Charger",
  robots: { index: false, follow: false },
  other: { "facebook-domain-verification": "12d8083l156si0pkos1ccju46umqvw" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef2ed",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
