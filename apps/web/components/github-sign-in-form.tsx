"use client";

import { useFormStatus } from "react-dom";
import { trackProductEvent } from "@/lib/product-analytics";
import { buttonClass, CtaArrow } from "./ui";
import { CircleNotchIcon, GithubLogoIcon } from "./icons";

function SignInButton({
  className,
  label,
  mark,
}: {
  className: string;
  label: string;
  mark: "arrow" | "github";
}) {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <button type="submit" className={className} disabled aria-busy>
        <CircleNotchIcon
          aria-hidden
          weight="bold"
          className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
        Opening GitHub…
      </button>
    );
  }

  return (
    <button type="submit" className={className}>
      {mark === "github" && (
        <GithubLogoIcon aria-hidden weight="fill" className="size-4 shrink-0" />
      )}
      {label}
      {mark === "arrow" && <CtaArrow />}
    </button>
  );
}

export function GithubSignInForm({
  action,
  next,
  className = buttonClass,
  formClassName = "",
  label = "Continue with GitHub",
  mark = "arrow",
}: {
  action: (formData: FormData) => Promise<void>;
  next: string;
  className?: string;
  formClassName?: string;
  /** Button copy. Distinct per placement so tests and users can tell them apart. */
  label?: string;
  /** A trailing arrow for a call to action, a leading logo when space is tight. */
  mark?: "arrow" | "github";
}) {
  return (
    <form
      action={action}
      className={formClassName}
      onSubmit={() => trackProductEvent({ name: "GitHub Sign In Started" })}
    >
      <input type="hidden" name="next" value={next} />
      <SignInButton className={className} label={label} mark={mark} />
    </form>
  );
}
