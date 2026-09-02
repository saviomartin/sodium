import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pathWithError, safeNextPath } from "@/lib/safe-next";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (!code) {
    const message =
      request.nextUrl.searchParams.get("error_description") ??
      "Sign-in was cancelled";
    const key = next.startsWith("/activate") ? "authError" : "error";
    return NextResponse.redirect(
      new URL(pathWithError(next, key, message), request.nextUrl.origin),
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const key = next.startsWith("/activate") ? "authError" : "error";
    return NextResponse.redirect(
      new URL(pathWithError(next, key, error.message), request.nextUrl.origin),
    );
  }
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
