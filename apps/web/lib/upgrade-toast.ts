"use client";

import { toast } from "sonner";

/**
 * Paywalled controls stay live for everyone. Pressing one without a
 * subscription says what the subscription buys instead of presenting dead UI,
 * which reads as a broken page rather than as a locked feature.
 *
 * One shared id so a run of clicks replaces the toast rather than stacking it.
 */
export function notifyUpgradeRequired(action: string): void {
  toast.error("Subscription required", {
    id: "upgrade-required",
    description: `Subscribe to this repository to ${action}.`,
  });
}
