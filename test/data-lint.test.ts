// Data integrity lint. Two jobs:
//  (1) every move/item/ability/species id in data/ and examples/ is a REAL
//      Showdown id (cross-checked against @pkmn/dex gen 9);
//  (2) every tag / effect / hazard / group / predicate / threat an example
//      references actually EXISTS in the reference data or the suite's own
//      definitions (closed-vocab + no dangling references).
// Catches the typos a schema's `pattern: ^[a-z0-9]+$` cannot.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Dex } from "@pkmn/dex";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

function readJSON<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

const gen = Dex.forGen(9);

const TYPES = new Set([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);
const TERA = new Set([...TYPES, "stellar"]);

type ExistsKind = "species" | "move" | "item" | "ability" | "type" | "tera";

const exists: Record<ExistsKind, (id: string) => boolean> = {
  species: (id) => gen.species.get(id)?.exists === true,
  move: (id) => gen.moves.get(id)?.exists === true,
  item: (id) => gen.items.get(id)?.exists === true,
  ability: (id) => gen.abilities.get(id)?.exists === true,
  type: (id) => TYPES.has(id),
  tera: (id) => TERA.has(id),
};

function walkJSON(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory()
      ? walkJSON(p)
      : e.endsWith(".json")
        ? [p]
        : [];
  });
}

function strs(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr.filter((x): x is string => typeof x === "string");
}

// ---------------------------------------------------------------------------
// (1) Reference-data id sanity
// ---------------------------------------------------------------------------
test("data/tags.json keys are real Showdown ids", () => {
  const tags = readJSON<Record<string, Record<string, unknown>>>(
    join(root, "data/tags.json"),
  );
  const bad: string[] = [];
  const catToKind: Record<string, ExistsKind> = {
    moves: "move",
    items: "item",
    abilities: "ability",
    species: "species",
  };
  for (const cat of ["moves", "items", "abilities", "species"]) {
    const kind = catToKind[cat];
    for (const id of Object.keys(tags[cat] ?? {}))
      if (!exists[kind](id)) bad.push(`${cat}.${id}`);
  }
  assert.equal(bad.length, 0, `Unknown ids in tags.json: ${bad.join(", ")}`);
});

test("data/interactions.json references real ids", () => {
  const data = readJSON(join(root, "data/interactions.json"));
  const bad: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const id of strs(obj.ability))
        if (!exists.ability(id)) bad.push(`ability:${id}`);
      for (const id of strs(obj.item))
        if (!exists.item(id)) bad.push(`item:${id}`);
      for (const id of strs(obj.move))
        if (!exists.move(id)) bad.push(`move:${id}`);
      for (const id of strs(obj.type))
        if (!exists.type(id)) bad.push(`type:${id}`);
      for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(data);
  assert.equal(
    bad.length,
    0,
    `Unknown ids in interactions.json: ${bad.join(", ")}`,
  );
});

interface ThreatLike {
  species?: unknown;
  move?: unknown;
  item?: unknown;
  ability?: unknown;
  teraType?: unknown;
  variations?: unknown[];
}

function checkThreatIds(t: ThreatLike, ctx: string, bad: string[]): void {
  for (const id of strs(t.species))
    if (!exists.species(id)) bad.push(`${ctx}.species:${id}`);
  for (const id of strs(t.move))
    if (!exists.move(id)) bad.push(`${ctx}.move:${id}`);
  for (const id of strs(t.item))
    if (!exists.item(id)) bad.push(`${ctx}.item:${id}`);
  for (const id of strs(t.ability))
    if (!exists.ability(id)) bad.push(`${ctx}.ability:${id}`);
  for (const id of strs(t.teraType))
    if (!exists.tera(id)) bad.push(`${ctx}.teraType:${id}`);
  for (const v of t.variations ?? []) {
    if (v && typeof v === "object") {
      const vo = v as Record<string, unknown>;
      for (const id of strs(vo.item))
        if (!exists.item(id)) bad.push(`${ctx}.var.item:${id}`);
      for (const id of strs(vo.ability))
        if (!exists.ability(id)) bad.push(`${ctx}.var.ability:${id}`);
    }
  }
}

