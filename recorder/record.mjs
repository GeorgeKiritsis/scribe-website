// Records the website's demos from the real Scribe frontend. The app (papyrus/dist) runs in
// WebKit against mock.js; each scene is scripted at a human pace, with a camera that zooms
// and pans to follow the action (a CSS transform on <body>) and a drawn pointer.
//
//   node record.mjs                 every scene
//   node record.mjs notes cards     just these
//
// Writes raw/<scene>.webm and raw/<scene>.json (where the loop starts and ends) for encode.mjs.
import { webkit } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const app = process.env.SCRIBE_APP ?? path.resolve(here, "../../papyrus");
const dist = `${app}/dist`;
const example = `${app}/example`;
const raw = `${here}/raw`;
const W = 1600;
const H = 1000;

if (!fs.existsSync(`${dist}/index.html`)) {
  console.error(`No build of the app at ${dist}. Run "npx vite build" in ${app} first.`);
  process.exit(1);
}
fs.mkdirSync(raw, { recursive: true });

// ---------- the project the app opens ----------
const read = (rel) => fs.readFileSync(`${example}/${rel}`, "utf8");
const NOTES = {
  "notes/Lecture 1.md": `# Lecture 1: Limits

The sequence $(a_n)$ **converges** to $L \\in \\mathbb{R}$ if

$$
\\forall \\varepsilon > 0 \\;\\exists N \\in \\mathbb{N} : n \\geq N \\implies |a_n - L| < \\varepsilon
$$

## Examples

- $\\lim_{n \\to \\infty} \\frac{1}{n} = 0$
- $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$, proved in [[Lecture 2]].

## Derivatives
`,
  "notes/Lecture 2.md": `# Lecture 2: The squeeze theorem #exam

**Theorem (Squeeze).** If $g \\leq f \\leq h$ near $a$ and $g, h \\to L$, then $f \\to L$.

Q: What does the squeeze theorem need?
A: Two bounds $g \\le f \\le h$ that share the limit $L$.

Q: What is $\\lim_{x \\to 0} \\frac{\\sin x}{x}$?
A: $1$, squeezing $\\frac{\\sin x}{x}$ between $\\cos x$ and $1$.
`,
};
const files = {
  text: {
    "main.tex": read("main.tex"),
    "refs.bib": read("refs.bib"),
    "sections/method.tex": read("sections/method.tex"),
    "sections/results.tex": read("sections/results.tex"),
    "notebooks/experiment.py": read("notebooks/experiment.py"),
    "data/curves.csv": read("data/curves.csv"),
    "README.md": read("README.md"),
    ".scribe/values.json": read(".scribe/values.json"),
    ".scribe/runs.json": read(".scribe/runs.json"),
    ...NOTES,
  },
  notebook: read("notebooks/experiment.py"),
  values: read(".scribe/values.json"),
};
files.files = [
  "main.tex", "README.md", "refs.bib", "scribe-figures.sty", "data/curves.csv", "notebooks/experiment.py",
  "notes/Lecture 1.md", "notes/Lecture 2.md", "papers/kingma2015.pdf", "sections/method.tex", "sections/results.tex",
];
const figure = `data:image/png;base64,${fs.readFileSync(`${here}/fixtures/fig-curves.png`).toString("base64")}`.split(",")[1];

// ---------- a server for the app ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".pdf": "application/pdf", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml", ".mjs": "text/javascript" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const settings = new URLSearchParams(req.url.split("?")[1] ?? "").get("settings") ?? "{}";
  let file;
  if (url === "/") {
    const boot = `<script>window.__FILES__=${JSON.stringify(files).replace(/</g, "\\u003c")};window.__FIG__=${JSON.stringify(figure)};window.__SETTINGS__=${settings};</script><script src="/mock.js"></script>`;
    const html = fs.readFileSync(`${dist}/index.html`, "utf8").replace('<script type="module"', () => `${boot}<script type="module"`);
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  if (url === "/mock.js") file = `${here}/mock.js`;
  else if (url === "/files/main.pdf") file = `${example}/build/main.pdf`;
  else file = `${dist}${url}`;
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
}).listen(0);
const base = `http://localhost:${server.address().port}`;

