// Exercises the interactive parts of the site: the editable first screen, the playground,
// the \pagecolor switch. Screenshots go to shots/.
import { webkit } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm" };
const server = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]);
  if (u.endsWith("/")) u += "index.html";
  const f = path.join(root, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(f)] ?? "application/octet-stream" }); r.end(d); });
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await webkit.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", (e) => console.log("page error:", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await p.goto(base);
console.log("logos:", await p.$$eval(".latex, .tex", (x) => x.length), "| sidenotes:", await p.$$eval(".sidenote", (x) => x.length));

// the first screen: wait for the page to be typed, then edit the title
await p.waitForSelector(".source-edit:not([hidden])", { timeout: 60000 });
await wait(800);
await p.click(".source-edit");
await p.keyboard.press("Meta+ArrowUp");
for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowDown");
await p.keyboard.press("End");
await p.keyboard.press("Meta+ArrowLeft");
const line = await p.$eval(".source-edit", (t) => t.value.split("\n")[3]);
console.log("line 4:", JSON.stringify(line));
await p.$eval(".source-edit", (t) => {
  t.value = t.value.replace("Papers That", "My Thesis, Where Figures").replace("Run Their Own Figures", "Run Themselves").replace("\\author{You}", "\\author{Maria Papadopoulou}");
  t.dispatchEvent(new Event("input"));
});
await wait(800);
console.log("sheet title:", JSON.stringify(await p.$eval("#sheet h1", (h) => h.textContent)), "| author:", await p.$eval("#sheet .paper-author", (h) => h.textContent), "| katex in sheet:", await p.$$eval("#sheet .katex", (x) => x.length));
await p.screenshot({ path: `${here}/shots/i-hero.png` });

// the playground
await p.$eval("#try", (e) => e.scrollIntoView());
await wait(1500);
await p.click(".pg-input");
await p.keyboard.press("Meta+ArrowDown");
await p.keyboard.type("Speed: $v;a//1", { delay: 40 });
await p.keyboard.press("Tab");
await p.keyboard.type("t", { delay: 40 });
await p.keyboard.press("Tab");
await p.keyboard.press("Tab");
await p.keyboard.type(" and $$", { delay: 40 });
await p.keyboard.type("x -> RR", { delay: 40 });
await wait(600);
const val = await p.$eval(".pg-input", (t) => t.value.split("\n").slice(-2).join(" | "));
console.log("typed:", JSON.stringify(val));
console.log("katex in output:", await p.$$eval(".pg-output .katex", (x) => x.length));
await p.screenshot({ path: `${here}/shots/i-playground.png` });

// the comparison, questions, margin notes
for (const id of ["compared", "faq"]) {
  await p.$eval(`#${id}`, (e) => e.scrollIntoView());
  await wait(1800);
  await p.screenshot({ path: `${here}/shots/i-${id}.png` });
}
await p.$eval(".theorem", (e) => e.scrollIntoView({ block: "center" }));
await wait(3000);
await p.screenshot({ path: `${here}/shots/i-sidenote.png` });

// \pagecolor{black}
await p.click(".pagecolor");
await wait(600);
console.log("theme:", await p.evaluate(() => document.documentElement.dataset.theme), "| switch says:", await p.$eval(".pagecolor-name", (x) => x.textContent));
await p.$eval("#try", (e) => e.scrollIntoView());
await wait(1200);
await p.screenshot({ path: `${here}/shots/i-dark.png` });
await p.evaluate(() => scrollTo(0, 0));
await wait(1200);
await p.screenshot({ path: `${here}/shots/i-dark-top.png` });
await browser.close();
server.close();
