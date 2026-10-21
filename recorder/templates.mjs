// Compiles Scribe's project templates (from the app's own source) into the PDFs and thumbnails
// the site's template gallery shows, so the gallery is real Scribe output.
//   node templates.mjs        -> ../assets/templates/<name>.pdf and <name>.jpg
// Needs TeX Live (latexmk, with the IEEEtran, acmart and beamer classes) and pdftoppm.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const here = path.dirname(new URL(import.meta.url).pathname);
const app = process.env.SCRIBE_APP ?? path.resolve(here, "../../papyrus");
const out = path.resolve(here, "../assets/templates");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "scribe-templates-"));
fs.mkdirSync(out, { recursive: true });

// The templates module is plain data; bundle it to read TEMPLATES.
async function load(entry, name) {
  const file = path.join(work, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: file, logLevel: "error" });
  return import(file);
}
const { TEMPLATES } = await load(`${app}/src/templates.ts`, "templates");

// For lecture notes, the app's own Markdown-to-LaTeX and note preamble (from notes.ts).
const notes = fs.readFileSync(`${app}/src/notes.ts`, "utf8");
const md = notes.slice(notes.indexOf("// ---------- Markdown to LaTeX"), notes.indexOf("/** Copy the selection"));
const pre = /const NOTE_PREAMBLE = String\.raw`[\s\S]*?`;/.exec(notes)[0];
fs.writeFileSync(path.join(work, "notes.ts"), `${md}\n${pre}\nexport { NOTE_PREAMBLE };\n`);
const { markdownToLatex, NOTE_PREAMBLE } = await load(path.join(work, "notes.ts"), "notes");

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });

function compile(dir, main) {
  run("latexmk", ["-pdf", "-interaction=nonstopmode", "-halt-on-error", main], dir);
  return path.join(dir, main.replace(/\.tex$/, ".pdf"));
}

function publish(pdf, name) {
  fs.copyFileSync(pdf, `${out}/${name}.pdf`);
  run("pdftoppm", ["-jpeg", "-jpegopt", "quality=82", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "560", pdf, `${out}/${name}`], here);
  console.log(`${name}: ${Math.round(fs.statSync(`${out}/${name}.pdf`).size / 1024)} KB`);
}

for (const template of TEMPLATES) {
  const name = slug(template.name);
  const dir = path.join(work, name);
  for (const [rel, content] of Object.entries(template.files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content.replaceAll("Your Name", "Georgios Kiritsis"));
  }
  try {
    if (name === "lecture-notes") {
      // a note becomes a PDF the way Export Note as PDF does it
      const lecture = Object.keys(template.files).find((f) => /Lecture 1\.md$/.test(f));
      const tex = `${NOTE_PREAMBLE}\\begin{document}\n${markdownToLatex(template.files[lecture], { listings: true })}\\end{document}\n`;
      fs.writeFileSync(path.join(dir, "note.tex"), tex);
      publish(compile(dir, "note.tex"), name);
    } else if (name === "article-with-a-notebook") {
      // its figure and numbers need a notebook run; the example paper is that, done
      publish(`${app}/example/build/main.pdf`, name);
    } else {
      publish(compile(dir, "main.tex"), name);
    }
  } catch (e) {
    console.log(`${name}: FAILED`, String(e.stderr ?? e).split("\n").slice(-6).join("\n"));
  }
}
if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true });
else console.log("kept", work);
