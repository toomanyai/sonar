import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "声纳 Sonar · KOL 声音里的投研信号",
  description: "股票 KOL 推特监控与 AI 投研分析终端",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[#f7f8fa] text-slate-800">
        <TopNav />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
