// Rasterises app/icon.svg into the PNG sizes the web app manifest needs. Chrome will not offer
// "Install app" on a manifest that only carries an SVG, and Android masks the home screen icon to
// whatever shape the launcher uses — an icon drawn edge to edge loses its corners.
//
//   public/icon-192.png           192px, logo edge to edge   — `purpose: "any"`
//   public/icon-512.png           512px, logo edge to edge   — `purpose: "any"`
//   public/icon-maskable-512.png  512px, logo inset to 60%   — `purpose: "maskable"`
//
// The maskable variant leaves room for the mask: the safe zone is a circle 80% of the side, so the
// artwork is scaled to 60% and centred on the manifest's own background_color. The others keep the
// same white ground rather than transparency, which launchers composite unpredictably.
//
// One-off, but kept in the repo — the logo will change again, and the sizes are easy to get wrong.
//
// Usage:
//   node scripts/generate-app-icons.mjs

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, "..", "app", "icon.svg");
const OUT_DIR = path.join(__dirname, "..", "public");

/** Matches `background_color` in app/manifest.ts. */
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

const TARGETS = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.6 },
];

async function render({ file, size, scale }) {
  const artwork = Math.round(size * scale);

  // Render the SVG at the artwork size first: sharp rasterises vectors at the density it is given,
  // so resizing afterwards would go through a smaller bitmap and soften the edges.
  const logo = await sharp(SOURCE, { density: 384 })
    .resize(artwork, artwork, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(path.join(OUT_DIR, file), png);
  console.log(`${file.padEnd(24)} ${size}×${size}  artwork ${artwork}px  ${(png.length / 1024).toFixed(1)} KB`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const target of TARGETS) await render(target);
