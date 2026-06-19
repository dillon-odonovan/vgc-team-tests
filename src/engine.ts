/**
 * Orchestrator: given a suite and a team paste, evaluates every test and
 * returns a `VGCTeamTestReport`-shaped object. This is the main entry point
 * for embedding the engine in other code — see {@link runSuite}.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { gen9 } from "./dex.js";
import { evalAssertion } from "./eval-assertion.js";
import { parseShowdownPaste } from "./parse-team.js";
import { enrichTeam } from "./team-member.js";
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

/** Tallies pass/fail counts per severity for the report's `summary` field. */
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

/** Drops `undefined`-valued optional fields so the emitted JSON only has keys that are actually set. */
function cleanResult(r: Result): Result {
  const entries = Object.entries(r).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries) as unknown as Result;
}

/** Optional overrides for the reference data the engine would otherwise load from `data/*.json` — mainly for tests. */
export interface RunSuiteOpts {
  tags?: TagsData;
  interactions?: InteractionsData;
  threatsLib?: ThreatsLib;
}

/**
 * Runs every test in a suite against a team.
 *
 * @param suite - A parsed suite document (a `VGCTeamTestSuite`).
 * @param teamText - Showdown/pokepaste paste text for the team under test.
 * @param opts - Overrides for the reference data sources; defaults to
 *   loading `data/tags.json`, `data/interactions.json`, and
 *   `data/threats.json` from the package root.
 * @returns The completed report: per-test results, severity summary, and
 *   an overall `passed` flag (true iff every `error`-severity test passed).
 * @throws If the team paste contains no Pokémon.
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

  enrichTeam(team, gen9);

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

/**
 * Runs only the named subset of a suite's tests against a team — the
 * `--tests` CLI flag's underlying implementation.
 *
 * @param testIds - Test ids to run; must match at least one test.
 * @throws If no test in `suite` matches any id in `testIds`.
 */
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
