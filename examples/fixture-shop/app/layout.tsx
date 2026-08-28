import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SodiumAgent } from "../sodium/SodiumAgent";
import { signOut } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acme Shop (fixture)",
  description:
    "Sample Next.js application used to prove the sodium end-to-end path.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const signedIn = Boolean(cookieStore.get("fixture_session")?.value);

  return (
    <html lang="en">
      <body className="mx-auto max-w-2xl px-4 py-6 font-sans">
        <SodiumAgent />
        <header
          className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-3"
          {...(signedIn ? { "data-signed-in": "true" } : {})}
        >
          <nav className="flex gap-4 text-sm">
            <Link href="/">Acme Shop</Link>
            <Link href="/products">Products</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/orders">Orders</Link>
          </nav>
          {signedIn ? (
            <form action={signOut}>
              <button className="text-sm text-neutral-500" type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-sm text-neutral-500">
              Sign in
            </Link>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
