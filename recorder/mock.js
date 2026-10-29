// A stand-in for Scribe's Rust backend, so the real frontend (papyrus/dist) runs in a browser
// for recording. Files come from the app's example project (window.__FILES__, filled in by
// record.mjs); what the app writes is kept in memory and read back.
(() => {
  const F = window.__FILES__;
  const written = (window.__W__ = {});
  const bin = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()).buffer;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // the example notebook, split into cells the way the backend does it
  const cells = [];
  for (const chunk of F.notebook.split(/^(?=# %%)/m)) {
    const [head, ...rest] = chunk.split("\n");
    const body = rest.join("\n").trim();
    if (!body) continue;
    const fig = /\[figure:\s*([^\]]+)\]/.exec(head);
    if (head.includes("[markdown]")) cells.push({ cell_type: "markdown", source: body.split("\n").map((l) => l.replace(/^# ?/, "")).join("\n"), figure_id: null });
    else cells.push({ cell_type: fig ? "figure" : "code", source: body, figure_id: fig ? fig[1].trim() : null });
  }
  const values = JSON.parse(F.values);
  const text = (rel) => written[rel] ?? F.text[rel];

  // A compile fails while main.tex has a misspelt \reff in it (the errors demo), else succeeds.
  function compile() {
    const main = text("main.tex") ?? "";
    const at = main.split("\n").findIndex((l) => l.includes("\\reff{"));
    if (at >= 0) {
      const line = main.split("\n")[at];
      const before = line.slice(0, line.indexOf("\\reff") + 5);
      return { ok: false, engine: "latexmk", pdf: null, log: `./main.tex:${at + 1}: Undefined control sequence.\nl.${at + 1} ${before}\n                 {sec:method}\n` };
    }
    return { ok: true, engine: "latexmk", pdf: "build/main.pdf", log: "Latexmk: All targets (build/main.pdf) are up-to-date\n" };
  }

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    // callbacks kept, so Channels (the AI's streamed replies) can be fed
    callbacks: {},
    transformCallback(cb) { const id = Math.floor(Math.random() * 1e9); this.callbacks[id] = cb; return id; },
    invoke: async (cmd, a = {}) => {
      switch (cmd) {
        case "check_tools": return { tex: "latexmk", python: "python3" };
        case "ai_has_key": return true;
        case "ai_set_key": return null;
        case "ai_cancel": return null;
        case "ai_models": return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];
        case "ai_stream": {
          const r = a.request;
          const cb = window.__TAURI_INTERNALS__.callbacks[a.onEvent.id];
          let reply;
          if (r.system.includes("You edit part")) {
            const text = r.messages[0].content.split("The text to replace:\n")[1] ?? "";
            reply = text.replace(/ one of the easiest to get wrong by habit\./, " easy to get wrong by habit.").replace(/is simple and well understood/, "is simple").replace(/ This note compares the three on a problem small enough to rerun in under a second, so the comparison can be checked rather than taken on trust\./, " We compare the three on a problem small enough to rerun in a second.");
          } else if (r.system.includes("autocomplete")) {
            reply = " which makes it the fastest of the three on this problem.";
          } else {
            reply = "Momentum converges fastest here: it crosses a training loss of 0.1 in about 26 epochs, against more than 40 for SGD. Adam lands in between but reaches the best test accuracy.\n\nTo say so in the conclusion, with the numbers coming from the notebook:\n\n```latex\nMomentum reaches a training loss of $0.1$ first, after \\nbval{fastest-epochs} epochs,\nwhile Adam ends with the highest test accuracy (\\nbval{best-acc}).\n```";
          }
          const words = reply.split(/(?<= )/);
          for (let i = 0; i < words.length; i++) {
            await wait(25);
            cb({ message: { type: "delta", text: words[i] }, index: i });
          }
          cb({ message: { type: "done", reason: "end_turn" }, index: words.length });
          return null;
        }
        case "list_files": return [...F.files, ...Object.keys(written).filter((f) => !F.files.includes(f) && !f.startsWith("."))];
        case "list_dirs": return ["data", "figures", "notebooks", "notes", "papers", "sections"];
        case "read_file": {
          const t = text(a.rel);
          if (t === undefined) throw new Error(`no ${a.rel}`);
          return t;
        }
        case "write_file": written[a.rel] = a.content; return null;
        // TikZ previews really compile: record.mjs runs latexmk on the source and serves the PDF
        case "compile_snippet": return (await fetch("/compile-snippet", { method: "POST", body: a.source })).json();
        case "read_binary":
          if (a.rel.startsWith("build/tikz/")) return bin("/files/tikz/" + a.rel.slice(11));
          if (a.rel === "build/main.pdf" || a.rel.startsWith("papers/")) return bin("/files/main.pdf");
          throw new Error(`no ${a.rel}`);
        case "read_settings": return JSON.stringify(window.__SETTINGS__ ?? {});
        case "parse_notebook": return { cells, figure_ids: ["fig-curves", "fig-boundary"], value_names: Object.keys(values["notebooks/experiment.py"] ?? {}), stale: [] };
        case "compile": await wait(700); return compile();
        case "run_notebook": return { ok: true, log: "", figures: [] };
        case "kernel_run_cell": {
          await wait(900);
          const figure = a.code.includes("subplots") ? [window.__FIG__] : [];
          return { id: a.cellId, ok: true, stdout: figure.length ? "" : "", stderr: "", figures: figure };
        }
        case "git_branch": return "main";
        case "git_status": return [];
        case "git_identity": return { name: "Georgios Kiritsis", email: "georgios@example.org" };
        case "spell_available": return false;
        case "spell_check": return [];
        case "history_list": return [];
        case "file_sizes": return [];
        case "zotero_get": throw new Error("Zotero isn't running.");
        case "python_bin": return "python3";
        case "plugin:window|is_fullscreen": return false;
        default: return null;
      }
    },
  };
})();
