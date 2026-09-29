// Génère les icônes PNG de la PWA à partir de public/icons/icon.svg (node scripts/generate-icons.mjs)
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url));
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
}
// icône "maskable" : marge de sécurité
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#1b1d22" } })
  .composite([{ input: await sharp(svg).resize(400, 400).png().toBuffer(), top: 56, left: 56 }])
  .png()
  .toFile(new URL("../public/icons/maskable-512.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
await sharp(svg).resize(180, 180).png().toFile(new URL("../public/icons/apple-touch-icon.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
console.log("Icônes générées");
