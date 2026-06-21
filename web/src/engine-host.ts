/**
 * Browser host for the team-test engine. Bundles the reference data and the
 * example suites at build time (via JSON imports) and exposes a single
 * `evaluate()` that runs the engine entirely client-side — no backend.
 */
import { runSuite } from "../../src/engine.ts";
import type { ReferenceData, Report, Suite } from "../../src/types.ts";

import tags from "../../data/tags.json";
import interactions from "../../data/interactions.json";
import threatsLib from "../../data/threats.json";

import regMaBaseline from "../../examples/suites/reg-m-a-baseline.suite.json";
import sampleTeam from "../../examples/teams/sample-reg-m-a.txt?raw";

/** Reference data shared by every evaluation, assembled from the bundled JSON. */
const referenceData = {
  tags,
  interactions,
  threatsLib,
} as unknown as ReferenceData;

export interface SuiteEntry {
  /** Stable key used as the <select> value. */
  id: string;
  /** Human-friendly label for the dropdown. */
  label: string;
  suite: Suite;
}

/**
 * The suites shipped with the app. Add a line here to expose another bundled
 * suite in the picker. User-authored suites live in localStorage (see
 * storage.ts) and are merged into the picker by App.tsx.
 */
export const BUNDLED_SUITES: SuiteEntry[] = [
  {
    id: "reg-m-a-baseline",
    label: (regMaBaseline as { name?: string }).name ?? "Reg M-A baseline",
    suite: regMaBaseline as unknown as Suite,
  },
];

/** A starter team paste so the tool is useful on first load. */
export const SAMPLE_TEAM = sampleTeam;

/** Runs a bundled suite against a team paste, fully in the browser. */
export function evaluate(suite: Suite, teamText: string): Promise<Report> {
  return runSuite(suite, teamText, referenceData);
}
