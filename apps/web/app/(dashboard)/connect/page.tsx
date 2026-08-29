import { redirect } from "next/navigation";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ installation?: string; error?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ add: "1" });
  if (params.installation) query.set("installation", params.installation);
  if (params.error) query.set("error", params.error);
  redirect(`/?${query.toString()}`);
}
