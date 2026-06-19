/**
 * Orchestrator: given a suite (object) and a team paste (string), evaluate all
 * tests and return a VGCTeamTestReport object.
 *
 * Usage:
 *   import {runSuite} from './engine.mjs';
 *   const report = await runSuite(suite, teamPasteText);
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { parseShowdownPaste } from "./parse-team.mjs";
import { evalAssertion } from "./eval-assertion.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function loadJSON(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

// Lazy-load @smogon/calc and @pkmn/dex via CJS require (both are CJS bundles).
let calcTools = null;
let calcGen = null;

function getCalcTools() {
  if (calcTools) return { calcTools, calcGen };
  try {
    const req = createRequire(import.meta.url);
    const { Generations, Pokemon, Move, Field, Side, calculate } =
      req("@smogon/calc");
    const { Dex } = req("@pkmn/dex");
    calcTools = { Generations, Pokemon, Move, Field, Side, calculate };
    calcGen = Generations.get(9, Dex);
    return { calcTools, calcGen };
  } catch (err) {
    return { calcTools: null, calcGen: null };
  }
}

// Load @pkmn/dex gen (used for species types, base stats, existence checks).
let dexGen = null;
function getDexGen() {
  if (dexGen) return dexGen;
  const req = createRequire(import.meta.url);
  const { Dex } = req("@pkmn/dex");
  dexGen = Dex.forGen(9);
  return dexGen;
}

function buildSummary(results) {
  const summary = {};
  for (const r of results) {
    const sev = r.severity ?? "error";
    if (!summary[sev]) summary[sev] = { passed: 0, failed: 0 };
    summary[sev][r.pass ? "passed" : "failed"]++;
  }
  return summary;
}

function cleanResult(r) {
  // Remove internal fields; keep only report-schema fields.
  const out = { id: r.id };
  if (r.title != null) out.title = r.title;
  if (r.severity != null) out.severity = r.severity;
  if (r.weight != null) out.weight = r.weight;
  out.pass = r.pass;
  if (r.actual != null) out.actual = r.actual;
  if (r.op != null) out.op = r.op;
  if (r.value != null) out.value = r.value;
  if (r.satisfiedBy !== undefined) out.satisfiedBy = r.satisfiedBy;
  if (r.coverage != null) out.coverage = r.coverage;
  if (r.message != null) out.message = r.message;
  if (r.detail != null) out.detail = r.detail;
  return out;
}

/**
 * Run a suite against a team.
 *
 * @param {object}  suite      - Parsed suite JSON (VGCTeamTestSuite)
 * @param {string}  teamText   - Showdown/pokepaste paste text
 * @param {object}  [opts]     - Override data sources for testing
 * @returns {object}           - VGCTeamTestReport
 */
export async function runSuite(suite, teamText, opts = {}) {
  const team = parseShowdownPaste(teamText);
  if (!team.length) throw new Error("No Pokémon found in team paste.");

  // Load reference data
  const tags = opts.tags ?? loadJSON("data/tags.json");
  const interactions = opts.interactions ?? loadJSON("data/interactions.json");
  const threatsLib = opts.threatsLib ?? loadJSON("data/threats.json");

  // Enrich team members with types from dex
  const gen = getDexGen();
  for (const m of team) {
    const sd = gen.species.get(m.species);
    m._types = sd?.exists ? sd.types : [];
    m._baseStats = sd?.exists ? sd.baseStats : {};
  }

  // Set up calc tools (may be null if @smogon/calc unavailable)
  const { calcTools: ct, calcGen: cg } = getCalcTools();

  const ctx = {
    suite,
    tags,
    interactions,
    threatsLib,
    gen,
    calcTools: ct,
    calcGen: cg,
    each: null,
  };

  // Evaluate each test
  const results = [];
  for (const test of suite.tests) {
    let result;
    try {
      result = evalAssertion(test.assert, team, ctx);
    } catch (err) {
      result = { pass: false, message: `Evaluator error: ${err.message}` };
    }
    results.push({
      id: test.id,
      title: test.title,
      severity: test.severity ?? "error",
      weight: test.weight,
      ...result,
    });
  }

  const errorResults = results.filter((r) => r.severity === "error");
  const passed = errorResults.every((r) => r.pass);

  return {
    schemaVersion: "1.0.0",
    suite: suite.name ?? suite.id ?? "unnamed",
    team: team.map((m) => ({ slot: m.slot, species: m.species })),
    format: suite.format,
    generatedAt: new Date().toISOString(),
    passed,
    summary: buildSummary(results),
    results: results.map(cleanResult),
  };
}

/**
 * Run a subset of tests (by id) from a suite.
 */
export async function runTests(suite, teamText, testIds, opts = {}) {
  const filtered = {
    ...suite,
    tests: suite.tests.filter((t) => testIds.includes(t.id)),
  };
  if (!filtered.tests.length)
    throw new Error(`No tests matched: ${testIds.join(", ")}`);
  return runSuite(filtered, teamText, opts);
}
