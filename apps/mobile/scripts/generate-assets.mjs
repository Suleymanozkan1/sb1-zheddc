// Generates the Android launcher icons and splash screens (neon CryptoArena style) by drawing
// them on a canvas in headless Chromium. Run: pnpm --filter @cryptoarena/mobile assets
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android/app/src/main/res");

/** Width/height of an existing PNG (IHDR chunk). */
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const draw = `
function crest(ctx, cx, cy, s) {
  // Crossed neon blades inside a ring.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = "round";
  const ring = (r, w, color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); };
  ring(s * 0.42, s * 0.035, "#22d3ee", s * 0.08);
  ring(s * 0.34, s * 0.012, "#e879f9", s * 0.05);
  const blade = (angle, color) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.shadowColor = color; ctx.shadowBlur = s * 0.06;
    const g = ctx.createLinearGradient(0, -s * 0.36, 0, s * 0.2);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.36); ctx.lineTo(s * 0.045, -s * 0.28); ctx.lineTo(s * 0.035, s * 0.14); ctx.lineTo(-s * 0.035, s * 0.14); ctx.lineTo(-s * 0.045, -s * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fbbf24"; ctx.shadowColor = "#fbbf24";
    ctx.fillRect(-s * 0.1, s * 0.13, s * 0.2, s * 0.035);
    ctx.fillStyle = "#475569"; ctx.fillRect(-s * 0.018, s * 0.165, s * 0.036, s * 0.09);
    ctx.restore();
  };
  blade(-Math.PI / 4, "#22d3ee");
  blade(Math.PI / 4, "#e879f9");
  ctx.restore();
}
function background(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, "#15203a"); g.addColorStop(1, "#05060f");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
window.render = (kind, w, h) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const s = Math.min(w, h);
  if (kind === "icon" || kind === "round") {
    background(ctx, w, h);
    if (kind === "round") { ctx.globalCompositeOperation = "destination-in"; ctx.beginPath(); ctx.arc(w / 2, h / 2, s / 2, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = "source-over"; }
    crest(ctx, w / 2, h / 2, s * 0.95);
  } else if (kind === "foreground") {
    // Adaptive icons crop to the inner ~66 %; keep the crest inside the safe zone.
    crest(ctx, w / 2, h / 2, s * 0.62);
  } else {
    // Flat background keeps the (many, large) splash PNGs small.
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, w, h);
    crest(ctx, w / 2, h * 0.42, s * 0.42);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "900 " + Math.round(s * 0.085) + "px sans-serif";
    const y = h * 0.42 + s * 0.32;
    ctx.shadowBlur = s * 0.03;
    ctx.shadowColor = "#22d3ee"; ctx.fillStyle = "#67e8f9";
    const a = "CRYPTO", b = "ARENA";
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
    ctx.textAlign = "left";
    ctx.fillText(a, w / 2 - (wa + wb) / 2, y);
    ctx.shadowColor = "#e879f9"; ctx.fillStyle = "#f0abfc";
    ctx.fillText(b, w / 2 - (wa + wb) / 2 + wa, y);
  }
  return c.toDataURL("image/png").split(",")[1];
};`;

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
await page.addScriptTag({ content: draw });
const render = async (kind, w, h) => Buffer.from(await page.evaluate(([k, a, b]) => globalThis.render(k, a, b), [kind, w, h]), "base64");

for (const [d, f] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${d}`);
  writeFileSync(join(dir, "ic_launcher.png"), await render("icon", 48 * f, 48 * f));
  writeFileSync(join(dir, "ic_launcher_round.png"), await render("round", 48 * f, 48 * f));
  writeFileSync(join(dir, "ic_launcher_foreground.png"), await render("foreground", 108 * f, 108 * f));
}
writeFileSync(join(res, "values/ic_launcher_background.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#05060F</color>\n</resources>\n');

// Splash screens: overwrite every existing splash.png at its own size.
for (const dir of readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = join(res, dir, "splash.png");
  if (!existsSync(file)) continue;
  const { w, h } = pngSize(file);
  writeFileSync(file, await render("splash", w, h));
}
await browser.close();
console.log("android icons and splash screens generated");
