import "server-only";

import { customAlphabet } from "nanoid";
import Stripe from "stripe";
import type { Database } from "@sodium/contracts/database";
import { env, siteUrl } from "./env";
import { createServiceClient } from "./supabase/service";
import { hasPaidRepositoryAccess, type BillingStatus } from "./billing-state";

const integrationId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 8);
const SODIUM_BILLING_KEY = "repository_ai_v1";

export interface StripeBillingConfig {
  mode: "test" | "live";
  priceId: string;
  portalConfigurationId: string;
  webhookSecret: string;
}

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia" as Stripe.LatestApiVersion,
    appInfo: { name: "Sodium", version: "0.1.0" },
  });
  return stripeClient;
}

export function stripeBillingConfig(): StripeBillingConfig {
  if (
    !env.STRIPE_MODE ||
    !env.STRIPE_REPOSITORY_PRICE_ID ||
    !env.STRIPE_PORTAL_CONFIGURATION_ID ||
    !env.STRIPE_WEBHOOK_SECRET
  ) {
    throw new Error(
      "Stripe billing is incomplete (STRIPE_MODE, STRIPE_REPOSITORY_PRICE_ID, STRIPE_PORTAL_CONFIGURATION_ID, and STRIPE_WEBHOOK_SECRET are required)",
    );
  }
  const secretIsLive = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "");
  if ((env.STRIPE_MODE === "live") !== secretIsLive) {
    throw new Error("STRIPE_MODE does not match STRIPE_SECRET_KEY");
  }
  return {
    mode: env.STRIPE_MODE,
    priceId: env.STRIPE_REPOSITORY_PRICE_ID,
    portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  };
}

export interface RepositoryBillingOwner {
  repositoryId: string;
  orgId: string;
  userId: string;
  email: string;
  repositoryName: string;
  customerName: string;
}

export interface CanonicalSubscription {
  repositoryId: string;
  orgId: string;
  purchasedBy: string | null;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  status: BillingStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  livemode: boolean;
}

function stripeId(value: string | Stripe.Customer | Stripe.DeletedCustomer) {
  return typeof value === "string" ? value : value.id;
}

function subscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
  const supported: BillingStatus[] = [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ];
  if (!supported.includes(status as BillingStatus)) {
    throw new Error(`unsupported Stripe subscription status: ${status}`);
  }
  return status as BillingStatus;
}

