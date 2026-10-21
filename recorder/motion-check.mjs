// Records the site being scrolled, to see the motion, and checks the reduced-motion version.
//   node motion-check.mjs        -> shots/motion.webm, shots/motion-*.png
import { webkit } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm" };
const server = http.createServer((q, r) => {
  const url = decodeURIComponent(q.url.split("?")[0]);
  const f = path.join(root, url === "/" ? "index.html" : url);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" }); r.end(d); });
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await webkit.launch();
for (const motion of ["no-preference", "reduce"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion, recordVideo: motion === "reduce" ? undefined : { dir: `${here}/shots/tmp`, size: { width: 1440, height: 900 } } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[${motion}] page error`, e.message));
  await p.goto(base);
  await wait(motion === "reduce" ? 1500 : 3500);
  console.log(`[${motion}] html classes:`, await p.evaluate(() => document.documentElement.className));
  // scroll down in wheel steps, as a person would
  for (let i = 0; i < 26; i++) {
    await p.mouse.wheel(0, 260);
    await wait(320);
    if (motion === "no-preference" && [3, 7, 12].includes(i)) await p.screenshot({ path: `${here}/shots/motion-${i}.png` });
  }
  await wait(1500);
  console.log(`[${motion}] at y=${await p.evaluate(() => Math.round(scrollY))}; revealed ${await p.$$eval(".reveal.in", (x) => x.length)} of ${await p.$$eval(".reveal", (x) => x.length)}; still hidden in view:`,
    await p.$$eval(".reveal:not(.in)", (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight * 0.8 && r.bottom > 0; }).length));
  if (motion === "reduce") await p.screenshot({ path: `${here}/shots/motion-reduced.png` });
  const video = p.video();
  await ctx.close();
  if (video) fs.renameSync(await video.path(), `${here}/shots/motion.webm`);
}
await browser.close();
server.close();
