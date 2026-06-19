// Completeness gate: every atom `kind` defined in the schema, and every
// assertion shape, must be exercised by at least one example. This is what
// guarantees the worked examples demonstrably cover the user's full constraint
// list — if someone adds a new atom kind to the schema without an example,
// this test fails until an example is added.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const walkJSON = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory()
      ? walkJSON(p)
      : e.endsWith(".json")
        ? [p]
        : [];
  });

const schema = readJSON(join(root, "schema/team-test-suite.schema.json"));
const expectedKinds = new Set(
  schema.$defs.Predicate.oneOf
    .map((b) => b.properties?.kind?.const)
    .filter(Boolean),
);
const expectedShapes = new Set(["count", "countDistinct", "coverage", "team"]);

const seenKinds = new Set();
const seenShapes = new Set();
const collect = (node) => {
  if (Array.isArray(node)) return node.forEach(collect);
  if (!node || typeof node !== "object") return;
  if (typeof node.kind === "string") seenKinds.add(node.kind);
  for (const v of Object.values(node)) collect(v);
};
for (const file of walkJSON(join(root, "examples"))) {
  if (file.endsWith(".report.json")) continue;
  const suite = readJSON(file);
  collect(suite);
  for (const t of suite.tests ?? [])
    for (const s of expectedShapes)
      if (s in (t.assert ?? {})) seenShapes.add(s);
}

test("every atom kind in the schema is exercised by an example", () => {
  const missing = [...expectedKinds].filter((k) => !seenKinds.has(k));
  assert.equal(
    missing.length,
    0,
    `Atom kinds with no example: ${missing.join(", ")}`,
  );
});

test("every assertion shape is exercised by an example", () => {
  const missing = [...expectedShapes].filter((s) => !seenShapes.has(s));
  assert.equal(
    missing.length,
    0,
    `Assertion shapes with no example: ${missing.join(", ")}`,
  );
});
