// How the page moves: smooth scrolling, text that appears as it scrolls into view, the
// opening screen drifting apart as you leave it, and demo windows that rise into place.
// Everything here only adds classes and CSS variables; styles.css says what they look like.
// Without JavaScript the page is simply all there, still.
"use strict";

(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  root.classList.add("motion", reduce ? "motion-reduced" : "motion-full");

  // ---------- smooth scrolling (a mouse wheel glides as a trackpad does) ----------
  let lenis = null;
  if (!reduce && window.Lenis) {
    // links in the page land below the menu bar
    const bar = document.querySelector(".topbar")?.offsetHeight ?? 0;
    lenis = new window.Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), anchors: { offset: -(bar + 24) } });
    const tick = (time) => {
      lenis.raf(time);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- text that appears ----------
  /** Wrap each word of `el` in a span, numbered, so the words can arrive one after another. */
  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let i = 0;
    for (const node of nodes) {
      if (!node.data.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const part of node.data.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.append(part);
          continue;
        }
        const word = document.createElement("span");
        word.className = "w";
        word.style.setProperty("--i", String(i++));
        word.textContent = part;
        frag.append(word);
      }
      node.replaceWith(frag);
    }
    el.classList.add("split");
  }

  const pending = [];
  /** `kind`: rise, left, right or fade. `delay` in ms, for things that follow each other. */
  function reveal(el, kind = "rise", delay = 0) {
    if (!el) return;
    el.classList.add("reveal", `reveal-${kind}`);
    el.style.setProperty("--d", `${delay}ms`);
    pending.push(el);
  }

  const abstract = document.querySelector(".abstract");
  if (abstract) {
    splitWords(abstract.querySelector("h2"));
    reveal(abstract.querySelector("h2"), "fade");
    reveal(abstract.querySelector("p"), "rise", 150);
  }
  for (const p of document.querySelectorAll(".article > .download")) reveal(p, "rise", 200);

  for (const section of document.querySelectorAll(".article > section:not(.abstract)")) {
    const heading = section.querySelector("h2");
    if (heading) {
      splitWords(heading);
      reveal(heading, "fade");
    }
    if (section.classList.contains("feature")) {
      // the text comes in from its own side; the demo rises with the scroll (below)
      const text = section.querySelector(".feature-text");
      const side = section.classList.contains("flip") ? "right" : "left";
      for (const [i, p] of [...text.querySelectorAll("p")].entries()) reveal(p, side, 180 + i * 120);
      reveal(section.querySelector("figcaption"), "fade", 300);
      continue;
    }
    for (const [i, p] of [...section.querySelectorAll(":scope > p, :scope > ol, :scope > .table-wrap > table > caption")].entries()) {
      reveal(p, "rise", 140 + i * 110);
    }
    for (const [i, li] of [...section.querySelectorAll("ol > li")].entries()) reveal(li, "rise", 260 + i * 120);
    for (const [i, tr] of [...section.querySelectorAll("tbody tr")].entries()) reveal(tr, "fade", 120 + i * 60);
    for (const [i, item] of [...section.querySelectorAll(".tech-list > div")].entries()) reveal(item, "rise", 120 + i * 70);
    reveal(section.querySelector(".listing"), "rise", 150);
    for (const [i, cell] of [...section.querySelectorAll(".template")].entries()) reveal(cell, "rise", 80 + i * 70);
    reveal(section.querySelector(".pg"), "rise", 200);
    for (const [i, card] of [...section.querySelectorAll(".card")].entries()) reveal(card, "rise", 100 + (i % 2) * 120 + Math.floor(i / 2) * 60);
    for (const [i, box] of [...section.querySelectorAll(".platform")].entries()) reveal(box, "rise", 120 + i * 110);
  }

  // Theorem 1 sets itself: the frame draws, the statement arrives word by word, then the
  // proof, and the ∎ comes last.
  const theorem = document.querySelector(".theorem");
  if (theorem) {
    splitWords(theorem.querySelector(".statement"));
    reveal(theorem, "frame");
    theorem.querySelector(".statement").style.setProperty("--d", "450ms");
    reveal(theorem.querySelector(".proof"), "fade", 1500);
  }
  reveal(document.querySelector(".colophon"), "fade");

  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      seen.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  for (const el of pending) seen.observe(el);

  // ---------- the menu marks the package (section) being read ----------
  const links = new Map([...document.querySelectorAll(".packages a[href^='#']")].map((a) => [a.getAttribute("href").slice(1), a]));
  const current = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const link = links.get(e.target.id);
      if (!link) continue;
      if (e.isIntersecting) {
        for (const other of links.values()) other.removeAttribute("aria-current");
        link.setAttribute("aria-current", "true");
      } else if (link.getAttribute("aria-current")) {
        link.removeAttribute("aria-current");
      }
    }
  }, { rootMargin: "-45% 0px -45% 0px" });
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) current.observe(section);
  }

  // ---------- movement tied to scrolling ----------
  if (reduce) return;
  const hero = document.querySelector(".hero");
  const demos = [...document.querySelectorAll(".demo")];
  let queued = false;
  function frame() {
    queued = false;
    const vh = innerHeight;
    // 0 at the top of the page, 1 once the first screen has scrolled away
    if (hero) hero.style.setProperty("--out", Math.min(1, Math.max(0, scrollY / (vh * 0.9))).toFixed(3));
    // each demo: 0 as it comes up the bottom of the screen, 1 once it is well in view
    for (const d of demos) {
      const top = d.getBoundingClientRect().top;
      d.style.setProperty("--in", Math.min(1, Math.max(0, (vh - top) / (vh * 0.7))).toFixed(3));
    }
  }
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  lenis?.on("scroll", schedule);
  frame();
})();
