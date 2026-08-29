"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSiteOriginsAction } from "@/lib/actions";
import { trackProductEvent } from "@/lib/product-analytics";
import { usePaywall } from "./repository-paywall";
import { inputClass, secondaryButtonClass } from "./ui";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  GlobeIcon,
  PlusIcon,
  WarningCircleIcon,
  XIcon,
} from "./icons";
import { useRepositorySettingsState } from "./repository-settings-state";

export function OriginsEditor({
  siteId,
  initialOrigins,
}: {
  siteId: string;
  initialOrigins: string[];
}) {
  const router = useRouter();
  const { requireSubscription } = usePaywall();
  const { beginEdit, endEdit } = useRepositorySettingsState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [origins, setOrigins] = useState(initialOrigins);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
    if (!requireSubscription("manage allowed origins")) return;
    setError(null);
    setSaved(false);
    beginEdit();
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("siteId", siteId);
        data.set("origins", next.join("\n"));
        const result = await updateSiteOriginsAction(null, data);
        if (!result.ok) {
          setError(result.error ?? "Origins could not be saved.");
          return;
        }
        setOrigins(next);
        setSaved(true);
        trackProductEvent({
          name: "Allowed Origins Updated",
          properties: { count: next.length },
        });
        router.refresh();
      } finally {
        endEdit();
      }
    });
  }

  function addOrigin() {
    const value = inputRef.current?.value.trim() ?? "";
    if (!value) return;
    let normalized: string;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setError("Use an http:// or https:// origin.");
        return;
      }
      normalized = url.origin;
    } catch {
      setError("Enter a valid origin, including https:// or http://.");
      return;
    }
    if (normalized !== value) {
      setError("Use only the origin: scheme://host and optional port.");
      return;
    }
    if (origins.includes(normalized)) {
      setError("That origin is already allowed.");
      return;
    }
    if (origins.length >= 8) {
      setError("You can allow up to 8 origins.");
      return;
    }
    persist([...origins, normalized]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`origin-${siteId}`}
          className="mb-1 block text-xs font-medium text-neutral-400"
        >
          Add an origin
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={`origin-${siteId}`}
            type="url"
            className={inputClass}
            placeholder="https://app.example.com"
            disabled={pending}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addOrigin();
              }
            }}
          />
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending}
            onClick={addOrigin}
          >
            {pending ? (
              <>
                <CircleNotchIcon
                  aria-hidden
                  weight="bold"
                  className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : (
              <>
                <PlusIcon
                  aria-hidden
                  weight="bold"
                  className="size-4 shrink-0"
                />
                Add
              </>
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-faint text-pretty">
          Exact origin only, including scheme and optional port.
        </p>
      </div>

      {origins.length > 0 ? (
        <ul className="divide-y divide-white/[0.07] rounded-md border border-white/10">
          {origins.map((origin) => (
            <li
              key={origin}
              className="flex min-h-10 items-center justify-between gap-3 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                <GlobeIcon
                  aria-hidden
                  weight="fill"
                  className="size-3.5 shrink-0 text-faint"
                />
                {/* Its own box: `truncate` needs a block to ellipsize, and as a
                    flex item its hidden overflow also lets it shrink past the
                    origin's min-content width instead of widening the row. */}
                <span className="truncate">{origin}</span>
              </span>
              <button
                type="button"
                className="-mr-1 inline-flex min-h-6 shrink-0 items-center gap-1 rounded px-1 text-xs font-medium text-neutral-400 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
                disabled={pending || origins.length === 1}
                aria-label={`Remove ${origin}`}
                title={
                  origins.length === 1
                    ? "At least one allowed origin is required"
                    : undefined
                }
                onClick={() =>
                  persist(origins.filter((item) => item !== origin))
                }
              >
                <XIcon aria-hidden weight="bold" className="size-3.5" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-sm text-red-400 text-pretty"
        >
          <WarningCircleIcon
            aria-hidden
            weight="fill"
            className="mt-0.5 size-4 shrink-0"
          />
          {error}
        </p>
      ) : saved ? (
        <p
          role="status"
          className="flex items-center gap-1.5 text-sm text-emerald-400"
        >
          <CheckCircleIcon
            aria-hidden
            weight="fill"
            className="size-4 shrink-0"
          />
          Saved. Republish to make this live.
        </p>
      ) : null}
    </div>
  );
}