interface GroupLike {
  kind?: string;
  members?: unknown[];
  valueType?: string;
  move?: unknown;
}

function checkGroupIds(g: GroupLike, ctx: string, bad: string[]): void {
  if (g.kind === "species") {
    for (const id of strs(g.members))
      if (!exists.species(id)) bad.push(`${ctx}:${id}`);
  } else if (g.kind === "values") {
    const k = (g.valueType === "type" ? "type" : g.valueType) as
      | ExistsKind
      | undefined; // species/move/item/ability/type
    for (const id of strs(g.members))
      if (k && exists[k] && !exists[k](id))
        bad.push(`${ctx}(${g.valueType}):${id}`);
  } else if (g.kind === "threats") {
    for (const m of g.members ?? [])
      if (m && typeof m === "object")
        checkThreatIds(m as ThreatLike, `${ctx}.inline`, bad);
  } else if (g.kind === "meta") {
    for (const id of strs(g.move))
      if (id !== "bestDamaging" && id !== "bestStab" && !exists.move(id))
        bad.push(`${ctx}.move:${id}`);
  }
}

test("data/threats.json references real ids", () => {
  const lib = readJSON<{
    threats?: Record<string, ThreatLike>;
    groups?: Record<string, GroupLike>;
  }>(join(root, "data/threats.json"));
  const bad: string[] = [];
  for (const [k, t] of Object.entries(lib.threats ?? {}))
    checkThreatIds(t, `threats.${k}`, bad);
  for (const [k, g] of Object.entries(lib.groups ?? {}))
    checkGroupIds(g, `groups.${k}`, bad);
  assert.equal(bad.length, 0, `Unknown ids in threats.json: ${bad.join(", ")}`);
});

// ---------------------------------------------------------------------------
// (2) Closed-vocab + dangling-ref checks across example suites
// ---------------------------------------------------------------------------
const tagsData = readJSON<
  Record<string, Record<string, { tags?: string[]; [k: string]: unknown }>>
>(join(root, "data/tags.json"));
const interactions = readJSON<{
  immunities?: Record<string, unknown>;
  moveTagImmunities?: Record<string, unknown>;
  hazardRemoval?: Record<string, unknown>;
}>(join(root, "data/interactions.json"));

type TagCategory = "move" | "item" | "ability" | "species";
const categoryTags: Record<TagCategory, Set<string>> = {
  move: new Set(),
  item: new Set(),
  ability: new Set(),
  species: new Set(),
};
const facetKeys = new Set<string>();
for (const [cat, kind] of [
  ["moves", "move"],
  ["items", "item"],
  ["abilities", "ability"],
  ["species", "species"],
] as [string, TagCategory][]) {
  for (const entry of Object.values(tagsData[cat] ?? {})) {
    for (const t of entry.tags ?? []) categoryTags[kind].add(t);
    for (const key of Object.keys(entry))
      if (key !== "tags") facetKeys.add(key);
  }
}
const effectKeys = new Set(Object.keys(interactions.immunities ?? {}));
const moveTagKeys = new Set(Object.keys(interactions.moveTagImmunities ?? {}));
const hazardKeys = new Set(Object.keys(interactions.hazardRemoval ?? {}));

interface Acc {
  tagged: Array<{ of: TagCategory; tag: string }>;
  immune: Array<{ effect?: string; moveTag?: string }>;
  hazard: Array<{ hazard: string }>;
  ids: Array<[ExistsKind, string]>;
  groupRefs: string[];
  predRefs: string[];
  threatRefs: string[];
  facets: string[];
}

