// Screenshots of every page, the menu at several widths, and the 404 page's prompt.
import { webkit } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".pdf": "application/pdf" };
// like GitHub Pages: the site under /scribe-website/, and 404.html for anything missing
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]);
  if (!u.startsWith("/scribe-website/")) { r.writeHead(404); r.end(); return; }
  u = u.slice("/scribe-website".length);
  if (u.endsWith("/")) u += "index.html";
  fs.readFile(path.join(root, u), (e, d) => {
    if (e) { r.writeHead(404, { "content-type": "text/html" }); r.end(fs.readFileSync(path.join(root, "404.html"))); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] ?? "application/octet-stream" }); r.end(d);
  });
}).listen(0);
const base = `http://localhost:${server.address().port}/scribe-website/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await webkit.launch();
for (const w of [1440, 1280, 1000, 390]) {
  const p = await browser.newPage({ viewport: { width: w, height: 700 } });
  await p.goto(base); await wait(800);
  console.log(`menu at ${w}: overflows ${await p.$eval(".topbar", (b) => b.scrollWidth > b.clientWidth)}`);
  await p.screenshot({ path: `${here}/shots/menu-${w}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
}
for (const page of ["manual.html", "changelog.html"]) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("pageerror", (e) => console.log(page, "error", e.message));
  await p.goto(base + page); await wait(1500);
  await p.screenshot({ path: `${here}/shots/page-${page}.png` });
}
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", (e) => console.log("index error", e.message));
await p.goto(base); await wait(600);
await p.evaluate(() => document.getElementById("templates").scrollIntoView());
await wait(2200);
await p.screenshot({ path: `${here}/shots/page-templates.png` });
await p.evaluate(() => document.getElementById("cite").scrollIntoView());
await wait(1800);
await p.screenshot({ path: `${here}/shots/page-cite.png` });
const nf = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await nf.goto(base + "docs/getting-started"); await wait(500);
await nf.screenshot({ path: `${here}/shots/page-404.png` });
await nf.fill("#answer", "h"); await nf.press("#answer", "Enter"); await wait(300);
console.log("404 help:", (await nf.textContent("#hint")).slice(0, 80));
await nf.fill("#answer", "x"); await nf.press("#answer", "Enter"); await wait(800);
console.log("after X:", nf.url());
await browser.close();
server.close();
