/**
 * Squad web builds: pure helpers to order a Web Mind squad, write handoff
 * notes, pull code blocks out of a Mind reply and make a sandboxed preview.
 */

export type CodeBlock = { lang: string; code: string; file: string };

const EXT: Record<string, string> = { html: "html", htm: "html", tsx: "tsx", jsx: "jsx", ts: "ts", js: "js", javascript: "js", typescript: "ts", sql: "sql", css: "css", json: "json", python: "py", py: "py", bash: "sh", sh: "sh" };

/** Fenced code blocks in a reply, each with a download file name. */
export function extractCodeBlocks(reply: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  const seen: Record<string, number> = {};
  for (const m of reply.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)) {
    const lang = (m[1] || "txt").toLowerCase();
    const code = (m[2] ?? "").trimEnd();
    if (!code.trim()) continue;
    const ext = EXT[lang] ?? "txt";
    const base = ext === "html" ? "index" : ext === "sql" ? "schema" : ext === "css" ? "styles" : ext === "tsx" || ext === "jsx" ? "App" : "file";
    const n = (seen[`${base}.${ext}`] = (seen[`${base}.${ext}`] ?? 0) + 1);
    out.push({ lang, code, file: n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}` });
  }
  return out;
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

const SQUAD: { role: string; match: RegExp; task: string }[] = [
  { role: "UX", match: /\bux\b|research|usab|strateg/i, task: "define users, key user flows and the page/screen map (information architecture)" },
  { role: "UI", match: /\bui\b|design|figma|visual/i, task: "define design tokens (colors, type scale, spacing) and the component list with layout" },
  { role: "Backend", match: /back.?end|server|system|database|sql|api/i, task: "write the PostgreSQL schema (with RLS where needed) and the API endpoints the UI needs" },
  { role: "Frontend", match: /front.?end|javascript|react|html|css/i, task: "write ONE complete, self-contained ```html file (Tailwind classes, inline <script> for interactivity) implementing the whole site using the design and data shape above" },
  { role: "QA", match: /quality|qa|a11y|access|perform|test/i, task: "audit the Frontend code for accessibility (WCAG 2.1) and performance, then output the corrected FINAL complete ```html file" },
];

/** Squad order UX -> UI -> Backend -> Frontend -> QA; unknown Minds go last. */
export function squadOrder<T extends { mind_name: string; role?: string }>(minds: T[]): T[] {
  const rank = (m: T) => { const i = SQUAD.findIndex((s) => s.match.test(m.mind_name)); return i < 0 ? SQUAD.length : i; };
  return minds.filter((m) => m.role !== "judge").map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(({ m }) => m);
}

/** Room note for one relay step; the reply builds on the artifacts above. */
export function relayNote(mindName: string, step: number, total: number): string {
  const job = SQUAD.find((s) => s.match.test(mindName));
  const task = job ? job.task : "add your expert part of the build as code or a concrete spec";
  const last = step === total ? " You are the LAST step: your reply must contain the final deployable code." : "";
  return `[Squad build step ${step}/${total} — not from a person] You are an autonomous engineer in a web build squad. Read the user's goal and every teammate's artifact above and build directly on them (reuse their names, tokens, tables). Your job: ${task}. Write the code now in fenced code blocks with the language tag; no small talk, no placeholders or TODOs.${last}`;
}
