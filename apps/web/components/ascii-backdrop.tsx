"use client";

import { useEffect, useRef } from "react";

/**
 * The ASCII field behind every page.
 *
 * The canvas stays viewport-sized and fixed, but samples the field at an
 * offset derived from scrollY — so the texture scrolls with the document
 * without ever allocating a document-height backing store. Each row is drawn
 * as one string per alpha bucket, which is a few hundred `fillText` calls a
 * frame instead of tens of thousands.
 */

/**
 * Code-ish alphabet. The character for a cell is hashed from its world
 * position, not its brightness, so the plane reads as a fixed wall of text
 * that you scroll past rather than a shifting dot pattern.
 */
const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]()<>/=+*-_;:.";
const WORDS = ["SODIUM", "RESULT", "AGENTS", "WEBMCP", "TOOLS", "MANIFEST"];
const FONT_SIZE = 10;
const LINE_HEIGHT = 12;
/** Opaque, so what is drawn is exactly what is specified over the ink page. */
const SHADES = ["#222222", "#272727", "#2d2d2d", "#333333"];
const WORD_SHADE = "#3a3a3a";
const BUCKETS = SHADES.length;
const VISIBLE_AT = 0.34;
/** One word roughly every N rows. */
const WORD_SPACING = 13;
/** Barely-moving drift: a full cycle takes many minutes, not seconds. */
const SPEED = 0.0000018;
/** Nothing perceptible happens between ticks, so idle redraws stay rare. */
const IDLE_FRAME_MS = 1000 / 2;
const STATIC_FRAME = 12_000;
const MONO_FALLBACK = "ui-monospace, monospace";

/** Stable per-cell scramble, so a world position always gets the same char. */
function hash2(row: number, col: number) {
  let h =
    Math.imul(row ^ 0x9e3779b9, 2654435761) ^
    Math.imul(col + 0x85ebca6b, 2246822507);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Stable per-row scramble, so a given world row always gets the same word. */
function hash(n: number) {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function AsciiBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Match the mono face the rest of the app uses.
    const mono =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-geist-mono")
        .trim() || MONO_FALLBACK;
    const font = `${FONT_SIZE}px ${mono}, ${MONO_FALLBACK}`;

    let cols = 0;
    let rows = 0;
    let cellW = 7;
    let width = 0;
    let height = 0;
    let dim = 1;
    let layers: string[][] = [];
    let used: boolean[] = [];
    let warpCol = new Float32Array(0);
    let raf = 0;
    let lastFrame = 0;
    let lastScroll = -1;

    const measure = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width === 0 || height === 0) return false;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Resizing the backing store resets context state, so restore it here.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = font;
      ctx.textBaseline = "top";

      // Pitch the grid to the font's own advance width so a row drawn as one
      // string lands every glyph exactly on a cell.
      cellW = ctx.measureText("M").width || FONT_SIZE * 0.6;
      cols = Math.ceil(width / cellW) + 1;
      rows = Math.ceil(height / LINE_HEIGHT) + 2;
      // Word layer is the last one, drawn a touch brighter.
      layers = Array.from({ length: BUCKETS + 1 }, () =>
        new Array<string>(cols).fill(" "),
      );
      used = new Array<boolean>(BUCKETS + 1).fill(false);
      warpCol = new Float32Array(cols);
      // Text runs edge to edge on narrow viewports, so ease off there.
      dim = width < 768 ? 0.7 : 1;
      return true;
    };

    const render = (time: number, scroll: number) => {
      if (cols === 0 || rows === 0) return;
      const t = time * SPEED;
      const rowShift = Math.floor(scroll / LINE_HEIGHT);
      const pixelShift = scroll - rowShift * LINE_HEIGHT;
      const wordLayer = layers[BUCKETS]!;

      // Depends only on the column and the clock, so it is hoisted out of the
      // per-cell loop — one trig call per column instead of per cell.
      for (let c = 0; c < cols; c++) {
        warpCol[c] = Math.cos(c * 0.09 - t * 1.4) * 0.7;
      }

      ctx.clearRect(0, 0, width, height);

      for (let r = 0; r < rows; r++) {
        const worldRow = r + rowShift;
        for (let l = 0; l <= BUCKETS; l++) {
          layers[l]!.fill(" ");
          used[l] = false;
        }

        // Stamp a word first; the field then fills in around it.
        const h = hash(worldRow);
        if (h % WORD_SPACING === 0) {
          const word = WORDS[h % WORDS.length]!;
          const start = (h >>> 9) % Math.max(1, cols - word.length);
          for (let k = 0; k < word.length; k++) {
            wordLayer[start + k] = word[k]!;
          }
          used[BUCKETS] = true;
        }

        const y = worldRow * 0.22;
        const wx = Math.sin(worldRow * 0.13 + t * 1.9) * 0.8;
        const yTerm = y * 1.15 - t * 1.6;
        for (let c = 0; c < cols; c++) {
          if (wordLayer[c] !== " ") continue;
          const x = c * 0.16;
          const field =
            Math.sin(x + wx + t * 2.1) +
            Math.sin(yTerm + warpCol[c]!) +
            Math.sin((x + y) * 0.42 + t * 1.1) +
            // Fine octave, cross-grained: without it neighbouring cells land
            // on the same glyph and the grid reads as scanlines.
            Math.sin(x * 2.7 - y * 1.9 + t * 2.6) * 0.7;
          // 0..1, smooth. Low values stay blank, which is what gives the grid
          // its ASCII-art texture rather than an even wash.
          const level = ((field / 3.7) * 0.5 + 0.5) * dim;
          if (level < VISIBLE_AT) continue;
          const b = Math.min(BUCKETS - 1, (level * BUCKETS) | 0);
          layers[b]![c] = CHARS[hash2(worldRow, c) % CHARS.length]!;
          used[b] = true;
        }

        const py = r * LINE_HEIGHT - pixelShift;
        for (let l = 0; l <= BUCKETS; l++) {
          if (!used[l]) continue;
          ctx.fillStyle = l === BUCKETS ? WORD_SHADE : SHADES[l]!;
          ctx.fillText(layers[l]!.join(""), 0, py);
        }
      }
    };

    const draw = (time: number) => render(time, window.scrollY);

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const scroll = window.scrollY;
      // Redraw immediately while scrolling; otherwise idle at IDLE_FRAME_MS.
      if (scroll === lastScroll && time - lastFrame < IDLE_FRAME_MS) return;
      lastScroll = scroll;
      lastFrame = time;
      render(time, scroll);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("scroll", onStaticScroll);
    };

    // Reduced motion still has to track scroll — it just holds the field still.
    let staticPending = false;
    function onStaticScroll() {
      if (staticPending) return;
      staticPending = true;
      requestAnimationFrame(() => {
        staticPending = false;
        render(STATIC_FRAME, window.scrollY);
      });
    }

    const start = () => {
      stop();
      if (reduceMotion.matches) {
        draw(STATIC_FRAME);
        window.addEventListener("scroll", onStaticScroll, { passive: true });
        return;
      }
      if (document.hidden) {
        draw(STATIC_FRAME);
        return;
      }
      lastFrame = 0;
      lastScroll = -1;
      raf = requestAnimationFrame(tick);
    };

    const handleResize = () => {
      if (measure()) start();
    };

    measure();
    start();

    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);
    const handleVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", handleVisibility);
    reduceMotion.addEventListener("change", start);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reduceMotion.removeEventListener("change", start);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
