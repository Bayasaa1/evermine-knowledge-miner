/**
 * Squad web builds: pure helpers to order a Web Mind squad, write handoff
 * notes, pull code blocks out of a Mind reply and make a sandboxed preview.
 */

export type CodeBlock = { lang: string; code: string; file: string };

const EXT: Record<string, string> = { html: "html", htm: "html", tsx: "tsx", jsx: "jsx", ts: "ts", js: "js", javascript: "js", typescript: "ts", sql: "sql", css: "css", json: "json", python: "py", py: "py", bash: "sh", sh: "sh" };

const SAFE_PATH = /^(?!\/)(?!.*\.\.)[\w@.-]+(\/[\w@.\[\]()-]+)*\.[\w]+$/;

/** A project path from the fence info ("tsx src/App.tsx", "tsx file=src/App.tsx") or a first-line "// file: x" comment. */
function pathOf(info: string, code: string): string | null {
  const fromInfo = info.trim().split(/\s+/).map((t) => t.replace(/^(file|path|title)=/, "").replace(/^["']|["']$/g, "")).find((t) => t.includes(".") && SAFE_PATH.test(t));
  if (fromInfo) return fromInfo;
  const first = code.split("\n", 1)[0] ?? "";
  const m = first.match(/^\s*(?:\/\/|#|--|<!--|\/\*)\s*(?:file|path)\s*:\s*([^\s*>]+)/i);
  return m?.[1] && SAFE_PATH.test(m[1]) ? m[1] : null;
}

/** Fenced code blocks in a reply, each with a download file name (the stated project path when given). */
export function extractCodeBlocks(reply: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  const seen: Record<string, number> = {};
  for (const m of reply.matchAll(/```([\w+-]*)([^\n]*)\n([\s\S]*?)```/g)) {
    const lang = (m[1] || "txt").toLowerCase();
    const code = (m[3] ?? "").trimEnd();
    if (!code.trim()) continue;
    const path = pathOf(m[2] ?? "", code);
    if (path) { out.push({ lang, code, file: path }); continue; }
    const ext = EXT[lang] ?? "txt";
    const base = ext === "html" ? "index" : ext === "sql" ? "schema" : ext === "css" ? "styles" : ext === "tsx" || ext === "jsx" ? "App" : "file";
    const n = (seen[`${base}.${ext}`] = (seen[`${base}.${ext}`] ?? 0) + 1);
    out.push({ lang, code, file: n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}` });
  }
  return out;
}

/** One project tree from several squad replies, in order: a later version of the same path replaces the earlier one. */
export function mergeProjectFiles(replies: string[]): CodeBlock[] {
  const files = new Map<string, CodeBlock>();
  for (const r of replies) for (const b of extractCodeBlocks(r)) { files.delete(b.file); files.set(b.file, b); }
  return [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/** True when the reply has something a browser can show. */
export function previewable(blocks: CodeBlock[]): boolean {
  return blocks.some((b) => /^(html|htm|tsx|jsx)$/.test(b.lang));
}

const TAILWIND = '<script src="https://cdn.tailwindcss.com"></script>';

/** One HTML document for a sandboxed iframe (Tailwind CDN; React via Babel). */
export function previewHtml(blocks: CodeBlock[]): string {
  const css = blocks.filter((b) => b.lang === "css").map((b) => b.code).join("\n");
  const style = css ? `<style>${css}</style>` : "";
  const html = blocks.find((b) => b.lang === "html" || b.lang === "htm");
  if (html) {
    const doc = html.code;
    if (/<html[\s>]/i.test(doc)) return /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (h) => `${h}${TAILWIND}${style}`) : doc.replace(/<html[^>]*>/i, (h) => `${h}<head>${TAILWIND}${style}</head>`);
    return `<!doctype html><html><head><meta charset="utf-8">${TAILWIND}${style}</head><body>${doc}</body></html>`;
  }
  const react = blocks.filter((b) => b.lang === "tsx" || b.lang === "jsx").map((b) => b.code).join("\n\n");
  if (!react) return "";
  const names = [...react.matchAll(/export\s+default\s+function\s+(\w+)/g)].map((m) => m[1]);
  const fallback = [...react.matchAll(/(?:function|const)\s+([A-Z]\w*)/g)].map((m) => m[1]);
  const root = names.at(-1) ?? fallback.at(-1) ?? "App";
  const src = react
    .replace(/^\s*import[^\n]*$/gm, "")
    .replace(/export\s+default\s+function/g, "function")
    .replace(/^\s*export\s+default\s+\w+;?\s*$/gm, "")
    .replace(/export\s+(const|function|type|interface)/g, "$1");
  return `<!doctype html><html><head><meta charset="utf-8">${TAILWIND}${style}
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script></head>
<body><div id="root"></div><script>
try {
  const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;
  const code = Babel.transform(${JSON.stringify(src)} + "\\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${root}));", { presets: [["typescript", { isTSX: true, allExtensions: true }], "react"] }).code;
  new Function("React","ReactDOM","useState","useEffect","useMemo","useRef","useCallback","Fragment", code)(React, ReactDOM, useState, useEffect, useMemo, useRef, useCallback, Fragment);
} catch (e) { document.body.innerHTML = '<pre style="color:#b91c1c;padding:12px;white-space:pre-wrap">' + String(e) + '</pre>'; }
</script></body></html>`;
}

const FILES = "Every file goes in its own fenced block whose info line is the language then the project path, e.g. ```tsx src/components/Header.tsx or ```sql db/schema.sql. Write whole files, never fragments";
const SQUAD: { role: string; match: RegExp; task: string }[] = [
  { role: "PM", match: /product|manager|\bpm\b|lead|scrum|agile/i, task: "scope the MVP from the user's goal: write a short product brief, 3-5 user stories with acceptance criteria, what is out of scope, and one concrete assignment for each teammate below. Save it as ```md docs/brief.md" },
  { role: "Architect", match: /farley|continuous|software architect|solution architect/i, task: "write the architecture: modules, folder tree, data flow, the test strategy, and the project skeleton files (package.json for a Vite + React + TypeScript + Tailwind app, tsconfig.json, vite.config.ts, README.md with run steps, docs/architecture.md)" },
  { role: "UX", match: /\bux\b|research|usab|strateg/i, task: "define users, key user flows and the page/screen map in ```md docs/ux.md" },
  { role: "UI", match: /\bui\b|design|figma|visual|gary simon/i, task: "write the design system as code: src/styles.css (Tailwind + CSS variables for colors, type scale, spacing) and the reusable components in src/components/ui/*.tsx" },
  { role: "Backend", match: /back.?end|server|system|database|sql|api|hussein|nasser/i, task: "write db/schema.sql (PostgreSQL tables, indexes, row level security) and the typed data layer in src/lib/api.ts the UI needs" },
  { role: "Fullstack", match: /full.?stack|josh/i, task: "write the integration: auth, payments/webhook handlers and any server endpoints as files under src/server/, wired to the schema and data layer above" },
  { role: "Frontend", match: /front.?end|javascript|react|html|css|herrington/i, task: "write every page and the app shell (src/main.tsx, src/App.tsx, src/pages/*.tsx) using the design system and data layer above, plus ONE self-contained ```html preview.html (Tailwind CDN, inline script) showing the main screens" },
  { role: "QA", match: /quality|qa|a11y|access|perform|test|primeagen/i, task: "review all files above for bugs, security, accessibility (WCAG 2.1) and performance; output the corrected versions of every file you change (same path) plus tests in src/**/*.test.ts, and the final corrected ```html preview.html" },
];

/** Squad order PM -> UX -> UI -> Backend -> Frontend -> QA; unknown Minds go last. */
export function squadOrder<T extends { mind_name: string; role?: string }>(minds: T[]): T[] {
  const rank = (m: T) => { const i = SQUAD.findIndex((s) => s.match.test(m.mind_name)); return i < 0 ? SQUAD.length : i; };
  return minds.filter((m) => m.role !== "judge").map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(({ m }) => m);
}

/** Room note for one relay step; the reply builds on the artifacts above. */
export function relayNote(mindName: string, step: number, total: number): string {
  const job = SQUAD.find((s) => s.match.test(mindName));
  const task = job ? job.task : "add your expert part of the build as code or a concrete spec";
  const last = step === total ? " You are the LAST step: your reply must contain the final deployable code and the final preview.html." : "";
  return `[Squad build step ${step}/${total} — not from a person] You are an autonomous engineer in a web build squad. Read the user's goal and every teammate's artifact above and build directly on them (reuse their names, tokens, tables). Your job: ${task}. ${FILES}. Write the files now; no small talk, no placeholders or TODOs.${last}`;
}

/** Mind replies of the squad run that ends at `index`: everything since the last person's message. */
export function squadReplies(messages: { sender_kind: string; body: string }[], index: number): string[] {
  const out: string[] = [];
  for (let i = index; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.sender_kind !== "mind") break;
    out.unshift(m.body);
  }
  return out;
}
