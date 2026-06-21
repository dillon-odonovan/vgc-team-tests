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
  // oneOf unions (predicates) make ajv emit an error per failing branch, so the
  // raw list is noisy and repetitive — dedupe to keep the panel readable.
  const errors = [...new Set((validate.errors ?? []).map(formatError))];
  return { valid: false, errors };
}
