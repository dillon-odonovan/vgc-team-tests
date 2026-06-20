/**
 * Node-only loader for the engine's reference data. The engine itself
 * ({@link ./engine.ts}) is filesystem-free so it can run in the browser; this
 * module reads the default `data/*.json` files from disk and is used by the CLI
 * (and any other Node host) to build the {@link RunSuiteOpts} the engine needs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import type {
  InteractionsData,
  ReferenceData,
  TagsData,
  ThreatsLib,
} from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function loadJSON<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), "utf8")) as T;
}

/**
 * Reads the default reference data (`data/tags.json`,
 * `data/interactions.json`, `data/threats.json`) from the package root.
 */
export function loadReferenceData(): ReferenceData {
  return {
    tags: loadJSON<TagsData>("data/tags.json"),
    interactions: loadJSON<InteractionsData>("data/interactions.json"),
    threatsLib: loadJSON<ThreatsLib>("data/threats.json"),
  };
}
