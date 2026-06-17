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
const root = resolve(here, "..");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const gen = Dex.forGen(9);

const TYPES = new Set(["normal","fire","water","electric","grass","ice","fighting","poison","ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"]);
const TERA = new Set([...TYPES, "stellar"]);

const exists = {
  species: (id) => gen.species.get(id)?.exists === true,
  move: (id) => gen.moves.get(id)?.exists === true,
  item: (id) => gen.items.get(id)?.exists === true,
  ability: (id) => gen.abilities.get(id)?.exists === true,
  type: (id) => TYPES.has(id),
  tera: (id) => TERA.has(id),
};

const walkJSON = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? walkJSON(p) : (e.endsWith(".json") ? [p] : []);
});

const strs = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x) => typeof x === "string");

// ---------------------------------------------------------------------------
// (1) Reference-data id sanity
// ---------------------------------------------------------------------------
test("data/tags.json keys are real Showdown ids", () => {
  const tags = readJSON(join(root, "data/tags.json"));
  const bad = [];
  for (const cat of ["moves", "items", "abilities", "species"]) {
    const kind = { moves: "move", items: "item", abilities: "ability", species: "species" }[cat];
    for (const id of Object.keys(tags[cat] ?? {})) if (!exists[kind](id)) bad.push(`${cat}.${id}`);
  }
  assert.equal(bad.length, 0, `Unknown ids in tags.json: ${bad.join(", ")}`);
});

test("data/interactions.json references real ids", () => {
  const data = readJSON(join(root, "data/interactions.json"));
  const bad = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const id of strs(node.ability)) if (!exists.ability(id)) bad.push(`ability:${id}`);
      for (const id of strs(node.item)) if (!exists.item(id)) bad.push(`item:${id}`);
      for (const id of strs(node.move)) if (!exists.move(id)) bad.push(`move:${id}`);
      for (const id of strs(node.type)) if (!exists.type(id)) bad.push(`type:${id}`);
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(data);
  assert.equal(bad.length, 0, `Unknown ids in interactions.json: ${bad.join(", ")}`);
});

function checkThreatIds(t, ctx, bad) {
  for (const id of strs(t.species)) if (!exists.species(id)) bad.push(`${ctx}.species:${id}`);
  for (const id of strs(t.move)) if (!exists.move(id)) bad.push(`${ctx}.move:${id}`);
  for (const id of strs(t.item)) if (!exists.item(id)) bad.push(`${ctx}.item:${id}`);
  for (const id of strs(t.ability)) if (!exists.ability(id)) bad.push(`${ctx}.ability:${id}`);
  for (const id of strs(t.teraType)) if (!exists.tera(id)) bad.push(`${ctx}.teraType:${id}`);
  for (const v of t.variations ?? []) if (typeof v === "object") {
    for (const id of strs(v.item)) if (!exists.item(id)) bad.push(`${ctx}.var.item:${id}`);
    for (const id of strs(v.ability)) if (!exists.ability(id)) bad.push(`${ctx}.var.ability:${id}`);
  }
}

function checkGroupIds(g, ctx, bad) {
  if (g.kind === "species") for (const id of g.members ?? []) if (!exists.species(id)) bad.push(`${ctx}:${id}`);
  else if (g.kind === "values") {
    const k = g.valueType === "type" ? "type" : g.valueType; // species/move/item/ability/type
    for (const id of g.members ?? []) if (exists[k] && !exists[k](id)) bad.push(`${ctx}(${g.valueType}):${id}`);
  } else if (g.kind === "threats") {
    for (const m of g.members ?? []) if (typeof m === "object") checkThreatIds(m, `${ctx}.inline`, bad);
  } else if (g.kind === "meta") {
    for (const id of strs(g.move)) if (id !== "bestDamaging" && id !== "bestStab" && !exists.move(id)) bad.push(`${ctx}.move:${id}`);
  }
}

test("data/threats.json references real ids", () => {
  const lib = readJSON(join(root, "data/threats.json"));
  const bad = [];
  for (const [k, t] of Object.entries(lib.threats ?? {})) checkThreatIds(t, `threats.${k}`, bad);
  for (const [k, g] of Object.entries(lib.groups ?? {})) checkGroupIds(g, `groups.${k}`, bad);
  assert.equal(bad.length, 0, `Unknown ids in threats.json: ${bad.join(", ")}`);
});

// ---------------------------------------------------------------------------
// (2) Closed-vocab + dangling-ref checks across example suites
// ---------------------------------------------------------------------------
const tagsData = readJSON(join(root, "data/tags.json"));
const interactions = readJSON(join(root, "data/interactions.json"));

