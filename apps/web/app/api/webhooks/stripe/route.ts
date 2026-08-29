import type Stripe from "stripe";
import {
  applyCanonicalSubscription,
  canonicalSubscription,
  stripe,
  stripeBillingConfig,
} from "@/lib/stripe";

export const runtime = "nodejs";

function objectId(value: unknown, prefix: string): string | null {
  if (typeof value === "string" && value.startsWith(prefix)) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.startsWith(prefix)
  ) {
    return value.id;
  }
  return null;
}

function subscriptionIdFromObject(object: unknown): string | null {
  if (!object || typeof object !== "object") return null;
  const record = object as Record<string, unknown>;
  const direct = objectId(record.subscription, "sub_");
  if (direct) return direct;
  const parent = record.parent;
  if (parent && typeof parent === "object") {
    const details = (parent as Record<string, unknown>).subscription_details;
    if (details && typeof details === "object") {
      return objectId(
        (details as Record<string, unknown>).subscription,
        "sub_",
      );
    }
  }
  return null;
}

function checkoutSessionId(event: Stripe.Event): string | null {
  return event.type.startsWith("checkout.session.")
    ? objectId(event.data.object, "cs_")
    : null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe().webhooks.constructEvent(
      body,
      signature,
      stripeBillingConfig().webhookSecret,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `invalid Stripe webhook: ${error.message}`
            : "invalid Stripe webhook",
      },
      { status: 400 },
    );
  }

  try {
    let subscriptionId: string | null;
    if (event.type.startsWith("customer.subscription.")) {
      subscriptionId = objectId(event.data.object, "sub_");
    } else if (
      event.type.startsWith("checkout.session.") ||
      event.type.startsWith("invoice.")
    ) {
      subscriptionId = subscriptionIdFromObject(event.data.object);
    } else {
      return Response.json({ received: true, ignored: true });
    }
    if (!subscriptionId) {
      return Response.json({ received: true, ignored: true });
    }

    const subscription = await stripe().subscriptions.retrieve(subscriptionId);
    const canonical = canonicalSubscription(
      subscription,
      stripeBillingConfig().priceId,
    );
    const applied = await applyCanonicalSubscription(
      event,
      canonical,
      checkoutSessionId(event),
    );
    return Response.json({ received: true, applied });
  } catch (error) {
    // Foreign Stripe objects are intentionally ignored. Metadata and price
    // validation prevent another product from granting Sodium access.
    if (
      error instanceof Error &&
      error.message === "subscription is not a Sodium repository subscription"
    ) {
      return Response.json({ received: true, ignored: true });
    }
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      error,
    });
    return Response.json(
      { error: "Stripe webhook processing failed" },
      { status: 500 },
    );
  }
}
