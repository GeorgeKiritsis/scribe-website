# Scribe website

The landing page for [Scribe](../papyrus), a free desktop editor for LaTeX and Python. It is set like a LaTeX article, and its demos are recorded from the real app.

## Look at it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

No build step: `index.html`, `styles.css` and `main.js` are the whole site. Deploy the folder as it is, for example with GitHub Pages. The `recorder/` folder isn't needed on the server.

Before publishing, set `DOWNLOAD_URL` at the top of `main.js` to the app's releases page.

## What's where

- `index.html`: the page, an article with numbered sections, captioned figures and a booktabs table.
- `main.js`: Figure 1, the app's welcome animation ported from `papyrus/src/welcome.ts`. It also starts each demo when it scrolls into view and pauses it when it leaves; with Reduce Motion on, a demo waits for a click.
- `assets/fonts`: Latin Modern (GUST Font License), from the latex.css package.
- `assets/demos`: one demo per feature.
  - `.webm` and `.mp4` are what the page plays.
  - `.jpg` is the poster shown before it plays.
  - `.gif` is a copy for READMEs and posts; the page never loads it.

## Recording the demos again

The demos come from the real Scribe frontend, running in WebKit against a mock backend fed with the app's example project.

```bash
cd ../papyrus && npx vite build   # the app the recorder films
cd ../scribe-website/recorder
npm install                       # Playwright and a bundled ffmpeg
node record.mjs                   # every scene, or e.g. `node record.mjs notes table`
node encode.mjs                   # raw/*.webm -> ../assets/demos
node shots.mjs                    # screenshots, and a check that every demo loads and plays
```

- `record.mjs` scripts each scene at a human pace, with a camera that zooms and pans to follow the action and a drawn pointer.
- `encode.mjs` trims each recording to its loop and writes MP4, WebM, a poster and a GIF.
- To change a demo, edit its scene in `SCENES`, then record and encode that scene alone.

- `motion.js`: smooth scrolling (Lenis, MIT, in `assets/vendor`), text that appears as it scrolls into view, the first screen drifting apart as you leave it, demo windows rising into place. With Reduce Motion on, only gentle fades remain. `recorder/motion-check.mjs` records a scroll through the page to check it.
