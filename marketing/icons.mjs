/**
 * The Sodium mark, and every raster the app serves it as.
 *   node marketing/icons.mjs
 *
 * One generator so the favicon, the apple touch icon and the manifest icons
 * cannot drift from each other: `apps/web/app/icon.svg` is written from the
 * same `lattice()` that every PNG here is rasterised from.
 *
 * The mark is the app's own frame texture, the checkered dither in
 * `globals.css`, read as a sodium chloride lattice: cream squares on ink, in
 * the tokens the light band already uses (`--color-cream`, `--color-ink-950`).
 * It is geometry rather than type, so it stays legible at 16px and needs no
 * font to rasterise.
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../apps/web");
// Playwright lives in the web workspace, not at the repo root.
const require_ = createRequire(resolve(web, "package.json"));
const { chromium } = require_("@playwright/test");

/** globals.css: --color-ink-950 and --color-cream. */
const INK = "#191919";
const CREAM = "#f1eee7";

/** Drops the trailing zeros `toFixed` leaves behind, so the SVG reads clean. */
const n = (value) => String(Number(value.toFixed(3)));

/**
 * The mark at a 32-unit viewBox.
 *
 * `inset` is the margin the 4x4 grid keeps from the edge, which is what tells
 * the three variants apart: the rounded tile can sit tight, a full-bleed
 * square needs more air, and a maskable icon has to stay inside the platform's
 * safe circle (80% of the width, so a square within it is about 18 units).
 */
function lattice({ inset, radius }) {
  const cell = (32 - inset * 2) / 4;
  const squares = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      const x = inset + column * cell;
      const y = inset + row * cell;
      squares.push(
        `    <rect x="${n(x)}" y="${n(y)}" width="${n(cell)}" height="${n(cell)}" />`,
      );
    }
  }
  const plate =
    radius > 0
      ? `  <rect width="32" height="32" rx="${radius}" fill="${INK}" />`
      : `  <rect width="32" height="32" fill="${INK}" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Sodium">
${plate}
  <g fill="${CREAM}">
${squares.join("\n")}
  </g>
</svg>
`;
}

/** The tile every surface shows: rounded, transparent outside the corners. */
const TILE = lattice({ inset: 4, radius: 7 });
/** iOS masks the corners itself, so the touch icon is a full-bleed square. */
const TOUCH = lattice({ inset: 5, radius: 0 });
/** A maskable icon may be cropped to a circle of 80% width; stay inside it. */
const MASKABLE = lattice({ inset: 7, radius: 0 });

const browser = await chromium.launch();

/** Rasterises one SVG at an exact pixel size, corners left transparent. */
async function png(svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const buffer = await page.screenshot({ omitBackground: true });
  await page.close();
  return buffer;
}

/**
 * Packs PNGs into an .ico. The format takes PNG members directly, so this is
 * a 6-byte header, one 16-byte directory entry per size, then the files.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, data }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size: not paletted
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

await mkdir(resolve(web, "public/icons"), { recursive: true });

const written = [];
async function write(path, body) {
  await writeFile(resolve(web, path), body);
  written.push(`${path}: ${body.length.toLocaleString()} bytes`);
}

await write("app/icon.svg", TILE);

const favicon = [];
for (const size of [16, 32, 48]) {
  favicon.push({ size, data: await png(TILE, size) });
}
await write("app/favicon.ico", ico(favicon));

await write("app/apple-icon.png", await png(TOUCH, 180));
await write("public/icons/icon-192.png", await png(TILE, 192));
await write("public/icons/icon-512.png", await png(TILE, 512));
await write("public/icons/icon-maskable-512.png", await png(MASKABLE, 512));

await browser.close();
console.log(written.join("\n"));
