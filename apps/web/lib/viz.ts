/**
 * Chart tokens for the analytics surfaces.
 *
 * The categorical order and the ordinal ramp below were validated against this
 * app's panel surface (#232323): every slot sits in the dark lightness band,
 * clears the chroma floor, holds >= 3:1 against the surface, and keeps adjacent
 * pairs apart under simulated CVD. Re-run the validator before reordering or
 * adding a slot: the order is the safety mechanism, not decoration.
 */

/** Panel surface these colors were validated against. */
export const VIZ_SURFACE = "#232323";

/** Hairline chrome. Solid, one step off the surface, always recessive. */
export const VIZ_GRID = "rgba(255,255,255,0.06)";
export const VIZ_AXIS = "rgba(255,255,255,0.12)";

/** De-emphasis hue: context series, and the "everything else" gray. */
export const VIZ_MUTED = "#8f8f8f";

/** Categorical slots, assigned in fixed order and never cycled past 8. */
export const VIZ_SERIES = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
] as const;

/** Ordinal ramp for discrete magnitude cells (the tool timeline heat strip). */
export const VIZ_RAMP = ["#184f95", "#2a78d6", "#5598e7", "#9ec5f4"] as const;

/** Reserved state colors. Never reused as a series hue. */
export const VIZ_STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Categorical hue for an entity, keyed by identity so a re-sort never repaints. */
export function seriesColor(index: number): string {
  return index >= 0 && index < VIZ_SERIES.length
    ? VIZ_SERIES[index]!
    : VIZ_MUTED;
}

/** Rounds an axis maximum up to 1/2/5 x 10^n so ticks land on clean numbers. */
export function niceMax(value: number): number {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Bucket a value onto the ordinal ramp. 0 returns -1, meaning "empty track". */
export function rampBucket(value: number, max: number): number {
  if (value <= 0) return -1;
  const share = max > 0 ? Math.min(1, value / max) : 1;
  return Math.min(VIZ_RAMP.length - 1, Math.ceil(share * VIZ_RAMP.length) - 1);
}

/**
 * A polyline through `values` across a 0-100 viewBox, the first point pinned to
 * the left edge and the last to the right. Straight segments between days: a
 * curve would invent motion that was never measured, and a staircase would
 * widen one day into a plateau.
 */
export function linePath(
  values: number[],
  toY: (value: number) => number,
): string {
  if (values.length === 0) return "";
  return values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"} ${pointX(index, values.length).toFixed(3)},${toY(value).toFixed(3)}`,
    )
    .join(" ");
}

/** Where a day's point lands on the 0-100 axis the line is drawn against. */
export function pointX(index: number, count: number): number {
  return count > 1 ? (index / (count - 1)) * 100 : 50;
}
