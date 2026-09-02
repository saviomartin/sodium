"use client";

import { useFormStatus } from "react-dom";
import { trackProductEvent } from "@/lib/product-analytics";
import { CircleNotchIcon, GithubMarkIcon, GoogleMarkIcon } from "./icons";

type OAuthProvider = "github" | "google";

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

function SignInButton({
  className,
  label,
  provider,
}: {
  className: string;
  label: string;
  provider: OAuthProvider;
}) {
  const { pending } = useFormStatus();
  const providerLabel = PROVIDER_LABEL[provider];

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <CircleNotchIcon
          aria-hidden
          weight="bold"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : provider === "google" ? (
        <GoogleMarkIcon aria-hidden className="size-4 shrink-0" />
      ) : (
        <GithubMarkIcon aria-hidden className="size-4 shrink-0" />
      )}
      {pending ? `Opening ${providerLabel}…` : label}
    </button>
  );
}

export function OAuthSignInForm({
  action,
  next,
  provider,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  next: string;
  provider: OAuthProvider;
  className: string;
}) {
  const providerLabel = PROVIDER_LABEL[provider];

  return (
    <form
      action={action}
      onSubmit={() =>
        trackProductEvent({
          name:
            provider === "google"
              ? "Google Sign In Started"
              : "GitHub Sign In Started",
        })
      }
    >
      <input type="hidden" name="next" value={next} />
      <SignInButton
        className={className}
        label={`Continue with ${providerLabel}`}
        provider={provider}
      />
    </form>
  );
}
