/**
 * Persistence for user-authored suites. There is no backend, so custom suites
 * live in the browser's localStorage under a single key. All access is guarded
 * so a missing or corrupt store simply degrades to "no custom suites".
 */
import type { Suite } from "../../src/types.ts";

const STORAGE_KEY = "vgc-custom-suites";

export interface CustomSuiteRecord {
  /** Stable UUID; distinct from bundled suite ids. */
  id: string;
  /** Human-friendly label for the picker (derived from suite.name). */
  label: string;
  suite: Suite;
  /** Epoch millis of the last save, for ordering. */
  updatedAt: number;
}

/** Derives a non-empty picker label from a suite. */
export function labelFor(suite: Suite): string {
  const name = suite.name?.trim();
  return name && name.length > 0 ? name : "Untitled suite";
}

/** Returns all custom suites, newest first. Never throws. */
export function listCustomSuites(): CustomSuiteRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as CustomSuiteRecord[])
      .filter((r) => r && typeof r.id === "string" && r.suite)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch {
    return [];
  }
}

function writeAll(records: CustomSuiteRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** Creates a record id. */
export function newSuiteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `suite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Inserts or updates a suite by id, refreshing its label and timestamp.
 * Returns the full updated list so callers don't need a second read.
 */
export function saveCustomSuite(id: string, suite: Suite): CustomSuiteRecord[] {
  const record: CustomSuiteRecord = {
    id,
    label: labelFor(suite),
    suite,
    updatedAt: Date.now(),
  };
  const rest = listCustomSuites().filter((r) => r.id !== id);
  const all = [record, ...rest];
  writeAll(all);
  return all;
}

/** Removes a suite by id. Returns the full updated list. */
export function deleteCustomSuite(id: string): CustomSuiteRecord[] {
  const all = listCustomSuites().filter((r) => r.id !== id);
  writeAll(all);
  return all;
}
