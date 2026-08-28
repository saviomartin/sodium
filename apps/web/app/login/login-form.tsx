"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signInAction, signUpAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  buttonClass,
  Field,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";

export function LoginForm() {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div
        className="mb-4 flex gap-2"
        role="tablist"
        aria-label="Authentication mode"
      >
        <button
          role="tab"
          aria-selected={mode === "sign_in"}
          className={mode === "sign_in" ? buttonClass : secondaryButtonClass}
          onClick={() => setMode("sign_in")}
          type="button"
        >
          Sign in
        </button>
        <button
          role="tab"
          aria-selected={mode === "sign_up"}
          className={mode === "sign_up" ? buttonClass : secondaryButtonClass}
          onClick={() => setMode("sign_up")}
          type="button"
        >
          Create account
        </button>
      </div>
      <ActionForm
        action={mode === "sign_in" ? signInAction : signUpAction}
        className="space-y-3"
      >
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            required
            autoComplete={
              mode === "sign_in" ? "current-password" : "new-password"
            }
            className={inputClass}
          />
        </Field>
        <SubmitButton
          className={`${buttonClass} w-full`}
          pendingText="Signing in…"
        >
          {mode === "sign_in" ? "Sign in" : "Create account"}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
