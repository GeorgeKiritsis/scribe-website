// Scribe's website. Two things move: Figure 1, the app's own welcome screen (LaTeX typed on
// the left becomes the page on the right), and the recorded demos, which play while in view.
"use strict";

// The site's root, so assets load the same from any page.
const ROOT = new URL(".", document.currentScript.src).href;

// Where each platform's download is. A platform without a link yet says "Coming soon"
// instead of offering a download that doesn't exist.
const DOWNLOADS = {
  mac: null,     // e.g. "https://github.com/…/releases/latest/download/Scribe.dmg"
  windows: null,
  linux: null,
};

// ---------- Figure 1: ported from papyrus/src/welcome.ts ----------
const CURVE = Array.from({ length: 81 }, (_, i) => {
  const x = i / 8;
  const y = Math.exp(-x / 5) * Math.sin(x * 1.6);
  return `${i ? "L" : "M"}${(22 + x * 17).toFixed(1)} ${(40 - y * 30).toFixed(1)}`;
}).join("");

const WELCOME_DOC = [
  {
    src: `\\documentclass{article}
\\usepackage{scribe-figures}`,
  },
  {
    src: `\\title{Scribe: Papers That\\\\
  Run Their Own Figures}
\\author{You}

\\begin{document}
\\maketitle`,
    html: `<h1>Scribe: Papers That<br>Run Their Own Figures</h1><p class="paper-author">You</p>`,
  },
  {
    src: `\\begin{abstract}
Scribe is an editor for LaTeX and
Python, for papers, theses and notes.
Run the notebook, and the figures land
in the PDF, already up to date.
\\end{abstract}`,
    html: `<div class="paper-abstract"><strong>Abstract</strong><p>Scribe is an editor for LaTeX and Python, for papers, theses and notes. Run the notebook, and the figures land in the PDF, already up to date.</p></div>`,
  },
  {
    src: `\\section{Write}
A LaTeX editor with completion, project
search, and the PDF beside your source.`,
    html: `<h2><span>1</span>Write</h2><p>A LaTeX editor with completion, project search, and the PDF beside your source.</p>`,
  },
  {
    src: `\\section{Run}
Figures live in notebook cells. Change
the code and the next compile reruns
only what went stale:
\\[ y(t) = e^{-t/5} \\sin t \\]`,
    html: `<h2><span>2</span>Run</h2><p>Figures live in notebook cells. Change the code and the next compile reruns only what went stale:</p><p class="paper-eq"><i>y</i>(<i>t</i>) = <i>e</i><sup>−<i>t</i>/5</sup> sin <i>t</i></p>`,
  },
  {
    src: `\\nbfig{damped}{Straight from
  notebooks/analysis.py.}`,
    html: `<figure><svg viewBox="0 0 200 80" fill="none"><path class="axis" d="M22 6v68h172"/><path class="zero" d="M22 40h172"/><path class="curve" pathLength="1" d="${CURVE}"/></svg><figcaption>Figure 1: Straight from notebooks/analysis.py.</figcaption></figure>`,
  },
  {
    src: `\\section{Compile}
Press \\texttt{Cmd+Enter}. The PDF builds
on your machine, online or not.

\\end{document}`,
    html: `<h2><span>3</span>Compile</h2><p>Press <code>Cmd+Enter</code>. The PDF builds on your machine, online or not.</p>`,
  },
];