export function canonicalSubscription(
  subscription: Stripe.Subscription,
  expectedPriceId: string,
): CanonicalSubscription {
  const item = subscription.items.data[0];
  if (
    subscription.items.data.length !== 1 ||
    item?.price.id !== expectedPriceId ||
    subscription.metadata.sodium_key !== SODIUM_BILLING_KEY
  ) {
    throw new Error("subscription is not a Sodium repository subscription");
  }
  const repositoryId = subscription.metadata.repository_id;
  const orgId = subscription.metadata.org_id;
  if (!repositoryId || !orgId) {
    throw new Error("subscription is missing repository metadata");
  }
  const periodEnd = item.current_period_end;
  return {
    repositoryId,
    orgId,
    purchasedBy: subscription.metadata.purchased_by || null,
    customerId: stripeId(subscription.customer),
    subscriptionId: subscription.id,
    priceId: item.price.id,
    status: subscriptionStatus(subscription.status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodEnd: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
    livemode: subscription.livemode,
  };
}

export async function createRepositoryCheckout(
  owner: RepositoryBillingOwner,
): Promise<string> {
  const config = stripeBillingConfig();
  const service = createServiceClient();
  const client = stripe();
  const { data: current, error: readError } = await service
    .from("repository_billing")
    .select("*")
    .eq("repository_id", owner.repositoryId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (hasPaidRepositoryAccess(current?.status)) {
    return `${siteUrl()}/repos/${owner.repositoryId}?billing=active`;
  }

  if (
    current?.stripe_checkout_session_id &&
    current.stripe_checkout_expires_at &&
    new Date(current.stripe_checkout_expires_at).getTime() > Date.now()
  ) {
    const existing = await client.checkout.sessions.retrieve(
      current.stripe_checkout_session_id,
    );
    if (
      existing.status === "open" &&
      existing.url &&
      existing.allow_promotion_codes
    ) {
      return existing.url;
    }
    if (existing.status === "open") {
      // Promotion-code support is fixed when Checkout is created. Retire an
      // older code-less session instead of reusing it for up to 23 hours after
      // this feature ships. A concurrent request may expire it first.
      try {
        await client.checkout.sessions.expire(existing.id);
      } catch (error) {
        const refreshed = await client.checkout.sessions.retrieve(existing.id);
        if (refreshed.status === "open") throw error;
      }
    }
  }

  let customerId = current?.stripe_customer_id;
  if (!customerId) {
    const customer = await client.customers.create(
      {
        email: owner.email || undefined,
        name: owner.customerName || undefined,
        description: `Sodium billing for ${owner.repositoryName}`,
        metadata: {
          sodium_key: SODIUM_BILLING_KEY,
          repository_id: owner.repositoryId,
          org_id: owner.orgId,
          purchased_by: owner.userId,
        },
      },
      { idempotencyKey: `sodium-customer-${owner.repositoryId}` },
    );
    customerId = customer.id;
    const { error } = await service.from("repository_billing").upsert(
      {
        repository_id: owner.repositoryId,
        org_id: owner.orgId,
        purchased_by: owner.userId,
        stripe_customer_id: customerId,
        status: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "repository_id" },
    );
    if (error) throw new Error(error.message);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 23 * 60 * 60;
  const session = await client.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: config.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: owner.repositoryId,
      success_url: `${siteUrl()}/billing/return?repository_id=${owner.repositoryId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/repos/${owner.repositoryId}?checkout=canceled`,
      expires_at: expiresAt,
      metadata: {
        sodium_key: SODIUM_BILLING_KEY,
        repository_id: owner.repositoryId,
        org_id: owner.orgId,
        purchased_by: owner.userId,
      },
      subscription_data: {
        description: `Sodium AI tools for ${owner.repositoryName}`,
        metadata: {
          sodium_key: SODIUM_BILLING_KEY,
          repository_id: owner.repositoryId,
          org_id: owner.orgId,
          purchased_by: owner.userId,
        },
      },
      integration_identifier: `sodium_repo_${integrationId()}`,
    },
    {
      idempotencyKey: `sodium-checkout-${owner.repositoryId}-${Math.floor(Date.now() / 10_000)}`,
    },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  const { error } = await service
    .from("repository_billing")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_checkout_expires_at: new Date(expiresAt * 1000).toISOString(),
      stripe_price_id: config.priceId,
      status: "incomplete",
      updated_at: new Date().toISOString(),
    })
    .eq("repository_id", owner.repositoryId)
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
  return session.url;
}

export async function createRepositoryPortal(
  repositoryId: string,
  customerId: string,
): Promise<string> {
  const config = stripeBillingConfig();
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    configuration: config.portalConfigurationId,
    return_url: `${siteUrl()}/repos/${repositoryId}`,
  });
  return session.url;
}

