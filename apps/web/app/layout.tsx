import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AsciiBackdrop } from "@/components/ascii-backdrop";
import { Toaster } from "@/components/toaster";
import { WebAnalytics } from "@/components/web-analytics";
import { NativeWebMcpTools } from "@/components/native-webmcp-tools";
import { siteUrl } from "@/lib/env";
import {
  isIndexable,
  OPEN_GRAPH,
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
} from "@/lib/seo";
import "./globals.css";

/**
 * Site-wide metadata. Everything here is a default a page may override, and
 * every value comes from `lib/seo` so the card, the crawler and the structured
 * data cannot describe the product differently.
 *
 * `metadataBase` is what makes every relative URL below resolve absolutely,
 * which social crawlers require and which is why the icon and card files can
 * be referenced by convention rather than by hand-written origin.
 *
 * The icons are not listed: `app/icon.svg`, `app/favicon.ico` and
 * `app/apple-icon.png` are picked up by file convention, as are the card
 * images. Listing them here would emit them twice.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: PUBLISHER }],
  creator: PUBLISHER,
  publisher: PUBLISHER,
  category: "technology",
  openGraph: OPEN_GRAPH,
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: isIndexable()
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
};

/** The browser chrome takes the page's own ground, which is dark everywhere. */
export const viewport: Viewport = {
  themeColor: "#191919",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <AsciiBackdrop />
        <div className="relative z-10">{children}</div>
        <NativeWebMcpTools />
        <Toaster />
        <WebAnalytics />
      </body>
    </html>
  );
}