// ---------- in the page: the camera and the pointer ----------
const STAGE = () => {
  try {
    localStorage.setItem("scribe.tour", "done");
    localStorage.setItem("scribe.recent", JSON.stringify(["/Users/you/Papers/momentum-matters"]));
  } catch {}
  addEventListener("DOMContentLoaded", () => {
    // The pointer sits outside <body>, so the camera's transform doesn't move it.
    const pointer = document.createElement("div");
    pointer.id = "__pointer";
    pointer.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M5 3l15 9.5-6.6 1.4 3.9 7.4-2.9 1.5-3.9-7.4L5 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(pointer.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", translate: "-200px -200px", transition: "scale 120ms ease" });
    document.documentElement.appendChild(pointer);
    // Floating controls the app places at screen coordinates (the reader's Highlight button)
    // must stay outside the zoomed <body> too, or they land where the unzoomed page would be.
    new MutationObserver(() => {
      for (const el of document.body.querySelectorAll(":scope > .reader-highlight")) document.documentElement.appendChild(el);
    }).observe(document.body, { childList: true });
    addEventListener("mousemove", (e) => { pointer.style.translate = `${e.clientX - 5}px ${e.clientY - 3}px`; }, true);
    addEventListener("mousedown", () => { pointer.style.scale = "0.86"; }, true);
    addEventListener("mouseup", () => { pointer.style.scale = "1"; }, true);
  });
  // Frame `target` (a selector, or a rect in unzoomed page coordinates) at `scale`.
  window.__camera = (target, scale, ms) => {
    const b = document.body;
    const now = getComputedStyle(b).transform;
    const m = now === "none" ? new DOMMatrix() : new DOMMatrix(now);
    let r = target;
    if (typeof target === "string") {
      const el = document.querySelector(target);
      if (!el) return;
      const c = el.getBoundingClientRect();
      const inv = m.inverse();
      const a = inv.transformPoint(new DOMPoint(c.left, c.top));
      const z = inv.transformPoint(new DOMPoint(c.right, c.bottom));
      r = { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y };
    }
    b.style.transformOrigin = "0 0";
    b.style.transition = `transform ${ms}ms cubic-bezier(.65, 0, .35, 1)`;
    if (!r || scale <= 1) {
      b.style.transform = "";
      return;
    }
    const W = innerWidth;
    const H = innerHeight;
    const s = Math.max(1, Math.min(scale, (W * 0.92) / r.w, (H * 0.9) / r.h));
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const tx = clamp(W / 2 - (r.x + r.w / 2) * s, W - W * s, 0);
    const ty = clamp(H / 2 - (r.y + r.h / 2) * s, H - H * s, 0);
    b.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  // Where the text cursor is, in unzoomed page coordinates (for following typing).
  window.__caret = () => {
    const c = document.querySelector(".cm-focused .cm-cursor-primary, .cm-focused .cm-cursor");
    if (!c) return null;
    const now = getComputedStyle(document.body).transform;
    const inv = (now === "none" ? new DOMMatrix() : new DOMMatrix(now)).inverse();
    const r = c.getBoundingClientRect();
    const p = inv.transformPoint(new DOMPoint(r.left, r.top));
    return { x: p.x, y: p.y, h: r.height };
  };
};

// ---------- directing ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Scene {
  constructor(page, name) {
    this.p = page;
    this.name = name;
    this.t0 = Date.now();
    this.mouse = { x: W * 0.62, y: H * 0.7 };
    this.marks = {};
  }
  mark(name) { this.marks[name] = (Date.now() - this.t0) / 1000; }
  async camera(target, scale = 1.8, ms = 1200) {
    await this.p.evaluate(([t, s, d]) => window.__camera(t, s, d), [target, scale, ms]);
    await wait(ms + 80);
  }
  /** Keep the text cursor in frame while typing. */
  async follow(scale = 1.9, ms = 500) {
    const c = await this.p.evaluate(() => window.__caret());
    if (c) await this.camera({ x: c.x - 380, y: c.y - 160, w: 760, h: 320 }, scale, ms);
  }
  async moveTo(x, y, ms = 650) {
    const from = { ...this.mouse };
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      await this.p.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      await wait(ms / steps);
    }
    this.mouse = { x, y };
  }
  async point(selector) {
    const box = await this.p.locator(selector).first().boundingBox();
    if (!box) throw new Error(`nothing at ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async click(selector, ms = 650) {
    const { x, y } = typeof selector === "string" ? await this.point(selector) : selector;
    await this.moveTo(x, y, ms);
    await wait(120);
    await this.p.mouse.down();
    await wait(70);
    await this.p.mouse.up();
    await wait(200);
  }
  async type(text, delay = 70) {
    for (const ch of text) {
      if (ch === "\t") await this.p.keyboard.press("Tab");
      else if (ch === "\n") await this.p.keyboard.press("Enter");
      else await this.p.keyboard.type(ch);
      await wait(delay + Math.random() * delay * 0.6);
    }
  }
  /** The on-screen position of the end of `needle` in the first editor line containing it. */
  async textEnd(needle) {
    return this.p.evaluate((needle) => {
      // highlighting splits a line into many text nodes: find the offset in the whole line
      for (const line of document.querySelectorAll("#editor .cm-line")) {
        const at = line.textContent.indexOf(needle);
        if (at < 0) continue;
        let left = at + needle.length;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (left > node.data.length) { left -= node.data.length; continue; }
          const range = document.createRange();
          range.setStart(node, left);
          range.setEnd(node, left);
          const r = range.getBoundingClientRect();
          return { x: r.left, y: r.top + r.height / 2 };
        }
      }
      return null;
    }, needle);
  }
}

/** Scroll the editor until the line containing `needle` is in the middle. */
async function showLine(s, needle) {
  await s.p.evaluate(async (needle) => {
    const scroller = document.querySelector("#editor .cm-scroller");
    for (let i = 0; i < 60; i++) {
      const line = [...document.querySelectorAll("#editor .cm-line")].find((l) => l.textContent.includes(needle));
      if (line) { line.scrollIntoView({ block: "center" }); return; }
      scroller.scrollTop += 300;
      await new Promise((r) => setTimeout(r, 60));
    }
  }, needle);
  await wait(400);
}

/** Scenes about notes don't use the PDF pane: hide it (before the loop starts). */
async function hidePreview(s) {
  await s.p.keyboard.press("Meta+Shift+P");
  await s.p.keyboard.type("Toggle Preview");
  await wait(150);
  await s.p.keyboard.press("Enter");
  await wait(500);
}

/** The pointer goes to the margin while someone types. */
async function parkPointer(s) {
  await s.moveTo(W * 0.96, H * 0.55, 700);
}

async function open(scene) {
  const { p } = scene;
  await p.waitForSelector(".recent-open");
  await wait(400);
  await p.click(".recent-open");
  await wait(1400);
}

const SCENES = {
  // Figure 2: run the figure cell, then compile: the figure and numbers land in the PDF.
  async notebook(s) {
    await open(s);
    await s.click('#files .item[data-rel="notebooks/experiment.py"]', 1);
    await wait(1200);
    await s.p.evaluate(() => document.querySelector(".nb-cell-figure, .nb-cell.figure, [data-figure]")?.scrollIntoView({ block: "center" }));
    await wait(500);
    s.mark("start");
    await wait(700);
    const cell = (await s.p.$(".nb-cell-figure")) ? ".nb-cell-figure" : ".nb-cell:has(.nb-cell-run)";
    await s.camera(cell, 1.7, 1300);
    await s.click(`${cell} .nb-cell-run`);
    await wait(1900);
    await s.p.evaluate((c) => document.querySelector(`${c} img`)?.scrollIntoView({ block: "center" }), cell);
    await s.camera(`${cell}`, 1.5, 900);
    await wait(1200);
    await s.camera(null, 1, 1100);
    await s.click("#btn-compile");
    await wait(2600);
    // the figure's page in the PDF
    await s.p.evaluate(() => {
      const span = [...document.querySelectorAll("#pdf .textLayer span")].find((x) => /^Figure 1/.test(x.textContent));
      span?.closest(".pdf-page")?.scrollIntoView({ block: "start" });
      document.querySelector("#pdf-scroll").scrollTop += (span ? span.getBoundingClientRect().top - document.querySelector("#pdf-scroll").getBoundingClientRect().top - 360 : 0);
    });
    await wait(500);
    await s.camera("#pdf-pane", 1.55, 1400);
    await wait(2600);
    await s.camera(null, 1, 1100);
    await wait(500);
    s.mark("end");
  },

  // Figure 3: typing maths during a lecture.
  async notes(s) {
    await open(s);
    await s.click('#files .item[data-rel="notes/Lecture 1.md"]', 1);
    await hidePreview(s);
    await wait(700);
    s.mark("start");
    await wait(600);
    await s.click("#editor .cm-content");
    await s.p.keyboard.press("Meta+ArrowDown");
    await parkPointer(s);
    await s.follow(1.9, 1300);
    await s.type("\nThe derivative of $f$ at $x$ is\n\n", 75);
    await s.follow();
    await s.type("$", 75);
    await wait(250);
    await s.type("$", 75);
    await wait(300);
    await s.type("f'(x) = \\lim_{h ", 85);
    await s.p.keyboard.press("Escape"); // close the completion list the \lim brought up
    await s.type("-> 0} ", 85);
    await s.follow();
    await s.type("//", 110);
    await wait(250);
    await s.type("f(x+h) - f(x)\th\t", 85);
    await s.follow();
    await s.p.keyboard.press("ArrowDown");
    await s.type("\n\nFor every $;e > 0\t there is $;d > 0\t with $|h| < ;d\t.", 80);
    await s.follow();
    await s.p.keyboard.press("Enter");
    await wait(1400);
    await s.camera("#editor", 1.25, 1300);
    await wait(2200);
    await s.camera(null, 1, 1000);
    await wait(400);
    s.mark("end");
  },

  // Figure 4: highlight a sentence in a cited paper; it lands in the paper's note.
  async reader(s) {
    await open(s);
    await hidePreview(s);
    s.mark("start");
    await wait(500);
    await s.click("#tab-references");
    await wait(700);
    await s.click(".ref-row .icon-btn.has-pdf");
    await wait(2600);
    const span = await s.p.evaluateHandle(() => [...document.querySelectorAll(".reader .textLayer span")].find((x) => x.textContent.includes("We train one small")));
    const b = await span.asElement().boundingBox();
    await s.camera({ x: b.x - 120, y: b.y - 200, w: 760, h: 420 }, 2, 1400);
    const b2 = await span.asElement().boundingBox();
    await s.moveTo(b2.x + 2, b2.y + b2.height / 2, 700);
    await s.p.mouse.down();
    await s.moveTo(b2.x + b2.width * 0.94, b2.y + b2.height / 2, 1000);
    await s.p.mouse.up();
    await wait(700);
    if (process.env.DEBUG) { console.log("sel", JSON.stringify(await s.p.evaluate(() => getSelection().toString())), "btn", await s.p.evaluate(() => !document.querySelector(".reader-highlight").hidden)); await s.p.screenshot({ path: `${here}/shots/debug-reader.png` }); }
    await s.click(".reader-highlight");
    await wait(1300);
    if (process.env.DEBUG) console.log("marks", await s.p.evaluate(() => [document.querySelectorAll(".reader-mark").length, Object.keys(window.__W__), document.getElementById("status-text").textContent]));
    await s.camera(null, 1, 1000);
    await s.click("#tab-notes");
    await wait(800);
    await s.click('.note-row[title="notes/kingma2015.md"]');
    await wait(1300);
    await s.p.keyboard.press("Meta+ArrowDown").catch(() => {});
    await s.camera("#editor", 1.4, 1300);
    await wait(2600);
    await s.camera(null, 1, 1000);
    await wait(400);
    s.mark("end");
  },

  // Figure 5: review the cards in a lecture's notes.
  async cards(s) {
    await open(s);
    await s.click("#tab-notes", 1);
    await wait(700);
    await s.click('.note-row[title="notes/Lecture 2.md"]', 1);
    await hidePreview(s);
    await s.click("#editor .cm-content", 1);
    await s.p.keyboard.press("Meta+ArrowDown");
    await wait(900);
    s.mark("start");
    await wait(500);
    await s.camera("#editor .cm-content", 1.6, 1300);
    await wait(2200);
    await s.camera(null, 1, 1000);
    await s.click(".notes-tools .btn-primary");
    await wait(1500);
    await s.p.keyboard.press(" ");
    await wait(2000);
    await s.click('#review-grades [data-grade="2"]');
    await wait(1300);
    await s.p.keyboard.press(" ");
    await wait(1800);
    await s.click('#review-grades [data-grade="3"]');
    await wait(1800);
    await s.click("#review-close");
    await wait(500);
    s.mark("end");
  },

  // Figure 6: a table from a spreadsheet.
  async table(s) {
    await open(s);
    await hidePreview(s);
    await showLine(s, "\\section{Conclusion}");
    const at = await s.textEnd("\\section{Conclusion}");
    await s.click({ x: at.x, y: at.y }, 1);
    await s.p.keyboard.press("Home");
    await s.p.keyboard.press("Enter");
    await s.p.keyboard.press("ArrowUp");
    await wait(400);
    s.mark("start");
    await wait(400);
    await s.p.keyboard.press("Meta+Shift+P");
    await wait(500);
    await s.type("Edit Table", 90);
    await wait(400);
    await s.p.keyboard.press("Enter");
    await wait(1100);
    await s.camera("#work-side", 1.5, 1300);
    await s.click('.table-cell[data-r="1"][data-c="0"]');
    await parkPointer(s);
    await s.type("SGD\t0.31\tloss", 90);
    await s.p.keyboard.press("Enter");
    await wait(500);
    // a block copied from a spreadsheet
    await s.click('.table-cell[data-r="2"][data-c="0"]');
    await wait(300);
    await s.p.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "Momentum\t0.18\tloss\nAdam\t0.12\tloss\nAdam, tuned\t0.09\tloss");
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await wait(1400);
    await s.moveTo(...Object.values(await s.point(".table-align >> nth=1")), 600);
    await s.p.selectOption(".table-align >> nth=1", "r");
    await wait(900);
    await s.click(".table-bar .btn-primary");
    await wait(600);
    await s.camera(null, 1, 900);
    await showLine(s, "\\begin{tabular}");
    // frame the LaTeX that was written, from \begin{table} to \end{table}
    const rect = await s.p.evaluate(() => {
      const lines = [...document.querySelectorAll("#editor .cm-line")];
      const a = lines.find((l) => l.textContent.includes("\\begin{table}"));
      const z = lines.find((l) => l.textContent.includes("\\end{table}"));
      if (!a || !z) return null;
      const r1 = a.getBoundingClientRect();
      const r2 = z.getBoundingClientRect();
      return { x: r1.left - 40, y: r1.top - 30, w: 760, h: r2.bottom - r1.top + 60 };
    });
    await s.camera(rect, 1.8, 1300);
    await wait(2600);
    await s.camera(null, 1, 1000);
    await wait(400);
    s.mark("end");
  },

  // Figure 7: a misspelt command, explained, then fixed (compile as you type is on).
  async errors(s) {
    await open(s);
    await s.click("#btn-compile", 1);
    await wait(2200);
    // bring the line with the reference into the middle of the editor
    await s.p.evaluate(async () => {
      const scroller = document.querySelector("#editor .cm-scroller");
      for (let i = 0; i < 40; i++) {
        const line = [...document.querySelectorAll("#editor .cm-line")].find((l) => l.textContent.includes("Section~\\ref{sec:method}"));
        if (line) { line.scrollIntoView({ block: "center" }); return; }
        scroller.scrollTop += 300;
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await wait(600);
    if (process.env.DEBUG) { await s.p.screenshot({ path: `${here}/shots/debug-errors.png` }); console.log("lines", await s.p.evaluate(() => [...document.querySelectorAll("#editor .cm-line")].filter((l) => l.textContent.includes("Section~")).map((l) => l.textContent.slice(0, 40)))); }
    s.mark("start");
    await wait(400);
    const at = await s.textEnd("Section~\\ref");
    await s.camera({ x: at.x - 420, y: at.y - 160, w: 840, h: 320 }, 2, 1300);
    const there = await s.textEnd("Section~\\ref");
    await s.click(there);
    await wait(300);
    await s.type("f", 120);
    await wait(2800); // compile as you type: it fails, quietly
    await s.camera(null, 1, 1000);
    await s.camera("#statusbar", 1.8, 900);
    await wait(900);
    await s.click("#sb-problems");
    await wait(900);
    await s.camera("#log-panel", 1.7, 1200);
    await wait(2800);
    await s.camera(null, 1, 1000);
    const back = await s.textEnd("Section~\\reff");
    await s.click(back);
    await s.p.keyboard.press("Backspace");
    await wait(3000); // and compiles cleanly again
    await s.camera("#pdf-pane", 1.3, 1200);
    await wait(1600);
    await s.camera(null, 1, 900);
    await wait(400);
    s.mark("end");
  },
};

const SETTINGS = { errors: { compileOnType: true } };
// THEME=light records the app in its light theme, as <scene>-light, for the site's white page.
const THEME = process.env.THEME === "light" ? "light" : "dark";
const SUFFIX = THEME === "light" ? "-light" : "";

const browser = await webkit.launch();
const wanted = process.argv.slice(2);
for (const [name, run] of Object.entries(SCENES)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    recordVideo: { dir: `${raw}/tmp`, size: { width: W, height: H } },
  });
  await ctx.addInitScript(STAGE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name}] page error:`, e.message));
  const scene = new Scene(page, name);
  await page.goto(`${base}/?settings=${encodeURIComponent(JSON.stringify({ ...(SETTINGS[name] ?? {}), theme: THEME }))}`);
  try {
    await run(scene);
  } catch (e) {
    console.log(`[${name}] FAILED:`, String(e).split("\n")[0]);
    await page.screenshot({ path: `${here}/shots/failed-${name}.png` }).catch(() => {});
  }
  await wait(300);
  const video = page.video();
  await ctx.close();
  fs.renameSync(await video.path(), `${raw}/${name}${SUFFIX}.webm`);
  fs.writeFileSync(`${raw}/${name}${SUFFIX}.json`, JSON.stringify(scene.marks));
  console.log(`[${name}] recorded`, JSON.stringify(scene.marks));
}
await browser.close();
server.close();
