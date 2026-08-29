"use client";

import { useFormStatus } from "react-dom";
import { trackProductEvent } from "@/lib/product-analytics";
import { buttonClass } from "./ui";

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={buttonClass}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Opening GitHub…" : "Continue with GitHub"}
    </button>
  );
}

export function GithubSignInForm({
  action,
  next,
}: {
  action: (formData: FormData) => Promise<void>;
  next: string;
}) {
  return (
    <form
      action={action}
      className="mt-5"
      onSubmit={() => trackProductEvent({ name: "GitHub Sign In Started" })}
    >
      <input type="hidden" name="next" value={next} />
      <SignInButton />
    </form>
  );
}
