// Validates every example against the appropriate schema, and the shared
// threats library against the suite schema's $defs. This is the design's
// "test suite": with no runner yet, AJV conformance is how we prove the schema
// expresses every constraint and the examples stay well-formed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));

function walkJSON(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkJSON(p));
    else if (entry.endsWith(".json")) out.push(p);
  }
  return out;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const suiteSchema = readJSON(join(root, "schema/team-test-suite.schema.json"));
const reportSchema = readJSON(join(root, "schema/team-test-report.schema.json"));
ajv.addSchema(suiteSchema);
ajv.addSchema(reportSchema);

const validateSuite = ajv.getSchema(suiteSchema.$id);
const validateReport = ajv.getSchema(reportSchema.$id);

const fmt = (errors) => JSON.stringify(errors, null, 2);

for (const file of walkJSON(join(root, "examples"))) {
  const rel = file.slice(root.length + 1);
  const isReport = file.endsWith(".report.json");
  test(`schema: ${rel}`, () => {
    const data = readJSON(file);
    const validate = isReport ? validateReport : validateSuite;
    const ok = validate(data);
    assert.ok(ok, `${rel} failed ${isReport ? "report" : "suite"} schema:\n${fmt(validate.errors)}`);
  });
}

test("data/threats.json conforms to the suite schema $defs", () => {
  const vThreat = ajv.compile({ $ref: `${suiteSchema.$id}#/$defs/Threat` });
  const vGroup = ajv.compile({ $ref: `${suiteSchema.$id}#/$defs/Group` });
  const vVariation = ajv.compile({ $ref: `${suiteSchema.$id}#/$defs/Variation` });
  const lib = readJSON(join(root, "data/threats.json"));
  for (const [k, v] of Object.entries(lib.threats ?? {}))
    assert.ok(vThreat(v), `threat '${k}':\n${fmt(vThreat.errors)}`);
  for (const [k, v] of Object.entries(lib.groups ?? {}))
    assert.ok(vGroup(v), `group '${k}':\n${fmt(vGroup.errors)}`);
  for (const [k, v] of Object.entries(lib.variations ?? {}))
    assert.ok(vVariation(v), `variation '${k}':\n${fmt(vVariation.errors)}`);
});
