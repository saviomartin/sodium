import type { Metadata } from "next";
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
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <WebAnalytics />
      </body>
    </html>
  );
}
