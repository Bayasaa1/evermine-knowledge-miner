import type { GamingExtraction } from "@/lib/gemini";

/**
 * Teammate bot generator.
 *
 * Builds a ready-to-run Mineflayer bot (Minecraft Java) whose behaviour is
 * seeded from the mined Gaming Mind: skills, tactics and decision patterns
 * become named behaviours the bot can announce and follow. The Teammate plays
 * alongside you on your own server — it never watches your screen; that is the
 * Coach's job.
 */

export function buildTeammateBotSource(mindName: string, gaming: GamingExtraction): string {
  const brain = {
    minedBy: "Evermind Gaming Mind",
    player: mindName,
    skills: gaming.skills.map((s) => ({ name: s.name, kind: s.kind, detail: s.detail })),
    tactics: gaming.tactics.map((t) => ({ name: t.name, when: t.when, steps: t.steps, counter: t.counter })),
    commentaryStyle: gaming.commentaryStyle,
    mistakes: gaming.mistakes,
    // The soul of the clone: how the player talks, thinks, and feels in game.
    communication: gaming.communication.map((c) => ({ kind: c.kind, quote: c.quote, context: c.context })),
    mindset: gaming.mindset,
    emotions: gaming.emotions.map((e) => ({ trigger: e.trigger, reaction: e.reaction, quote: e.quote })),
  };
  const botName = `${mindName.replace(/[^A-Za-z0-9]+/g, "_")}_Bot`.slice(0, 30);

  // The generated file uses only plain string concatenation so this template
  // never nests backticks.
  const lines = [
    `// ${mindName} — Evermind Teammate Bot (Minecraft Java)`,
    "// Generated from your mined Gaming Mind. The Teammate PLAYS with you; it",
    "// cannot watch your screen (that is the Coach, inside Evermind).",
    "//",
    "// Setup:",
    "//   npm install mineflayer mineflayer-pathfinder",
    "//   node teammate-bot.js --host <server> --port 25565",
    "",
    'const mineflayer = require("mineflayer");',
    'const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");',
    "",
    "const BRAIN = " + JSON.stringify(brain, null, 2) + ";",
    "",
    "const args = process.argv.slice(2);",
    "const arg = (name, fallback) => {",
    '  const i = args.indexOf("--" + name);',
    "  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;",
    "};",
    "",
    "const bot = mineflayer.createBot({",
    '  host: arg("host", "localhost"),',
    '  port: Number(arg("port", "25565")),',
    `  username: arg("name", ${JSON.stringify(botName)}),`,
    '  version: arg("version", false),',
    "});",
    "",
    "bot.loadPlugin(pathfinder);",
    "",
    'bot.once("spawn", () => {',
    "  const moves = new Movements(bot);",
    "  bot.pathfinder.setMovements(moves);",
    `  bot.chat(${JSON.stringify(`${mindName}'s teammate reporting in. `)} + '"follow", "stay", "guard", "skills" or "tactic <name>".');`,
    "});",
    "",
    "let following = null;",
    "let guardTimer = null;",
    "",
    'bot.on("chat", (username, message) => {',
    "  if (username === bot.username) return;",
    "  const msg = message.toLowerCase();",
    "",
    '  if (msg === "follow") {',
    "    const target = bot.players[username] && bot.players[username].entity;",
    '    if (!target) return bot.chat("I cannot see you — come closer.");',
    "    following = username;",
    "    bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);",
    '    bot.chat("On your tail, " + username + ".");',
    '  } else if (msg === "stay") {',
    "    following = null;",
    "    if (guardTimer) { clearInterval(guardTimer); guardTimer = null; }",
    "    bot.pathfinder.setGoal(null);",
    '    bot.chat("Holding position.");',
    '  } else if (msg === "skills") {',
    '    const names = BRAIN.skills.map((s) => s.name).join(", ") || "still learning";',
    '    bot.chat("Skills I mined: " + names);',
    '  } else if (msg.indexOf("tactic") === 0) {',
    "    const name = message.slice(6).trim().toLowerCase();",
    "    const tactic = BRAIN.tactics.find((t) => t.name.toLowerCase().indexOf(name) >= 0);",
    '    if (!tactic) return bot.chat("I do not know that tactic yet — try skills.");',
    '    bot.chat("Tactic " + tactic.name + " — use when: " + tactic.when);',
    "    tactic.steps.forEach((step, i) =>",
    "      setTimeout(() => bot.chat((i + 1) + '. ' + step), 800 * (i + 1)),",
    "    );",
    '  } else if (msg === "guard") {',
    '    bot.chat("Guarding you.");',
    "    if (guardTimer) clearInterval(guardTimer);",
    "    guardTimer = setInterval(() => {",
    "      if (!following) { clearInterval(guardTimer); guardTimer = null; return; }",
    "      const mob = bot.nearestEntity((e) =>",
    '        e.type === "hostile" && e.position.distanceTo(bot.entity.position) < 12,',
    "      );",
    "      if (mob) bot.attack(mob);",
    "    }, 1000);",
    "  }",
    "});",
    "",
    "// Partner banter in the mined voice: real communication quotes first,",
    "// falling back to commentary style lines.",
    'const VOICE = (BRAIN.communication.length > 0',
    '  ? BRAIN.communication.filter((c) => c.kind !== "tilt").map((c) => c.quote)',
    "  : BRAIN.commentaryStyle);",
    'bot.on("physicsTick", () => {',
    "  if (!following || VOICE.length === 0 || Math.random() > 0.0004) return;",
    "  const line = VOICE[Math.floor(Math.random() * VOICE.length)];",
    "  bot.chat(String(line).slice(0, 200));",
    "});",
    "",
    "// React like the player when someone on the team scores.",
    'bot.on("chat", (username, message) => {',
    '  if (username === bot.username || !/win|clutch|nice|gg|yes!/i.test(message)) return;',
    '  const emo = BRAIN.emotions.find((e) => /win|clutch|success/i.test(e.trigger));',
    "  if (emo && emo.quote) bot.chat(String(emo.quote).slice(0, 200));",
    "});",
    "",
    'bot.on("death", () => {',
    "  const mistake = BRAIN.mistakes[0];",
    '  bot.chat(mistake ? "Classic mistake — " + String(mistake).slice(0, 150) : "That went badly. Regrouping.");',
    "});",
    "",
    'bot.on("error", (err) => console.error("Bot error:", err));',
    'bot.on("end", () => console.log("Teammate disconnected."));',
    "",
  ];
  return lines.join("\n");
}

/** Trigger a browser download of the teammate bot source. */
export function downloadTeammateBot(mindName: string, gaming: GamingExtraction): void {
  const source = buildTeammateBotSource(mindName, gaming);
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "teammate-bot.js";
  a.click();
  URL.revokeObjectURL(url);
}