// Visit every object node, dispatching by atom `kind` and by reference key.
function collect(node: unknown, acc: Acc): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, acc));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.kind === "tagged")
    acc.tagged.push(obj as unknown as { of: TagCategory; tag: string });
  if (obj.kind === "immuneTo")
    acc.immune.push(obj as { effect?: string; moveTag?: string });
  if (obj.kind === "canRemove")
    acc.hazard.push(obj as unknown as { hazard: string });
  if (obj.kind === "species")
    for (const id of [...strs(obj.is), ...strs(obj.in)])
      acc.ids.push(["species", id]);
  if (obj.kind === "ability")
    for (const id of [...strs(obj.is), ...strs(obj.in)])
      acc.ids.push(["ability", id]);
  if (obj.kind === "item")
    for (const id of [...strs(obj.is), ...strs(obj.in)])
      acc.ids.push(["item", id]);
  if (obj.kind === "move")
    for (const id of [
      ...strs(obj.has),
      ...strs(obj.hasAny),
      ...strs(obj.hasAll),
    ])
      acc.ids.push(["move", id]);

  if (typeof obj.group === "string") acc.groupRefs.push(obj.group);
  if (typeof obj.predicate === "string") acc.predRefs.push(obj.predicate);
  if (typeof obj.threat === "string" && obj.threat !== "$each")
    acc.threatRefs.push(obj.threat);
  if (
    typeof obj.countDistinct === "string" &&
    obj.countDistinct.startsWith("facet:")
  ) {
    acc.facets.push(obj.countDistinct.slice(6));
  }

  for (const v of Object.values(obj)) collect(v, acc);
}

interface SuiteLike {
  definitions?: {
    threats?: Record<string, ThreatLike>;
    groups?: Record<string, GroupLike>;
    predicates?: Record<string, unknown>;
  };
}

for (const file of walkJSON(join(root, "examples"))) {
  if (file.endsWith(".report.json")) continue;
  const rel = file.slice(root.length + 1);
  test(`refs resolve: ${rel}`, () => {
    const suite = readJSON<SuiteLike>(file);
    const defThreats = new Set(Object.keys(suite.definitions?.threats ?? {}));
    const defGroups = new Set(Object.keys(suite.definitions?.groups ?? {}));
    const defPreds = new Set(Object.keys(suite.definitions?.predicates ?? {}));

    const acc: Acc = {
      tagged: [],
      immune: [],
      hazard: [],
      ids: [],
      groupRefs: [],
      predRefs: [],
      threatRefs: [],
      facets: [],
    };
    collect(suite, acc);

    const errs: string[] = [];
    for (const t of acc.tagged)
      if (!categoryTags[t.of]?.has(t.tag))
        errs.push(`tagged ${t.of}:'${t.tag}' not in tags.json`);
    for (const i of acc.immune) {
      if (i.effect && !effectKeys.has(i.effect))
        errs.push(
          `immuneTo effect '${i.effect}' not in interactions.immunities`,
        );
      if (i.moveTag && !moveTagKeys.has(i.moveTag))
        errs.push(
          `immuneTo moveTag '${i.moveTag}' not in interactions.moveTagImmunities`,
        );
    }
    for (const h of acc.hazard)
      if (!hazardKeys.has(h.hazard))
        errs.push(
          `canRemove hazard '${h.hazard}' not in interactions.hazardRemoval`,
        );
    for (const [kind, id] of acc.ids)
      if (!exists[kind](id)) errs.push(`unknown ${kind} id '${id}'`);
    for (const g of acc.groupRefs)
      if (!defGroups.has(g))
        errs.push(`group ref '${g}' not defined in this suite`);
    for (const p of acc.predRefs)
      if (!defPreds.has(p))
        errs.push(`predicate ref '${p}' not defined in this suite`);
    for (const th of acc.threatRefs)
      if (!defThreats.has(th))
        errs.push(`threat ref '${th}' not defined in this suite`);
    for (const f of acc.facets)
      if (!facetKeys.has(f))
        errs.push(
          `countDistinct facet '${f}' not present on any tags.json entry`,
        );

    // also id-check any threats/groups this suite defines
    for (const [k, t] of Object.entries(suite.definitions?.threats ?? {}))
      checkThreatIds(t, `def.threats.${k}`, errs);
    for (const [k, g] of Object.entries(suite.definitions?.groups ?? {}))
      checkGroupIds(g, `def.groups.${k}`, errs);

    assert.equal(errs.length, 0, `${rel}:\n  - ${errs.join("\n  - ")}`);
  });
}
