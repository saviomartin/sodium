"use client";

import { useState } from "react";
import { secondaryButtonClass } from "./ui";

export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre className="overflow-x-auto rounded bg-neutral-900 p-3 text-xs text-neutral-100">
        {snippet}
      </pre>
      <button
        type="button"
        className={`${secondaryButtonClass} mt-2`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard unavailable; user can select the text manually.
          }
        }}
      >
        {copied ? "Copied" : "Copy snippet"}
      </button>
    </div>
  );
}
