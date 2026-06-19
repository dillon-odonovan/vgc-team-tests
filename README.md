# vgc-team-tests

A declarative, composable schema for writing **"unit tests" on VGC teams** (doubles, bring‑6‑choose‑4) — constraints like _"≥2 Water resists"_, _"2 mons survive Garchomp Dragon Claw"_, _"multiple forms of speed control"_, _"2HKO every top‑10 threat"_.

This repo is a **schema + reference‑data design** (JSON Schema, draft 2020‑12) with worked examples. The evaluator/runner that executes a suite against a real team is **future work** — but the calc objects are designed to project directly onto [`@smogon/calc`](https://github.com/smogon/damage-calc), and the atoms map onto standard primitives (a damage calculator, a type chart, a level‑50 stat calculator, and usage‑stat spreads).

## The one idea

Almost every constraint reduces to:

> **`COUNT( members matching a PREDICATE )  ⨾  THRESHOLD`**

So a test is a thin **assertion** (count / count‑distinct / coverage / team) wrapped around a **predicate** — a boolean algebra (`all`/`any`/`not`) over typed **leaf atoms**. The genuinely hard, meta‑specific knowledge (_what counts as "speed control"? what's immune to "powder"? what spread does Garchomp run?_) is **not** baked into the schema; it lives in versioned **reference data** the atoms reference by name. Add new meta knowledge by editing data — no schema change.

```jsonc
// "At least 2 Water resists"
{
  "id": "two-water-resists",
  "assert": {
    "count": "members",
    "where": {
      "kind": "typeEffectiveness",
      "role": "defending",
      "vsType": "water",
      "op": "<=",
      "value": 0.5,
    },
    "op": ">=",
    "value": 2,
  },
}
```

```jsonc
// "Multiple FORMS of speed control" — distinct mechanisms, not duplicate copies
{
  "id": "speed-control-variety",
  "assert": {
    "countDistinct": "facet:speedControlKind",
    "where": { "kind": "tagged", "of": "move", "tag": "speed_control" },
    "op": ">=",
    "value": 2,
  },
}
```

```jsonc
// "2HKO every top-10 threat" — coverage over a meta-resolved group
{
  "id": "twohko-top10",
  "assert": {
    "coverage": {
      "group": "top10",
      "each": { "kind": "koes", "threat": "$each", "hits": 2, "roll": "min" },
      "atLeast": 1,
    },
  },
}
```

## Four assertion shapes

| shape           | meaning                                                                                           | use                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `count`         | # members satisfying `where` vs a threshold                                                       | the workhorse                                                   |
| `countDistinct` | # distinct values of an attribute among members                                                   | **variety** ("multiple forms of …")                             |
| `coverage`      | for {all\|any} elements of a group, ≥`atLeast` members satisfy `each` (`$each` binds the element) | **"for every X, someone handles it"** (marilland; "2HKO top‑N") |
| `team`          | a boolean combination of **existential** member requirements                                      | "(someone has Fake Out) AND (someone has Trick Room)"           |

See [`docs/atoms.md`](docs/atoms.md) for the full leaf‑atom catalog and [`docs/design.md`](docs/design.md) for the rationale.

## Layout

```
schema/
  team-test-suite.schema.json    # suite / test / assert / predicate / atom catalog (self-contained)
  team-test-report.schema.json   # result shape with witnesses (satisfiedBy / uncovered)
data/
  tags.json            # taxonomy: id -> tags (+facets). "what is speed control / setup / protect"
  interactions.json    # immunity & hazard-removal SOURCE map. "what is immune to powder / fissure"
  threats.json         # named calc targets, meta-resolved groups, variation presets
examples/
  suites/    reg-m-a-baseline.suite.json   # flagship suite using ~every atom + all 4 shapes
  snippets/  *.json                        # one annotated mini-suite per constraint family
  reports/   *.report.json                 # a worked report (validates against the report schema)
docs/        design.md · atoms.md · authoring.md · reference-data.md
types/       suite.d.ts · report.d.ts      # generated TS mirror (npm run build:types)
test/        validate-examples · data-lint · coverage-checklist
```

## Verify

```bash
npm install      # ajv, ajv-formats, json-schema-to-typescript, @pkmn/dex (dev only)
npm test         # 3 gates, ~27 checks
```

The tests are how a design‑only deliverable proves itself:

1. **`validate-examples`** — every example validates against its schema (suite or report); the shared threat library conforms to the schema's `$defs`.
2. **`data-lint`** — every move/item/ability/species id in `data/` and `examples/` is a **real Showdown id** (checked against `@pkmn/dex`); every tag/effect/hazard/group/predicate/threat an example references actually **exists** (closed‑vocab + no dangling refs).
3. **`coverage-checklist`** — every atom `kind` in the schema and every assertion shape is exercised by at least one example, so the worked examples provably cover the whole design.

## Status & what's next

Design‑only. The natural next steps (each builds on this schema **without changing it**):

- **Evaluator** — map each atom `kind` to one function (type chart, stat calc, `@smogon/calc` for `survives`/`koes`/`dealsDamage`), emit a [report](schema/team-test-report.schema.json). Integration notes are in [`docs/reference-data.md`](docs/reference-data.md).
- **"2HKO top‑N" generator** — emit a suite with one `coverage` test over a meta‑resolved group.
- **Suggestion / optimizer** — for each failing test, search the legal pool for mons that flip the failing predicate, ranked by how many failures they fix. The report's `uncovered`/`satisfiedBy` witnesses are exactly this input. No LLM required.
- **foul‑play / "blackglasses"** — the reserved `foulPlay` atom is a flaky battle‑AI signal over toy board states; same assertion shell, `severity:"info"`.