const categoryTags = { move: new Set(), item: new Set(), ability: new Set(), species: new Set() };
const facetKeys = new Set();
for (const [cat, kind] of [["moves", "move"], ["items", "item"], ["abilities", "ability"], ["species", "species"]]) {
  for (const entry of Object.values(tagsData[cat] ?? {})) {
    for (const t of entry.tags ?? []) categoryTags[kind].add(t);
    for (const key of Object.keys(entry)) if (key !== "tags") facetKeys.add(key);
  }
}
const effectKeys = new Set(Object.keys(interactions.immunities ?? {}));
const moveTagKeys = new Set(Object.keys(interactions.moveTagImmunities ?? {}));
const hazardKeys = new Set(Object.keys(interactions.hazardRemoval ?? {}));

// Visit every object node, dispatching by atom `kind` and by reference key.
function collect(node, acc) {
  if (Array.isArray(node)) return node.forEach((n) => collect(n, acc));
  if (!node || typeof node !== "object") return;

  if (node.kind === "tagged") acc.tagged.push(node);
  if (node.kind === "immuneTo") acc.immune.push(node);
  if (node.kind === "canRemove") acc.hazard.push(node);
  if (node.kind === "species") for (const id of [...strs(node.is), ...strs(node.in)]) acc.ids.push(["species", id]);
  if (node.kind === "ability") for (const id of [...strs(node.is), ...strs(node.in)]) acc.ids.push(["ability", id]);
  if (node.kind === "item") for (const id of [...strs(node.is), ...strs(node.in)]) acc.ids.push(["item", id]);
  if (node.kind === "move") for (const id of [...strs(node.has), ...strs(node.hasAny), ...strs(node.hasAll)]) acc.ids.push(["move", id]);

  if (typeof node.group === "string") acc.groupRefs.push(node.group);
  if (typeof node.predicate === "string") acc.predRefs.push(node.predicate);
  if (typeof node.threat === "string" && node.threat !== "$each") acc.threatRefs.push(node.threat);
  if (typeof node.countDistinct === "string" && node.countDistinct.startsWith("facet:")) acc.facets.push(node.countDistinct.slice(6));

  for (const v of Object.values(node)) collect(v, acc);
}

for (const file of walkJSON(join(root, "examples"))) {
  if (file.endsWith(".report.json")) continue;
  const rel = file.slice(root.length + 1);
  test(`refs resolve: ${rel}`, () => {
    const suite = readJSON(file);
    const defThreats = new Set(Object.keys(suite.definitions?.threats ?? {}));
    const defGroups = new Set(Object.keys(suite.definitions?.groups ?? {}));
    const defPreds = new Set(Object.keys(suite.definitions?.predicates ?? {}));

    const acc = { tagged: [], immune: [], hazard: [], ids: [], groupRefs: [], predRefs: [], threatRefs: [], facets: [] };
    collect(suite, acc);

    const errs = [];
    for (const t of acc.tagged) if (!categoryTags[t.of]?.has(t.tag)) errs.push(`tagged ${t.of}:'${t.tag}' not in tags.json`);
    for (const i of acc.immune) {
      if (i.effect && !effectKeys.has(i.effect)) errs.push(`immuneTo effect '${i.effect}' not in interactions.immunities`);
      if (i.moveTag && !moveTagKeys.has(i.moveTag)) errs.push(`immuneTo moveTag '${i.moveTag}' not in interactions.moveTagImmunities`);
    }
    for (const h of acc.hazard) if (!hazardKeys.has(h.hazard)) errs.push(`canRemove hazard '${h.hazard}' not in interactions.hazardRemoval`);
    for (const [kind, id] of acc.ids) if (!exists[kind](id)) errs.push(`unknown ${kind} id '${id}'`);
    for (const g of acc.groupRefs) if (!defGroups.has(g)) errs.push(`group ref '${g}' not defined in this suite`);
    for (const p of acc.predRefs) if (!defPreds.has(p)) errs.push(`predicate ref '${p}' not defined in this suite`);
    for (const th of acc.threatRefs) if (!defThreats.has(th)) errs.push(`threat ref '${th}' not defined in this suite`);
    for (const f of acc.facets) if (!facetKeys.has(f)) errs.push(`countDistinct facet '${f}' not present on any tags.json entry`);

    // also id-check any threats/groups this suite defines
    for (const [k, t] of Object.entries(suite.definitions?.threats ?? {})) checkThreatIds(t, `def.threats.${k}`, errs);
    for (const [k, g] of Object.entries(suite.definitions?.groups ?? {})) checkGroupIds(g, `def.groups.${k}`, errs);

    assert.equal(errs.length, 0, `${rel}:\n  - ${errs.join("\n  - ")}`);
  });
}
