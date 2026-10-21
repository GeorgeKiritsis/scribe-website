// The two things on the page a visitor can type into: the playground (a note with Scribe's
// maths shortcuts, rendered beside it) and the first screen's editor, which becomes editable
// once its page has been typed. KaTeX is loaded the first time either needs it.
"use strict";

(() => {
  // ---------- KaTeX, on demand ----------
  let katexLoading = null;
  function loadKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    katexLoading ??= new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${ROOT}assets/vendor/katex/katex.min.css`;
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = `${ROOT}assets/vendor/katex/katex.min.js`;
      js.onload = () => resolve(window.katex);
      js.onerror = reject;
      document.head.appendChild(js);
    });
    return katexLoading;
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tex = (src, display) => (window.katex
    ? window.katex.renderToString(src, { displayMode: display, throwOnError: false })
    : `<code>${esc(src)}</code>`);

  // ---------- Scribe's maths shortcuts, for a textarea ----------
  const LETTERS = {
    a: "alpha", b: "beta", g: "gamma", d: "delta", e: "varepsilon", z: "zeta", h: "eta", t: "theta", i: "iota",
    k: "kappa", l: "lambda", m: "mu", n: "nu", x: "xi", p: "pi", r: "rho", s: "sigma", u: "upsilon", f: "varphi",
    c: "chi", y: "psi", w: "omega", G: "Gamma", D: "Delta", T: "Theta", L: "Lambda", X: "Xi", P: "Pi", S: "Sigma",
    F: "Phi", Y: "Psi", W: "Omega",
  };
  const SHORTCUTS = new Map([
    ["//", "\\frac{|}{}"], ["->", "\\to "], ["=>", "\\implies "], ["<=", "\\leq "], [">=", "\\geq "], ["!=", "\\neq "],
    ["~=", "\\approx "], ["**", "\\cdot "], ["...", "\\dots "], ["RR", "\\mathbb{R}"], ["NN", "\\mathbb{N}"],
    ["ZZ", "\\mathbb{Z}"], ["QQ", "\\mathbb{Q}"], ["CC", "\\mathbb{C}"],
    ...Object.entries(LETTERS).map(([k, v]) => [`;${k}`, `\\${v}`]),
  ]);
  const LOOSE = /(?<!\\)\$\$([\s\S]*?)\$\$|(?<![\\$])\$((?:\\.|[^$\\\n])*?)\$/g;

  /** The formula the position is inside (between its delimiters), if any. */
  function mathAround(text, pos) {
    for (const m of text.matchAll(LOOSE)) {
      const open = m[0].startsWith("$$") ? 2 : 1;
      const from = m.index;
      const to = from + m[0].length;
      if (pos >= from + open && pos <= to - open) return { from, to, open };
    }
    return null;
  }

  function put(area, from, to, text, caret) {
    area.setRangeText(text, from, to, "end");
    if (caret !== undefined) area.selectionStart = area.selectionEnd = from + caret;
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function withShortcuts(area) {
    area.addEventListener("keydown", (e) => {
      const { value } = area;
      const pos = area.selectionStart;
      if (pos !== area.selectionEnd || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "$") {
        const prev = value[pos - 1];
        const next = value[pos];
        if (prev === "\\") return;
        e.preventDefault();
        if (prev === "$" && next === "$" && value[pos - 2] !== "$") put(area, pos, pos, "$$", 1); // $|$ -> $$|$$
        else if (next === "$") area.selectionStart = area.selectionEnd = pos + 1; // step over the closing $
        else if (!mathAround(value, pos)) put(area, pos, pos, "$$", 1); // $ opens $|$
        else put(area, pos, pos, "$", 1);
        return;
      }
      if (e.key === "Tab" && !e.shiftKey) {
        const m = mathAround(value, pos);
        if (!m) return;
        e.preventDefault();
        // the next blank of a fraction, else out of the formula
        const blank = value.slice(pos, m.to - m.open).indexOf("}{");
        const at = blank >= 0 ? pos + blank + 2 : m.to;
        area.selectionStart = area.selectionEnd = at;
      }
    });
    area.addEventListener("input", (e) => {
      if (e.inputType !== "insertText") return;
      const { value } = area;
      const pos = area.selectionStart;
      if (!mathAround(value, pos)) return;
      for (const length of [3, 2]) {
        const typed = value.slice(pos - length, pos);
        const into = SHORTCUTS.get(typed);
        if (!into || value[pos - length - 1] === "\\") continue;
        const caret = into.indexOf("|");
        const text = into.replace("|", "");
        put(area, pos - length, pos, text, caret >= 0 ? caret : text.length);
        return;
      }
    });
  }

  // ---------- a little Markdown, with maths ----------
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>");
  }

  function markdown(src) {
    const maths = [];
    const hold = (html) => `\u0000${maths.push(html) - 1}\u0000`;
    let text = src
      .replace(/(?<!\\)\$\$([\s\S]+?)\$\$/g, (_, m) => `\n\n${hold(`<div class="pg-display">${tex(m.trim(), true)}</div>`)}\n\n`)
      .replace(/(?<![\\$])\$(?=\S)((?:\\.|[^$\\\n])+?)(?<=\S)\$(?!\$)/g, (_, m) => hold(tex(m, false)));
    const out = [];
    let list = false;
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const li = /^\s*[-*]\s+(.*)$/.exec(line);
        if (!li && list) { out.push("</ul>"); list = false; }
        if (h) out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
        else if (li) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(li[1])}</li>`); }
        else if (/^\u0000\d+\u0000$/.test(line.trim())) out.push(line.trim());
        else out.push(`<p>${inline(line)}</p>`);
      }
    }
    if (list) out.push("</ul>");
    return out.join("\n").replace(/\u0000(\d+)\u0000/g, (_, i) => maths[Number(i)]);
  }

  // ---------- the playground ----------
  const area = document.querySelector(".pg-input");
  const output = document.querySelector(".pg-output");
  if (area && output) {
    withShortcuts(area);
    const render = () => { output.innerHTML = markdown(area.value); };
    area.addEventListener("input", render);
    render();
    // KaTeX arrives when the playground is close to the screen; then the maths renders properly.
    new IntersectionObserver((entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      loadKatex().then(render).catch(() => {});
    }, { rootMargin: "800px 0px" }).observe(area);
  }

  // ---------- the first screen becomes editable once its page is typed ----------
  const pre = document.getElementById("typewriter");
  const sheet = document.getElementById("sheet");
  const tab = document.querySelector(".source-tab");
  if (!pre || !sheet || typeof highlightTex !== "function") return;

  /** The small part of LaTeX the first screen's page needs, as HTML. */
  function latexToHtml(src) {
    const body = src.replace(/(^|[^\\])%.*$/gm, "$1");
    const arg = (cmd) => {
      const at = body.indexOf(`\\${cmd}{`);
      if (at < 0) return null;
      let depth = 0;
      for (let i = at + cmd.length + 1; i < body.length; i++) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}" && --depth === 0) return body.slice(at + cmd.length + 2, i);
      }
      return null;
    };
    const text = (s) => esc(s)
      .replace(/\\texttt\{([^{}]*)\}/g, "<code>$1</code>")
      .replace(/\\(?:emph|textit)\{([^{}]*)\}/g, "<em>$1</em>")
      .replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>")
      .replace(/\\\\/g, "<br>").replace(/~/g, "&nbsp;").replace(/---/g, "—").replace(/--/g, "–")
      .replace(/(?<![\\$])\$((?:\\.|[^$\\])+?)\$/g, (_, m) => tex(m.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"), false));
    const out = [];
    const begin = body.indexOf("\\begin{document}");
    const doc = begin >= 0 ? body.slice(begin + 16).replace(/\\end\{document\}[\s\S]*/, "") : body;
    if (/\\maketitle/.test(doc)) {
      const title = arg("title");
      const author = arg("author");
      if (title) out.push(`<h1>${text(title.replace(/\n\s*/g, " "))}</h1>`);
      if (author) out.push(`<p class="paper-author">${text(author)}</p>`);
    }
    let section = 0;
    let figure = 0;
    const rest = doc.replace(/\\maketitle/, "")
      .replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/, (_, a) => `\n\n\u0001${a}\u0001\n\n`);
    for (const chunk of rest.split(/\n\s*\n/)) {
      let c = chunk.trim();
      if (!c) continue;
      if (c.startsWith("\u0001")) {
        out.push(`<div class="paper-abstract"><strong>Abstract</strong><p>${text(c.replace(/\u0001/g, "").trim().replace(/\s+/g, " "))}</p></div>`);
        continue;
      }
      // a chunk may hold a heading, text, a display formula and a figure, in that order
      c = c.replace(/\\section\*?\{([^{}]*)\}/g, (_, h) => `\u0002${++section}\u0003${h}\u0002`);
      for (const piece of c.split(/(\u0002[^\u0002]*\u0002|\\\[[\s\S]*?\\\]|\\nbfig\{[^{}]*\}\{[^{}]*\})/)) {
        const p = piece.trim();
        if (!p) continue;
        const h = /^\u0002(\d+)\u0003(.*)\u0002$/.exec(p);
        const eq = /^\\\[([\s\S]*?)\\\]$/.exec(p);
        const fig = /^\\nbfig\{[^{}]*\}\{([^{}]*)\}$/.exec(p);
        if (h) out.push(`<h2><span>${h[1]}</span>${text(h[2])}</h2>`);
        else if (eq) out.push(`<p class="paper-eq">${tex(eq[1].trim(), true)}</p>`);
        else if (fig) out.push(`<figure class="in"><svg viewBox="0 0 200 80" fill="none"><path class="axis" d="M22 6v68h172"/><path class="zero" d="M22 40h172"/><path class="curve" pathLength="1" style="stroke-dashoffset:0" d="${CURVE}"/></svg><figcaption>Figure ${++figure}: ${text(fig[1].replace(/\s+/g, " "))}</figcaption></figure>`);
        else out.push(`<p>${text(p.replace(/\s+/g, " "))}</p>`);
      }
    }
    return out.join("");
  }

  const editor = document.createElement("textarea");
  editor.className = "source-edit";
  editor.spellcheck = false;
  editor.wrap = "off";
  editor.setAttribute("aria-label", "The LaTeX source of the page on the right; edit it");
  editor.hidden = true;
  pre.after(editor);

  const draw = () => {
    pre.innerHTML = numbered(highlightTex(editor.value));
    pre.scrollTop = editor.scrollTop;
    pre.scrollLeft = editor.scrollLeft;
    sheet.innerHTML = latexToHtml(editor.value);
  };
  let queued = false;
  editor.addEventListener("input", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; draw(); });
  });
  editor.addEventListener("scroll", () => { pre.scrollTop = editor.scrollTop; pre.scrollLeft = editor.scrollLeft; });

  addEventListener("scribe:typed", (e) => {
    editor.value = e.detail.source;
    editor.hidden = false;
    pre.classList.add("editable");
    pre.closest(".source")?.classList.add("live");
    if (tab) tab.innerHTML = 'main.tex <span class="source-hint">· it\'s yours: change anything, the page follows</span>';
    // laid exactly over the highlighted source, which shows through its transparent text
    const place = () => { editor.style.top = `${pre.offsetTop}px`; };
    place();
    addEventListener("resize", place);
    editor.scrollTop = pre.scrollTop;
    loadKatex().then(draw).catch(() => {});
  });
})();
