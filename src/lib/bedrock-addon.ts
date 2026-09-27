import { zipSync, strToU8 } from "fflate";
import type { GamingExtraction } from "@/lib/gemini";

/**
 * Bedrock Teammate add-on (.mcaddon) for phone / tablet / console Minecraft.
 * One tap opens it in Minecraft. Adds a spawn egg for a teammate that you tame
 * with an emerald; it follows you, fights hostile mobs and talks in chat with
 * the mined player's own lines. Generated fully in the browser — no AI calls.
 */
const uuid = () => crypto.randomUUID();
const j = (o: unknown) => strToU8(JSON.stringify(o, null, 2));

export type BotOptions = {
  name?: string;
  health?: number;
  damage?: number;
  speed?: number;
  tameItem?: string;
  fightMobs?: boolean;
  guardOwner?: boolean;
  greeting?: string;
  lines?: string[];
  chatEverySec?: number;
  baseColor?: string;
  overlayColor?: string;
};

export function buildBedrockAddon(mindName: string, gaming: GamingExtraction, opts: BotOptions = {}): Uint8Array {
  mindName = (opts.name || mindName).slice(0, 32) || "Teammate";
  const slug = mindName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "teammate";
  const id = `evermind:${slug}`;
  const tameItem = opts.tameItem || "emerald";
  const bpUuid = uuid();
  const rpUuid = uuid();
  const ver = [1, 0, 0];
  const minEngine = [1, 20, 60];
  const lines = opts.lines ? opts.lines.filter(Boolean).map((s) => s.slice(0, 160)).slice(0, 60) : [
    ...gaming.communication.filter((c) => c.kind !== "tilt").map((c) => c.quote),
    ...gaming.commentaryStyle,
  ]
    .filter(Boolean)
    .map((s) => String(s).slice(0, 160))
    .slice(0, 40);
  const mistakes = gaming.mistakes.map((m) => String(m).slice(0, 140)).slice(0, 10);

  const bp = {
    "manifest.json": j({
      format_version: 2,
      header: { name: `${mindName} Teammate (Evermind)`, description: `Tame with ${tameItem}. Built with Evermind.`, uuid: bpUuid, version: ver, min_engine_version: minEngine },
      modules: [
        { type: "data", uuid: uuid(), version: ver },
        { type: "script", language: "javascript", uuid: uuid(), version: ver, entry: "scripts/main.js" },
      ],
      dependencies: [{ uuid: rpUuid, version: ver }, { module_name: "@minecraft/server", version: "1.11.0" }],
    }),
    "entities/teammate.json": j({
      format_version: "1.20.60",
      "minecraft:entity": {
        description: { identifier: id, is_spawnable: true, is_summonable: true, is_experimental: false },
        component_groups: {
          tamed: {
            "minecraft:is_tamed": {},
            "minecraft:behavior.follow_owner": { priority: 4, speed_multiplier: 1.2, start_distance: 8, stop_distance: 2 },
            ...(opts.guardOwner === false ? {} : {
              "minecraft:behavior.owner_hurt_by_target": { priority: 1 },
              "minecraft:behavior.owner_hurt_target": { priority: 2 },
            }),
            ...(opts.fightMobs === false ? {} : {
              "minecraft:behavior.nearest_attackable_target": {
                priority: 3,
                reselect_targets: true,
                entity_types: [{ filters: { test: "is_family", subject: "other", value: "monster" }, max_dist: 16 }],
              },
            }),
          },
        },
        components: {
          "minecraft:type_family": { family: ["evermind_teammate", "mob"] },
          "minecraft:health": { value: opts.health ?? 40, max: opts.health ?? 40 },
          "minecraft:attack": { damage: opts.damage ?? 6 },
          "minecraft:movement": { value: opts.speed ?? 0.3 },
          "minecraft:navigation.walk": { can_path_over_water: true, avoid_damage_blocks: true },
          "minecraft:movement.basic": {},
          "minecraft:jump.static": {},
          "minecraft:can_climb": {},
          "minecraft:physics": {},
          "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
          "minecraft:collision_box": { width: 0.6, height: 1.8 },
          "minecraft:nameable": { always_show: true, allow_name_tag_renaming: true },
          "minecraft:persistent": {},
          "minecraft:tameable": { probability: 1, tame_items: tameItem, tame_event: { event: "evermind:tamed", target: "self" } },
          "minecraft:behavior.float": { priority: 0 },
          "minecraft:behavior.melee_attack": { priority: 3, speed_multiplier: 1.3, track_target: true },
          "minecraft:behavior.random_stroll": { priority: 7, speed_multiplier: 0.8 },
          "minecraft:behavior.look_at_player": { priority: 8, look_distance: 8 },
          "minecraft:behavior.random_look_around": { priority: 9 },
        },
        events: { "evermind:tamed": { add: { component_groups: ["tamed"] } } },
      },
    }),
    "scripts/main.js": strToU8(
      [
        'import { world, system } from "@minecraft/server";',
        `const NAME = ${JSON.stringify(mindName)};`,
        `const LINES = ${JSON.stringify(lines)};`,
        `const MISTAKES = ${JSON.stringify(mistakes)};`,
        "const say = (t) => world.sendMessage(\"<\" + NAME + \"> \" + t);",
        "const pick = (a) => a[Math.floor(Math.random() * a.length)];",
        'world.afterEvents.entitySpawn.subscribe(({ entity }) => {',
        `  if (entity.typeId !== ${JSON.stringify(id)}) return;`,
        "  entity.nameTag = NAME;",
        '  say(" + JSON.stringify(opts.greeting || "Reporting in. Give me " + tameItem + " and I fight beside you.") + ");',
        "});",
        "world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {",
        `  if (deadEntity.typeId === ${JSON.stringify(id)}) say(MISTAKES.length ? "Classic mistake — " + pick(MISTAKES) : "That went badly. Regrouping.");`,
        `  else if (damageSource.damagingEntity && damageSource.damagingEntity.typeId === ${JSON.stringify(id)} && LINES.length && Math.random() < 0.35) say(pick(LINES));`,
        "});",
        "system.runInterval(() => {",
        `  const mates = world.getDimension("overworld").getEntities({ type: ${JSON.stringify(id)} });`,
        "  if (mates.length && LINES.length) say(pick(LINES));",
        `}, 20 * ${Math.max(20, opts.chatEverySec ?? 120)});`,
        "",
      ].join("\n"),
    ),
  };

  const rp = {
    "manifest.json": j({
      format_version: 2,
      header: { name: `${mindName} Teammate Look`, description: "Evermind", uuid: rpUuid, version: ver, min_engine_version: minEngine },
      modules: [{ type: "resources", uuid: uuid(), version: ver }],
    }),
    "entity/teammate.entity.json": j({
      format_version: "1.10.0",
      "minecraft:client_entity": {
        description: {
          identifier: id,
          materials: { default: "entity_alphatest" },
          textures: { default: "textures/entity/steve" },
          geometry: { default: "geometry.humanoid.custom" },
          animations: {
            move: "animation.humanoid.move",
            look_at_target: "animation.humanoid.look_at_target.default",
            attack: "animation.humanoid.attack.rotations",
          },
          scripts: { animate: ["move", "look_at_target", "attack"] },
          render_controllers: ["controller.render.default"],
          spawn_egg: { base_color: opts.baseColor || "#3a1c1c", overlay_color: opts.overlayColor || "#f2b6c6" },
        },
      },
    }),
    "texts/en_US.lang": strToU8(`entity.${id}.name=${mindName}\nitem.spawn_egg.entity.${id}.name=Spawn ${mindName}\n`),
    "texts/languages.json": j(["en_US"]),
  };

  // .mcaddon = zip containing one .mcpack per pack
  return zipSync({ "teammate_bp.mcpack": zipSync(bp), "teammate_rp.mcpack": zipSync(rp) }, { level: 0 });
}

export function downloadBedrockAddon(mindName: string, gaming: GamingExtraction, opts: BotOptions = {}): void {
  const data = buildBedrockAddon(mindName, gaming, opts);
  mindName = opts.name || mindName;
  const blob = new Blob([data as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${mindName.replace(/[^A-Za-z0-9]+/g, "_") || "Evermind"}_Teammate.mcaddon`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
