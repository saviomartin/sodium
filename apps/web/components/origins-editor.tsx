"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSiteOriginsAction } from "@/lib/actions";
import { trackProductEvent } from "@/lib/product-analytics";
import { inputClass, secondaryButtonClass } from "./ui";
import { useRepositorySettingsState } from "./repository-settings-state";

export function OriginsEditor({
  siteId,
  initialOrigins,
  locked = false,
}: {
  siteId: string;
  initialOrigins: string[];
  locked?: boolean;
}) {
  const router = useRouter();
  const { beginEdit, endEdit } = useRepositorySettingsState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [origins, setOrigins] = useState(initialOrigins);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
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
          className="mb-1 block text-xs font-medium text-neutral-600"
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
            disabled={locked || pending}
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
            disabled={locked || pending}
            onClick={addOrigin}
          >
            {pending ? "Saving…" : "Add"}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-400 text-pretty">
          Exact origin only, including scheme and optional port.
        </p>
      </div>

      <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {origins.map((origin) => (
          <li
            key={origin}
            className="flex min-h-10 items-center justify-between gap-3 px-3 py-2"
          >
            <span className="min-w-0 truncate font-mono text-xs">{origin}</span>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-neutral-500 hover:text-red-700 disabled:opacity-50"
              disabled={locked || pending || origins.length === 1}
              aria-label={`Remove ${origin}`}
              title={
                locked
                  ? "Subscribe to manage allowed origins"
                  : origins.length === 1
                    ? "At least one allowed origin is required"
                    : undefined
              }
              onClick={() => persist(origins.filter((item) => item !== origin))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-red-700 text-pretty">
          {error}
        </p>
      ) : saved ? (
        <p role="status" className="text-sm text-green-700">
          Saved. Republish to make this live.
        </p>
      ) : null}
    </div>
  );
}
