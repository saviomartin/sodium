/**
 * What Sodium sells, in one place.
 *
 * The pricing dialog on a repository page and the pricing section on the home
 * page quote the same number and the same list, so the two surfaces cannot
 * drift apart as the plan changes.
 */

export const REPOSITORY_PRICE_USD = 49;

export const REPOSITORY_PLAN_FEATURES = [
  "Unlimited tools per repository",
  "Automatic re-analysis on every push",
  "Tool definitions you can edit, version, and roll back",
  "Agent analytics included",
  "Personal support on Discord",
] as const;

/** Enterprise is a conversation, not a checkout. */
export const ENTERPRISE_PLAN_FEATURES = [
  "Unlimited repositories under one contract",
  "Advanced agent analytics",
  "Custom infrastructure for your architecture",
  "Tailored onboarding plan",
  "Rollout strategy",
  "Early access to new features",
  "Priority support in a shared Slack channel",
] as const;

export const ENTERPRISE_URL = "https://cal.com/team/result/enterprise";

/** Where anything the FAQ does not answer gets asked. */
export const DISCORD_URL = "https://discord.gg/tDkwJcbgTF";
