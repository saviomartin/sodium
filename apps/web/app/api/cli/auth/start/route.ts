import { createServiceClient } from "@/lib/supabase/service";
import { siteUrl } from "@/lib/env";
import { newDeviceCode, newUserCode, sha256 } from "@/lib/server-crypto";

export const runtime = "nodejs";

export async function POST() {
  const service = createServiceClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const deviceCode = newDeviceCode();
    const userCode = newUserCode();
    const expiresIn = 600;
    const { error } = await service.from("cli_auth_requests").insert({
      device_hash: sha256(deviceCode),
      user_code: userCode,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });
    if (!error) {
      const verificationUrl = new URL("/activate", siteUrl());
      verificationUrl.searchParams.set("code", userCode);
      return Response.json({
        deviceCode,
        userCode,
        verificationUrl: verificationUrl.toString(),
        expiresIn,
        interval: 2,
      });
    }
    if (error.code !== "23505") {
      console.error("CLI auth start failed", {
        code: error.code,
        message: error.message,
      });
      break;
    }
  }
  return Response.json({ error: "could not start CLI login" }, { status: 503 });
}
