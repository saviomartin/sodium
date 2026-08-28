"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addToCartSchema,
  cancelOrderSchema,
  contactSchema,
} from "../lib/schemas";
import { store } from "../lib/store";

/**
 * The fixture's own backend logic. Note what the bridge design preserves:
 * every action keeps its OWN validation (zod), authentication (session
 * cookie) and confirmation checks — the WebMCP layer adds nothing and
 * bypasses nothing.
 */

async function requireSession(): Promise<string> {
  const cookieStore = await cookies();
  const session = cookieStore.get("fixture_session")?.value;
  if (!session) redirect("/login");
  return session;
}

export async function submitContact(formData: FormData) {
  const parsed = contactSchema.parse(Object.fromEntries(formData));
  store().messages.push({ ...parsed, at: new Date().toISOString() });
  redirect("/contact?sent=1");
}

export async function addToCart(input: {
  productId: string;
  quantity: number;
}) {
  const parsed = addToCartSchema.parse(input);
  const product = store().products.find(
    (candidate) => candidate.id === parsed.productId,
  );
  if (!product) throw new Error(`unknown product: ${parsed.productId}`);
  if (product.stock < parsed.quantity) throw new Error("insufficient stock");
  const cart = store().cart;
  cart.set(
    parsed.productId,
    (cart.get(parsed.productId) ?? 0) + parsed.quantity,
  );
  revalidatePath("/products");
  return {
    added: parsed.quantity,
    productId: parsed.productId,
    cartSize: [...cart.values()].reduce((a, b) => a + b, 0),
  };
}

export async function cancelOrder(input: {
  orderId: string;
  confirm: boolean;
}) {
  await requireSession();
  const parsed = cancelOrderSchema.parse(input);
  // Consequential confirmation is enforced HERE, in the application backend —
  // not in the loader, not by the agent.
  if (parsed.confirm !== true) {
    throw new Error(
      "cancellation requires explicit confirmation (confirm: true)",
    );
  }
  const order = store().orders.find(
    (candidate) => candidate.id === parsed.orderId,
  );
  if (!order) throw new Error(`unknown order: ${parsed.orderId}`);
  if (order.status !== "pending")
    throw new Error(
      `only pending orders can be canceled (status: ${order.status})`,
    );
  order.status = "canceled";
  revalidatePath("/orders");
  return { orderId: order.id, status: order.status };
}

export async function signIn(formData: FormData) {
  const user = String(formData.get("user") ?? "demo");
  const cookieStore = await cookies();
  cookieStore.set("fixture_session", user, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/orders");
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete("fixture_session");
  redirect("/");
}
