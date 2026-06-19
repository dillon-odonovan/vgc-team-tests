/**
 * Orchestrator: given a suite (object) and a team paste (string), evaluate all
 * tests and return a VGCTeamTestReport object.
 *
 * Usage:
 *   import {runSuite} from './engine.js';
 *   const report = await runSuite(suite, teamPasteText);
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { gen9 } from "./dex.js";
import { parseShowdownPaste } from "./parse-team.js";
import { evalAssertion } from "./eval-assertion.js";
import type {
  EvalContext,
  InteractionsData,
  Report,
  Result,
  Suite,
  Tally,
  TagsData,
  ThreatsLib,
} from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function loadJSON<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

function buildSummary(
  results: Result[],
): Partial<Record<"error" | "warn" | "info", Tally>> {
  const summary: Partial<Record<"error" | "warn" | "info", Tally>> = {};
  for (const r of results) {
    const sev = r.severity ?? "error";
    if (!summary[sev]) summary[sev] = { passed: 0, failed: 0 };
    const tally = summary[sev]!;
    if (r.pass) tally.passed++;
    else tally.failed++;
  }
  return summary;
}

function cleanResult(r: Result): Result {
  const out: Result = { id: r.id, pass: r.pass };
  if (r.title != null) out.title = r.title;
  if (r.severity != null) out.severity = r.severity;
  if (r.weight != null) out.weight = r.weight;
  if (r.actual != null) out.actual = r.actual;
  if (r.op != null) out.op = r.op;
  if (r.value != null) out.value = r.value;
  if (r.satisfiedBy !== undefined) out.satisfiedBy = r.satisfiedBy;
  if (r.coverage != null) out.coverage = r.coverage;
  if (r.message != null) out.message = r.message;
  if (r.detail != null) out.detail = r.detail;
  return out;
}

export interface RunSuiteOpts {
  tags?: TagsData;
  interactions?: InteractionsData;
  threatsLib?: ThreatsLib;
}

/**
 * Run a suite against a team.
 *
 * @param suite     - Parsed suite JSON (VGCTeamTestSuite)
 * @param teamText  - Showdown/pokepaste paste text
 * @param opts      - Override data sources for testing
 */
export async function runSuite(
  suite: Suite,
  teamText: string,
  opts: RunSuiteOpts = {},
): Promise<Report> {
  const team = parseShowdownPaste(teamText);
  if (!team.length) throw new Error("No Pokémon found in team paste.");

  const tags = opts.tags ?? loadJSON<TagsData>("data/tags.json");
  const interactions =
    opts.interactions ?? loadJSON<InteractionsData>("data/interactions.json");
  const threatsLib =
    opts.threatsLib ?? loadJSON<ThreatsLib>("data/threats.json");

  // Enrich team members with types from dex
  for (const m of team) {
    const sd = gen9.species.get(m.species);
    m._types = sd?.exists ? [...sd.types] : [];
    m._baseStats = sd?.exists ? { ...sd.baseStats } : undefined;
  }

  const ctx: EvalContext = {
    suite,
    tags,
    interactions,
    threatsLib,
    each: null,
  };

  const results: Result[] = [];
  for (const test of suite.tests) {
    let partial;
    try {
      partial = evalAssertion(test.assert, team, ctx);
    } catch (err) {
      partial = {
        pass: false,
        message: `Evaluator error: ${(err as Error).message}`,
      };
    }
    results.push({
      id: test.id,
      title: test.title,
      severity: test.severity ?? "error",
      weight: test.weight,
      ...partial,
    });
  }

  const errorResults = results.filter((r) => r.severity === "error");
  const passed = errorResults.every((r) => r.pass);

  return {
    schemaVersion: "1.0.0",
    suite: suite.name ?? "unnamed",
    team: team.map((m) => ({ slot: m.slot, species: m.species })),
    format: suite.format,
    generatedAt: new Date().toISOString(),
    passed,
    summary: buildSummary(results),
    results: results.map(cleanResult),
  };
}

/** Run a subset of tests (by id) from a suite. */
export async function runTests(
  suite: Suite,
  teamText: string,
  testIds: string[],
  opts: RunSuiteOpts = {},
): Promise<Report> {
  const filtered: Suite = {
    ...suite,
    tests: suite.tests.filter((t) => testIds.includes(t.id)),
  };
  if (!filtered.tests.length)
    throw new Error(`No tests matched: ${testIds.join(", ")}`);
  return runSuite(filtered, teamText, opts);
}
