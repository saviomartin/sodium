import { redirect } from "next/navigation";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { createClient, currentUserId } from "@/lib/supabase/server";

const ReturnSchema = z.object({
  repository_id: z.string().uuid(),
  session_id: z.string().startsWith("cs_"),
});

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = ReturnSchema.safeParse(await searchParams);
  if (!input.success) redirect("/?billing=invalid_return");
  const userId = await currentUserId();
  if (!userId) {
    redirect(
      `/?next=${encodeURIComponent(`/billing/return?repository_id=${input.data.repository_id}&session_id=${input.data.session_id}`)}`,
    );
  }
  const supabase = await createClient();
  const { data: repository } = await supabase
    .from("repositories")
    .select("id")
    .eq("id", input.data.repository_id)
    .maybeSingle();
  if (!repository) redirect("/?billing=repository_not_found");

  const session = await stripe().checkout.sessions.retrieve(
    input.data.session_id,
  );
  if (
    session.client_reference_id !== repository.id ||
    session.metadata?.repository_id !== repository.id ||
    session.metadata?.purchased_by !== userId
  ) {
    redirect(`/repos/${repository.id}?checkout=invalid`);
  }
  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  redirect(`/repos/${repository.id}?checkout=${paid ? "success" : "pending"}`);
}
