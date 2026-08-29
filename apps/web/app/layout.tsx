import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AsciiBackdrop } from "@/components/ascii-backdrop";
import { Toaster } from "@/components/toaster";
import { WebAnalytics } from "@/components/web-analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sodium", template: "%s · Sodium" },
  description:
    "Convert existing websites into reviewed, verified, WebMCP-enabled applications.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans">
        <AsciiBackdrop />
        <div className="relative z-10">{children}</div>
        <Toaster />
        <WebAnalytics />
      </body>
    </html>
  );
}
