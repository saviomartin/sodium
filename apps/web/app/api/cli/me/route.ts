import { authenticateApiToken } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const ownerId = await authenticateApiToken(request);
  if (!ownerId)
    return Response.json({ error: "invalid API token" }, { status: 401 });

  const { data, error } = await createServiceClient().auth.admin.getUserById(
    ownerId,
  );
  if (error || !data.user?.email)
    return Response.json({ error: "account not found" }, { status: 404 });

  return Response.json({ id: data.user.id, email: data.user.email });
}
