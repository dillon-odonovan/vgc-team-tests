/**
 * Validates a candidate suite against the canonical JSON Schema shipped with
 * the engine. We reuse the exact schema the CLI/tests validate against (draft
 * 2020-12), so a suite authored in the browser is guaranteed engine-valid.
 */
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import schema from "../../schema/team-test-suite.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Renders one ajv error as a readable `path: message` line. */
function formatError(err: ErrorObject): string {
  const path = err.instancePath || "(root)";
  let msg = err.message ?? "is invalid";
  if (err.keyword === "additionalProperties") {
    const prop = (err.params as { additionalProperty?: string })
      .additionalProperty;
    if (prop) msg = `${msg} ('${prop}')`;
  }
  if (err.keyword === "enum") {
    const allowed = (err.params as { allowedValues?: unknown[] }).allowedValues;
    if (allowed) msg = `${msg}: ${allowed.join(", ")}`;
  }
  return `${path}: ${msg}`;
}

/** Validates an already-parsed value against the suite schema. */
export function validateSuite(value: unknown): ValidationResult {
  const valid = validate(value) as boolean;
  if (valid) return { valid: true, errors: [] };

  // The Predicate union has ~25 `oneOf` branches, so a single bad predicate
  // makes ajv emit one error per failing branch at the same instancePath,
  // plus a content-free "must match exactly one schema in oneOf" aggregator.
  // Drop the aggregator (it never has actionable detail) and collapse the
  // rest per instancePath so one bad field shows a short, readable list
  // instead of dozens of near-duplicate lines.
  const byPath = new Map<string, Set<string>>();
  for (const err of validate.errors ?? []) {
    if (err.keyword === "oneOf") continue;
    const path = err.instancePath || "(root)";
    const messages = byPath.get(path) ?? new Set<string>();
    messages.add(formatError(err));
    byPath.set(path, messages);
  }

  const errors: string[] = [];
  for (const messages of byPath.values()) {
    const list = [...messages];
    errors.push(...list.slice(0, 3));
    if (list.length > 3)
      errors.push(`…and ${list.length - 3} more for this field`);
  }
  return { valid: false, errors };
}
