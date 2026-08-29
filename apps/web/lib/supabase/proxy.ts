import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "../public-env";

/** Session refresh + route protection, per current Supabase Next.js guidance. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/auth/") ||
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/m/") ||
    pathname.startsWith("/api/events") ||
    pathname === "/api/internal/worker" ||
    pathname === "/api/internal/billing/reconcile" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/agent");

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
