import type { Metadata } from "next";
import "./globals.css";

// Intentionally NOT using next/font/google: it requires fetching from
// fonts.googleapis.com at build time, which breaks builds in offline /
// restricted-network environments (Codespaces behind a firewall, air-gapped
// CI, etc). System font stack keeps the "no required external dependency"
// principle from the master spec (section 2) intact.

export const metadata: Metadata = {
  title: "Q-Score Pro",
  description: "クイズ大会を運営するための統合プラットフォーム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
