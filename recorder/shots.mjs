// Screenshots of the site (desktop and phone) and a check that the demos load and play.
//   node shots.mjs
import { chromium, webkit } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const out = `${here}/shots`;
fs.mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm" };
let bytes = 0;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(root, url === "/" ? "index.html" : url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    bytes += data.length;
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [engine, type] of [["webkit", webkit], ["chromium", chromium]]) {
  const browser = await type.launch();
  for (const [name, w, h] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
    if (engine === "chromium" && name === "phone") continue;
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    page.on("pageerror", (e) => console.log(`[${engine}] page error`, e.message));
    page.on("console", (m) => m.type() === "error" && console.log(`[${engine}] console`, m.text()));
    bytes = 0;
    await page.goto(base);
    await wait(2500);
    if (engine === "webkit") {
      console.log(`[${name}] loaded before any demo plays: ${Math.round(bytes / 1024)} KB`);
      await page.screenshot({ path: `${out}/site-${name}.png`, fullPage: true });
      await page.screenshot({ path: `${out}/site-${name}-top.png` });
    }
    if (name !== "desktop") continue;
    // scroll to each demo: it should load, play while in view, and pause after
    const demos = await page.$$eval("video[data-demo]", (v) => v.map((x) => x.dataset.demo));
    for (const demo of demos) {
      await page.$eval(`video[data-demo="${demo}"]`, (v) => v.scrollIntoView({ block: "center" }));
      await wait(1800);
      const state = await page.$eval(`video[data-demo="${demo}"]`, (v) => ({ playing: !v.paused, t: v.currentTime.toFixed(1), src: v.currentSrc.split("/").pop() }));
      console.log(`[${engine}] ${demo}: ${JSON.stringify(state)}`);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await wait(800);
    console.log(`[${engine}] after scrolling away, playing: ${await page.$$eval("video[data-demo]", (v) => v.filter((x) => !x.paused).length)}`);
  }
  await browser.close();
}
server.close();
