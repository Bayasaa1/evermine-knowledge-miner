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

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

export function buildTeammateBotSource(mindName: string, gaming: GamingExtraction): string {
  const brain = {
    minedBy: "Evermind Gaming Mind",
    player: mindName,
    skills: gaming.skills.map((s) => ({ name: s.name, kind: s.kind, detail: s.detail })),
    tactics: gaming.tactics.map((t) => ({ name: t.name, when: t.when, steps: t.steps, counter: t.counter })),
    commentaryStyle: gaming.commentaryStyle,
    mistakes: gaming.mistakes,
  };

  return `// ${mindName} — Evermind Teammate Bot (Minecraft Java)
// Generated from your mined Gaming Mind. The Teammate PLAYS with you; it
// cannot watch your screen (that is the Coach, inside Evermind).
//
// Setup:
//   npm install mineflayer mineflayer-pathfinder mineflayer-collectblock
//   node teammate-bot.js --host <server> --port 25565
//
// Behaviour is seeded from the mined brain below — edit it freely.

const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalFollow, GoalNear } = goals;

const BRAIN = ${JSON.stringify(brain, null, 2)};

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const bot = mineflayer.createBot({
  host: arg("host", "localhost"),
  port: Number(arg("port", "25565")),
  username: arg("name", ${"`${esc(mindName).replace(/\s+/g, "_")}_Bot`"}),
  version: arg("version", false),
});

bot.loadPlugin(pathfinder);

bot.once("spawn", () => {
  const moves = new Movements(bot);
  bot.pathfinder.setMovements(moves);
  bot.chat(\`Hey — ${esc(mindName)}'s teammate reporting in. Say "follow", "stay", "tactic <name>" or "skills".\`);
});

// Follow the player who asked, like a partner sticking with you.
let following = null;

bot.on("chat", (username, message) => {
  if (username === bot.username) return;
  const msg = message.toLowerCase();

  if (msg === "follow") {
    const target = bot.players[username]?.entity;
    if (!target) return bot.chat("I can't see you — come closer.");
    following = username;
    bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
    bot.chat(\`On your tail, \${username}.\`);
  } else if (msg === "stay") {
    following = null;
    bot.pathfinder.setGoal(null);
    bot.chat("Holding position.");
  } else if (msg === "skills") {
    const names = BRAIN.skills.map((s) => s.name).join(", ") || "still learning";
    bot.chat(\`Skills I mined: \${names}\`);
  } else if (msg.startsWith("tactic")) {
    const name = message.slice(6).trim().toLowerCase();
    const tactic = BRAIN.tactics.find((t) => t.name.toLowerCase().includes(name));
    if (!tactic) return bot.chat("I don't know that tactic yet — ask for 'skills' to see what I mined.");
    bot.chat(\`Tactic "\${tactic.name}" — use when: \${tactic.when}\`);
    tactic.steps.forEach((step, i) => setTimeout(() => bot.chat(\`\${i + 1}. \${step}\`), 800 * (i + 1)));
  } else if (msg === "guard") {
    // Simple combat behaviour: attack hostile mobs near the followed player.
    bot.chat("Guarding.");
    const interval = setInterval(() => {
      if (following === null) return clearInterval(interval);
      const mob = bot.nearestEntity(
        (e) => e.type === "hostile" && e.position.distanceTo(bot.entity.position) < 12,
      );
      if (mob) bot.attack(mob);
    }, 1000);
  }
});

// Narrate in the mined commentary style now and then — partner banter.
bot.on("physicsTick", () => {
  if (!following || Math.random() > 0.0004 || BRAIN.commentaryStyle.length === 0) return;
  const line = BRAIN.commentaryStyle[Math.floor(Math.random() * BRAIN.commentaryStyle.length)];
  bot.chat(line.slice(0, 200));
});

bot.on("death", () => {
  const mistake = BRAIN.mistakes[0];
  bot.chat(mistake ? \`Classic mistake — \${mistake.slice(0, 150)}\` : "That went badly. Regrouping.");
});

bot.on("error", (err) => console.error("Bot error:", err));
bot.on("end", () => console.log("Teammate disconnected."));
`;
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