export async function applyCanonicalSubscription(
  event: Pick<Stripe.Event, "id" | "type" | "livemode">,
  subscription: CanonicalSubscription,
  checkoutSessionId: string | null,
) {
  const expectedLive = stripeBillingConfig().mode === "live";
  if (
    event.livemode !== expectedLive ||
    subscription.livemode !== expectedLive
  ) {
    throw new Error("Stripe event mode does not match this deployment");
  }
  const service = createServiceClient();
  const { data: repository, error: repositoryError } = await service
    .from("repositories")
    .select("org_id")
    .eq("id", subscription.repositoryId)
    .maybeSingle();
  if (repositoryError) throw new Error(repositoryError.message);
  // Account deletion cancels Stripe first, then deletes the repository. The
  // resulting asynchronous cancellation event is valid but has no projection
  // left to update, so acknowledge it instead of retrying forever.
  if (!repository) return false;
  if (repository.org_id !== subscription.orgId) {
    throw new Error("billing repository mismatch");
  }
  const { data: current, error: currentError } = await service
    .from("repository_billing")
    .select("stripe_subscription_id, status")
    .eq("repository_id", subscription.repositoryId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (
    current?.stripe_subscription_id &&
    current.stripe_subscription_id !== subscription.subscriptionId
  ) {
    if (
      hasPaidRepositoryAccess(current.status) &&
      hasPaidRepositoryAccess(subscription.status)
    ) {
      await stripe().subscriptions.cancel(subscription.subscriptionId, {
        prorate: false,
      });
    }
    if (
      hasPaidRepositoryAccess(current.status) ||
      !hasPaidRepositoryAccess(subscription.status)
    ) {
      return false;
    }
  }
  const { data, error } = await service.rpc("apply_repository_billing_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_repository_id: subscription.repositoryId,
    p_org_id: subscription.orgId,
    p_purchased_by: subscription.purchasedBy as never,
    p_stripe_customer_id: subscription.customerId,
    p_stripe_subscription_id: subscription.subscriptionId,
    p_stripe_checkout_session_id: checkoutSessionId as never,
    p_stripe_price_id: subscription.priceId,
    p_status: subscription.status,
    p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
    p_current_period_end: subscription.currentPeriodEnd as never,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelSubscriptionsForUser(userId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("repository_billing")
    .select("stripe_subscription_id, status, organizations!inner(created_by)")
    .eq("organizations.created_by", userId)
    .not("stripe_subscription_id", "is", null);
  if (error) throw new Error(error.message);
  for (const billing of data ?? []) {
    if (
      billing.stripe_subscription_id &&
      billing.status !== "canceled" &&
      billing.status !== "incomplete_expired"
    ) {
      await stripe().subscriptions.cancel(billing.stripe_subscription_id, {
        prorate: false,
      });
    }
  }
}

/** Repairs state if Stripe exhausted webhook delivery retries. */
export async function reconcileRepositorySubscriptions() {
  const config = stripeBillingConfig();
  const expectedLive = config.mode === "live";
  const service = createServiceClient();
  const client = stripe();
  let checked = 0;
  let updated = 0;
  let failed = 0;

  for (let offset = 0; ; offset += 100) {
    const { data: rows, error } = await service
      .from("repository_billing")
      .select(
        "repository_id, org_id, stripe_subscription_id, stripe_checkout_session_id, status",
      )
      .or(
        "stripe_subscription_id.not.is.null,stripe_checkout_session_id.not.is.null",
      )
      .order("repository_id")
      .range(offset, offset + 99);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;

    for (const row of rows) {
      checked += 1;
      try {
        let subscriptionId = row.stripe_subscription_id;
        let checkoutSessionId: string | null = null;
        if (!subscriptionId && row.stripe_checkout_session_id) {
          const checkout = await client.checkout.sessions.retrieve(
            row.stripe_checkout_session_id,
          );
          checkoutSessionId = checkout.id;
          subscriptionId =
            typeof checkout.subscription === "string"
              ? checkout.subscription
              : (checkout.subscription?.id ?? null);
        }
        if (!subscriptionId) continue;
        const canonical = canonicalSubscription(
          await client.subscriptions.retrieve(subscriptionId),
          config.priceId,
        );
        if (
          canonical.livemode !== expectedLive ||
          canonical.repositoryId !== row.repository_id ||
          canonical.orgId !== row.org_id
        ) {
          throw new Error("reconciliation metadata mismatch");
        }
        const { error: updateError } = await service
          .from("repository_billing")
          .update({
            stripe_customer_id: canonical.customerId,
            stripe_subscription_id: canonical.subscriptionId,
            stripe_checkout_session_id:
              checkoutSessionId ?? row.stripe_checkout_session_id,
            stripe_price_id: canonical.priceId,
            status: canonical.status,
            cancel_at_period_end: canonical.cancelAtPeriodEnd,
            current_period_end: canonical.currentPeriodEnd,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("repository_id", row.repository_id);
        if (updateError) throw new Error(updateError.message);
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error("Stripe subscription reconciliation failed", {
          repositoryId: row.repository_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (rows.length < 100) break;
  }
  return { checked, updated, failed };
}

export type RepositoryBillingRow =
  Database["public"]["Tables"]["repository_billing"]["Row"];
