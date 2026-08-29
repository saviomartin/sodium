"use client";

import type { CSSProperties } from "react";
import { Toaster as SonnerToaster } from "sonner";

/**
 * Sonner, dressed in the app's ink palette. Colours are handed over as the
 * variables sonner already reads, so its own stylesheet stays untouched and
 * light/rich-colour defaults never leak into a dark surface.
 */
const toastTheme = {
  "--normal-bg": "var(--color-panel)",
  "--normal-border": "rgba(255, 255, 255, 0.12)",
  "--normal-text": "var(--color-neutral-100)",
  "--error-bg": "color-mix(in srgb, var(--color-red-500) 15%, #191919)",
  "--error-border": "color-mix(in srgb, var(--color-red-500) 30%, transparent)",
  "--error-text": "var(--color-red-300)",
  "--success-bg": "color-mix(in srgb, var(--color-emerald-500) 15%, #191919)",
  "--success-border":
    "color-mix(in srgb, var(--color-emerald-500) 30%, transparent)",
  "--success-text": "var(--color-emerald-300)",
} as CSSProperties;

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      richColors
      position="bottom-right"
      style={toastTheme}
      toastOptions={{
        className: "font-sans",
        classNames: { description: "opacity-80" },
      }}
    />
  );
}
