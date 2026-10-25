import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTacticalPlaybook } from "./game-bot";

const base = { skills: [], tactics: [], decisions: [], tutorials: [], commentaryStyle: [], mistakes: [], communication: [], mindset: [], emotions: [] };

test("detects a MOBA and turns decisions into state-action rules", () => {
  const p = buildTacticalPlaybook({
    ...base,
    decisions: [{ timestamp: "1:00", situation: "enemy jungle visible on minimap", action: "gank top lane", why: "tower is low", outcome: "worked" }],
    mindset: ["always farm minion waves in lane"],
  });
  assert.equal(p.genre, "MOBA");
  assert.equal(p.is_minecraft, false);
  assert.equal(p.state_action_rules[0]?.do_micro_or_macro_action, "gank top lane");
});

test("Minecraft is flagged for the add-on download", () => {
  const p = buildTacticalPlaybook({ ...base, mindset: ["minecraft speedrun: nether first"] });
  assert.equal(p.is_minecraft, true);
});
