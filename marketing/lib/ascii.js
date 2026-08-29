/**
 * Static render of the app's ASCII backdrop (apps/web/components/ascii-backdrop.tsx),
 * frozen at one frame so screenshots are reproducible.
 */
const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]()<>/=+*-_;:.";
const WORDS = ["SODIUM", "RESULT", "AGENTS", "WEBMCP", "TOOLS", "MANIFEST"];
const FONT_SIZE = 10;
const LINE_HEIGHT = 12;
const SHADES = ["#222222", "#272727", "#2d2d2d", "#333333"];
const WORD_SHADE = "#3a3a3a";
const BUCKETS = SHADES.length;
const VISIBLE_AT = 0.34;
const WORD_SPACING = 13;
const SPEED = 0.0000018;
const STATIC_FRAME = 12_000;
const MONO_FALLBACK = "ui-monospace, monospace";

function hash2(row, col) {
  let h =
    Math.imul(row ^ 0x9e3779b9, 2654435761) ^
    Math.imul(col + 0x85ebca6b, 2246822507);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function paintAscii(canvas, { frame = STATIC_FRAME, scale = 1 } = {}) {
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const size = FONT_SIZE * scale;
  const lineHeight = LINE_HEIGHT * scale;
  ctx.font = `${size}px "Geist Mono", ${MONO_FALLBACK}`;
  ctx.textBaseline = "top";

  const cellW = ctx.measureText("M").width || size * 0.6;
  const cols = Math.ceil(width / cellW) + 1;
  const rows = Math.ceil(height / lineHeight) + 2;
  const layers = Array.from({ length: BUCKETS + 1 }, () =>
    new Array(cols).fill(" "),
  );
  const used = new Array(BUCKETS + 1).fill(false);
  const warpCol = new Float32Array(cols);
  const t = frame * SPEED;
  const wordLayer = layers[BUCKETS];

  for (let c = 0; c < cols; c++) {
    warpCol[c] = Math.cos(c * 0.09 - t * 1.4) * 0.7;
  }

  ctx.clearRect(0, 0, width, height);

  for (let r = 0; r < rows; r++) {
    for (let l = 0; l <= BUCKETS; l++) {
      layers[l].fill(" ");
      used[l] = false;
    }

    const h = hash(r);
    if (h % WORD_SPACING === 0) {
      const word = WORDS[h % WORDS.length];
      const start = (h >>> 9) % Math.max(1, cols - word.length);
      for (let k = 0; k < word.length; k++) wordLayer[start + k] = word[k];
      used[BUCKETS] = true;
    }

    const y = r * 0.22;
    const wx = Math.sin(r * 0.13 + t * 1.9) * 0.8;
    const yTerm = y * 1.15 - t * 1.6;
    for (let c = 0; c < cols; c++) {
      if (wordLayer[c] !== " ") continue;
      const x = c * 0.16;
      const field =
        Math.sin(x + wx + t * 2.1) +
        Math.sin(yTerm + warpCol[c]) +
        Math.sin((x + y) * 0.42 + t * 1.1) +
        Math.sin(x * 2.7 - y * 1.9 + t * 2.6) * 0.7;
      const level = (field / 3.7) * 0.5 + 0.5;
      if (level < VISIBLE_AT) continue;
      const b = Math.min(BUCKETS - 1, (level * BUCKETS) | 0);
      layers[b][c] = CHARS[hash2(r, c) % CHARS.length];
      used[b] = true;
    }

    const py = r * lineHeight;
    for (let l = 0; l <= BUCKETS; l++) {
      if (!used[l]) continue;
      ctx.fillStyle = l === BUCKETS ? WORD_SHADE : SHADES[l];
      ctx.fillText(layers[l].join(""), 0, py);
    }
  }
}
