// Turns raw/<scene>.webm (from record.mjs) into what the page uses, in ../assets/demos:
//   <scene>.mp4   H.264, for Safari          <scene>.webm  VP9, smaller, for the rest
//   <scene>.jpg   the poster, shown before it plays (and with Reduce Motion on)
//   <scene>.gif   for sharing (README, posts); not loaded by the page
//
//   node encode.mjs              every recorded scene
//   node encode.mjs notes        just these
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const here = path.dirname(new URL(import.meta.url).pathname);
const raw = `${here}/raw`;
const out = path.resolve(here, "../assets/demos");
fs.mkdirSync(out, { recursive: true });

// The poster is the frame this far into the loop: a moment where the feature is visible.
const POSTER_AT = { notebook: 0.86, notes: 0.8, reader: 0.55, cards: 0.45, table: 0.62, errors: 0.55 };

const run = (args) => execFileSync(ffmpeg, ["-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;

const wanted = process.argv.slice(2);
for (const file of fs.readdirSync(raw).filter((f) => f.endsWith(".webm"))) {
  const name = file.replace(/\.webm$/, "");
  if (wanted.length && !wanted.includes(name)) continue;
  const marks = JSON.parse(fs.readFileSync(`${raw}/${name}.json`, "utf8"));
  if (marks.end === undefined) {
    console.log(`${name}: the recording didn't finish; record it again`);
    continue;
  }
  const start = Math.max(0, marks.start - 0.15);
  const length = marks.end - start;
  const fade = `fade=t=in:st=0:d=0.35,fade=t=out:st=${(length - 0.4).toFixed(2)}:d=0.4`;
  const input = ["-ss", start.toFixed(2), "-t", length.toFixed(2), "-i", `${raw}/${file}`];

  run([...input, "-vf", `${fade},format=yuv420p`, "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-movflags", "+faststart", "-an", `${out}/${name}.mp4`]);
  run([...input, "-vf", fade, "-r", "30", "-c:v", "libvpx-vp9", "-crf", "44", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-an", `${out}/${name}.webm`]);
  run(["-ss", (start + length * (POSTER_AT[name] ?? 0.5)).toFixed(2), "-i", `${raw}/${file}`, "-frames:v", "1", "-vf", "scale=1280:-1:flags=lanczos", "-q:v", "6", `${out}/${name}.jpg`]);
  run([...input, "-filter_complex", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", `${out}/${name}.gif`]);
  console.log(`${name}: ${length.toFixed(1)} s · mp4 ${kb(`${out}/${name}.mp4`)} · webm ${kb(`${out}/${name}.webm`)} · jpg ${kb(`${out}/${name}.jpg`)} · gif ${kb(`${out}/${name}.gif`)}`);
}
