"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";

/**
 * A header link to a section of the home page.
 *
 * `next/link` treats a click on the URL you are already at as a no-op, so once
 * the address bar reads `/#faq` the FAQ link goes dead: scroll away, click it,
 * and nothing moves. Only that case is intercepted here — the hash already
 * matches, so there is nothing to push, just a scroll to redo. Every other
 * click, including the navigation home from a dashboard route, stays with
 * Link.
 *
 * `scrollIntoView` with no arguments scrolls at the element's computed
 * `scroll-behavior`, which means it inherits the smooth scroll set on <html>
 * and drops back to an instant jump under `prefers-reduced-motion` without
 * knowing either rule exists.
 */
export function SectionLink({
  href,
  className,
  children,
}: {
  /** An absolute in-page anchor, e.g. `/#pricing`. */
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const id = href.split("#")[1];

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (!id || window.location.hash !== `#${id}`) return;
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView();
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
