import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!code) {
    const message =
      request.nextUrl.searchParams.get("error_description") ??
      "GitHub sign-in was cancelled";
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(message)}`, request.nextUrl.origin),
    );
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent(error.message)}`,
        request.nextUrl.origin,
      ),
    );
  }
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
