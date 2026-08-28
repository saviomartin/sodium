import { resetStore } from "../../../lib/store";

/** Fixture-only: resets the in-memory demo store (used by the e2e suite). */
export async function POST() {
  resetStore();
  return Response.json({ ok: true });
}
