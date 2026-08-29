import { redirect } from "next/navigation";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ add: "1" });
  if (params.error) query.set("error", params.error);
  redirect(`/?${query.toString()}`);
}
