import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold text-balance">Sodium</h1>
        <p className="mt-1 text-sm text-neutral-500 text-pretty">
          Turn an existing site into a reviewed, verified, WebMCP-enabled
          application.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-xs text-neutral-400 text-pretty">
        Local development seed accounts: alice@acme.test (owner),
        carol@acme.test (member), bob@globex.test — password
        &ldquo;password123&rdquo;.
      </p>
    </main>
  );
}
