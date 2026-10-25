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

// ---------------------------------------------------------------------------
// Universal Tactical Playbook (any genre). Derived read-only from the mined
// Gaming Mind — no AI call, mined data is never changed.
// ---------------------------------------------------------------------------

export type GameGenre = "FPS" | "Action/Open-World" | "Strategy" | "MOBA" | "RPG" | "Sandbox" | "Unknown";

export type PlaystyleMetrics = {
  aggression: number;
  risk_tolerance: number;
  resource_greed: number;
  team_play: number;
  mechanical_tempo: number;
};

export type StateActionRule = {
  when_hud_or_map_state: string;
  do_micro_or_macro_action: string;
  creator_reason: string;
};

export type TacticalPlaybook = {
  detected_game_or_genre: string;
  genre: GameGenre;
  is_minecraft: boolean;
  playstyle_metrics: PlaystyleMetrics;
  state_action_rules: StateActionRule[];
  callout_vocabulary: string[];
};

const GENRE_WORDS: [GameGenre, RegExp][] = [
  ["Sandbox", /minecraft|creeper|redstone|nether|craft|mine block|terraria|roblox|sandbox/i],
  ["MOBA", /\b(lane|jungle|gank|minion|creep score|tower|baron|dragon|roshan|dota|league of legends|mobile legends|moba)\b/i],
  ["FPS", /\b(headshot|crosshair|aim|spray|recoil|peek|sniper|rifle|valorant|cs ?2|counter[- ]strike|fortnite|apex|call of duty|pubg|fps)\b/i],
  ["Strategy", /\b(build order|macro|apm|supply|rts|starcraft|age of empires|civilization|expand|economy)\b/i],
  ["RPG", /\b(quest|level up|xp|skill tree|boss|dungeon|loot|rpg|elden ring|mana|party)\b/i],
  ["Action/Open-World", /\b(open world|gta|parkour|combo|dodge|stealth|mission|zelda|action)\b/i],
];

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const score = (hits: number, total: number) =>
  Math.max(0, Math.min(100, Math.round(50 + (hits * 100) / Math.max(4, total) - 10)));

export function buildTacticalPlaybook(gaming: GamingExtraction): TacticalPlaybook {
  const text = [
    ...gaming.skills.map((s) => `${s.name} ${s.detail}`),
    ...gaming.tactics.map((t) => `${t.name} ${t.when} ${t.steps.join(" ")}`),
    ...gaming.decisions.map((d) => `${d.situation} ${d.action} ${d.why}`),
    ...gaming.mindset,
    ...gaming.communication.map((c) => c.quote),
  ].join(" \n ");
  let genre: GameGenre = "Unknown";
  let best = 0;
  for (const [g, re] of GENRE_WORDS) {
    const n = count(text, new RegExp(re.source, "gi"));
    if (n > best) {
      best = n;
      genre = g;
    }
  }
  const named = text.match(/minecraft|valorant|fortnite|league of legends|dota|starcraft|elden ring|gta|roblox|apex|pubg|counter[- ]strike/i)?.[0];
  const is_minecraft = /minecraft/i.test(text) || genre === "Sandbox";
  const total = Math.max(1, gaming.decisions.length + gaming.tactics.length + gaming.mindset.length);
  const g = "gi";
  const playstyle_metrics: PlaystyleMetrics = {
    aggression: score(count(text, new RegExp("\\b(push|rush|attack|aggress|fight|engage|dive|kill)", g)) - count(text, new RegExp("\\b(wait|hold|defen|retreat|passive)", g)), total),
    risk_tolerance: score(count(text, new RegExp("\\b(risk|gamble|yolo|all[- ]in|clutch|bold)", g)) - count(text, new RegExp("\\b(safe|careful|cautious)", g)), total),
    resource_greed: score(count(text, new RegExp("\\b(farm|loot|gold|resource|econom|greed|collect|mine)", g)), total),
    team_play: score(count(text, new RegExp("\\b(team|squad|support|help|together|cover|we )", g)) + gaming.communication.filter((c) => /callout|command/.test(c.kind)).length, total),
    mechanical_tempo: score(count(text, new RegExp("\\b(fast|quick|speed|tempo|combo|flick|rotate|instant)", g)), total),
  };
  const rules: StateActionRule[] = [
    ...gaming.decisions.map((d) => ({ when_hud_or_map_state: d.situation, do_micro_or_macro_action: d.action, creator_reason: d.why })),
    ...gaming.tactics.map((t) => ({ when_hud_or_map_state: t.when, do_micro_or_macro_action: t.steps.join(" → ") || t.name, creator_reason: t.name })),
  ].filter((r) => r.when_hud_or_map_state && r.do_micro_or_macro_action);
  const callout_vocabulary = [...new Set(
    gaming.communication.filter((c) => c.kind !== "tilt" && c.quote).map((c) => c.quote.trim().slice(0, 80)),
  )].slice(0, 30);
  return {
    detected_game_or_genre: named ? `${named} (${genre})` : genre,
    genre,
    is_minecraft,
    playstyle_metrics,
    state_action_rules: rules.slice(0, 40),
    callout_vocabulary,
  };
}

/** Engine-agnostic bot policy: JSON any game client can load over WebSocket. */
export function buildBotPolicy(mindName: string, gaming: GamingExtraction) {
  return {
    format: "evermind.bot-policy/v1",
    player: mindName,
    playbook: buildTacticalPlaybook(gaming),
    websocket: {
      note: "Connect your game bridge, send {type:'state', hud:'...'} and pick the first rule whose when_hud_or_map_state matches.",
      message_in: { type: "state", hud: "string" },
      message_out: { type: "action", action: "string", reason: "string", callout: "string" },
    },
  };
}

export function downloadBotPolicy(mindName: string, gaming: GamingExtraction): void {
  const blob = new Blob([JSON.stringify(buildBotPolicy(mindName, gaming), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bot-policy.json";
  a.click();
  URL.revokeObjectURL(url);
}
