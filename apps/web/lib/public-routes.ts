export function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/") ||
    pathname === "/" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/login" ||
    pathname === "/activate" ||
    pathname.startsWith("/api/cli/") ||
    pathname.startsWith("/api/events") ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/schema/")
  );
}