const TEX_TOKEN = /(%[^\n]*)|(\\[a-zA-Z]+)|(\$[^$\n]*\$?)|(\d+(?:\.\d+)?)/g;
const TEX_CLASS = ["tw-cmt", "tw-cmd", "tw-math", "tw-num"];

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightTex(text) {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(TEX_TOKEN)) {
    const cls = TEX_CLASS[m.slice(1).findIndex((g) => g !== undefined)];
    html += escHtml(text.slice(last, m.index)) + `<span class="${cls}">${escHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + escHtml(text.slice(last));
}


// The source with a line number before each line, like an editor's gutter.
function numbered(html) {
  return html.split("\n").map((line, i) => `<span class="ln">${i + 1}</span>${line}`).join("\n");
}

// Puts a block's rendered nodes on the page with their text reserved but hidden, and returns
// a setter that shows the first `progress` (0-1) of it. Layout never shifts as words arrive.
function mountPaperBlock(paper, html) {
  if (!html) return () => {};
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const nodes = [...tpl.content.children];
  const parts = [];
  for (const node of nodes) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const textNode of texts) {
      if (!textNode.data.trim()) continue;
      const shown = document.createElement("span");
      const pending = document.createElement("span");
      pending.className = "pending";
      pending.textContent = textNode.data;
      parts.push({ shown, pending, text: textNode.data });
      textNode.replaceWith(shown, pending);
    }
  }
  const curve = nodes.map((n) => n.querySelector(".curve")).find(Boolean);
  const total = parts.reduce((sum, part) => sum + part.text.length, 0);
  paper.append(...nodes);
  return (progress) => {
    let left = Math.round(progress * total);
    for (const part of parts) {
      const take = Math.min(left, part.text.length);
      left -= take;
      part.shown.textContent = part.text.slice(0, take);
      part.pending.textContent = part.text.slice(take);
    }
    if (curve) curve.style.strokeDashoffset = String(1 - progress);
    if (progress > 0) nodes.forEach((n) => n.classList.add("in"));
  };
}

// Types the whole document, holds the finished page a while, then starts again.
function startTypewriter() {
  const el = document.getElementById("typewriter");
  const paper = document.getElementById("sheet");
  if (!el || !paper) return;
  const cursor = '<span class="tw-cursor"></span>';
  let block, char, typed, setProgress;
  const reset = () => {
    block = 0;
    char = 0;
    typed = "";
    paper.replaceChildren();
    el.innerHTML = "";
    setProgress = mountPaperBlock(paper, WELCOME_DOC[0].html);
  };
  function tick() {
    const src = WELCOME_DOC[block].src;
    if (char <= src.length) {
      el.innerHTML = numbered(highlightTex(typed + src.slice(0, char)) + cursor);
      el.scrollTop = el.scrollHeight;
      setProgress(char / src.length);
      const pause = src[char - 1] === "\n" ? 110 : 14 + Math.random() * 22;
      char++;
      setTimeout(tick, pause);
      return;
    }
    typed += src + "\n\n";
    block++;
    char = 0;
    if (block < WELCOME_DOC.length) {
      setProgress = mountPaperBlock(paper, WELCOME_DOC[block].html);
      setTimeout(tick, 320);
    } else {
      el.innerHTML = numbered(highlightTex(typed.trimEnd()) + cursor);
      // The page is written: from here on the source is the visitor's to edit (interactive.js).
      dispatchEvent(new CustomEvent("scribe:typed", { detail: { source: typed.trimEnd() } }));
    }
  }
  reset();
  setTimeout(tick, 500);
}

// ---------- the recorded demos ----------
// Each <video data-demo="name"> gets its sources only when it comes near the screen, plays
// while it is mostly in view and pauses when it leaves. With Reduce Motion on, a demo waits
// for a click. A click always pauses or resumes.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function load(video) {
  if (video.dataset.loaded) return;
  video.dataset.loaded = "1";
  const name = video.dataset.demo;
  for (const [ext, type] of [["webm", "video/webm"], ["mp4", "video/mp4"]]) {
    const source = document.createElement("source");
    source.src = `${ROOT}assets/demos/${name}.${ext}`;
    source.type = type;
    video.appendChild(source);
  }
  video.load();
}

function setPaused(video, paused) {
  const box = video.parentElement;
  if (paused) {
    video.pause();
    box.dataset.paused = "";
  } else {
    load(video);
    delete box.dataset.paused;
    video.play().catch(() => { box.dataset.paused = ""; });
  }
}

function setupDemos() {
  const videos = [...document.querySelectorAll("video[data-demo]")];
  const chosen = new WeakSet(); // after a click, scrolling no longer starts or stops it
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) load(e.target);
  }, { rootMargin: "600px 0px" });
  const inView = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const video = e.target;
      if (chosen.has(video)) continue;
      if (reduceMotion) {
        video.parentElement.dataset.paused = "";
        continue;
      }
      setPaused(video, !e.isIntersecting);
    }
  }, { threshold: 0.45 });
  for (const video of videos) {
    near.observe(video);
    inView.observe(video);
    video.addEventListener("click", () => {
      chosen.add(video);
      setPaused(video, !video.paused);
    });
  }
}

for (const box of document.querySelectorAll(".platform[data-os]")) {
  const url = DOWNLOADS[box.dataset.os];
  const button = box.querySelector(".button");
  if (url) {
    button.href = url;
    continue;
  }
  const soon = document.createElement("span");
  soon.className = "button soon";
  soon.textContent = "Coming soon";
  button.replaceWith(soon);
}
// Section numbers, as \section would set them (the abstract and the appendix aren't numbered)
document.querySelectorAll(".article > section:not(.abstract):not(.appendix) > h2, .article > section:not(.abstract):not(.appendix) > .feature-text > h2")
  .forEach((h, i) => { h.dataset.n = String(i + 1); });

// LaTeX and TeX in running text set as their logos (code, menus and the demos keep plain text)
(() => {
  const SKIP = "code, pre, kbd, .topbar, .typewriter, .sheet, .listing, title, script, style, video";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\b(?:La)?TeX\b/.test(n.data) && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of node.data.matchAll(/\b(La)?TeX\b/g)) {
      frag.append(node.data.slice(last, m.index));
      const logo = document.createElement("span");
      logo.className = m[1] ? "latex" : "tex";
      logo.setAttribute("aria-label", m[0]);
      logo.innerHTML = m[1] ? 'L<span class="a" aria-hidden="true">a</span>T<span class="e" aria-hidden="true">e</span>X' : 'T<span class="e" aria-hidden="true">e</span>X';
      frag.append(logo);
      last = m.index + m[0].length;
    }
    frag.append(node.data.slice(last));
    node.replaceWith(frag);
  }
})();

// \pagecolor{white|black}: says the page's colour; a click turns it over and remembers it
const pagecolor = document.querySelector(".pagecolor");
if (pagecolor) {
  const dark = () => document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const show = () => { pagecolor.querySelector(".pagecolor-name").textContent = dark() ? "black" : "white"; };
  pagecolor.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("scribe.theme", next); } catch {}
    show();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", show);
  show();
}

// the visitor's own platform comes first and is marked
const os = /Mac/i.test(navigator.platform) ? "mac" : /Win/i.test(navigator.platform) ? "windows" : /Linux/i.test(navigator.platform) ? "linux" : null;
document.querySelector(`.platform[data-os="${os}"]`)?.classList.add("yours");
// The typewriter plays under Reduce Motion too: text appearing in place is not the movement
// that setting guards against, and it is the point of the figure (as in the app).
startTypewriter();
setupDemos();
