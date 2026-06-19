# Authoring a suite

A suite is one JSON file. Minimum:

```jsonc
{
  "$schema": "https://vgc.tests/team-test-suite.schema.json",
  "schemaVersion": "1.0.0",
  "name": "My suite",
  "tests": [
    {
      "id": "kebab-case-id",
      "assert": {
        "count": "members",
        "where": { "kind": "ability", "is": "intimidate" },
        "op": ">=",
        "value": 1,
      },
    },
  ],
}
```

Point your editor at the `$schema` URL (or the local file) for completion and inline validation.

## Picking an assertion shape

- **"At least / at most N members do X"** → `count`.
- **"N _different kinds_ of X"** → `countDistinct` over the distinguishing attribute (often a tag `facet:`). Two Tailwinds are one _kind_; Tailwind + Trick Room are two.
- **"For every X, the team has an answer"** → `coverage` over a group; `each` is checked per element with `$each` bound.
- **"Several _different_ existence requirements at once"** → `team` (e.g. someone has Fake Out **and** someone has redirection — possibly different slots).

## Severity & weight

- `severity`: `error` (hard requirement — a failure fails the suite) · `warn` (should‑have) · `info` (nice‑to‑have / experimental). Lets one suite hold both gates and guidance.
- `weight` (default 1): a hint for scoring and for ranking suggestions when several tests fail.

## Threats with minimum friction

Define a threat once in `definitions.threats`, reference it by name from any calc atom.

```jsonc
"definitions": {
  "threats": {
    "chomp_dragonclaw": {
      "species": "garchomp", "move": "dragonclaw", "set": "usage",
      "variations": [ { "name": "after Intimidate", "boosts": { "atk": -1 } } ]
    }
  }
}
```

- **`set: "usage"`** is the default you want: it auto‑fills the spread (and item) from the suite's `meta` snapshot. Only spell out `evs`/`nature`/`item` when a calc needs exactness.
- **`case` + `roll`** tune caution: `survives` with `case:"worst"` picks the most damaging variation; `roll:"max"` means _even the high roll_ leaves >0 HP (a true survival). `koes` with `roll:"min"` means a _guaranteed_ KO.
- A threat is reusable on **either side** — `move` matters when it attacks (`survives`); it's ignored when the threat is a KO target (`koes`/`dealsDamage`).

For "the current meta", use a `meta` group instead of listing names:

```jsonc
"groups": { "top10": { "kind": "meta", "from": "usage", "topN": 10, "move": "bestDamaging" } }
```

## Reuse: predicates, groups, suite composition

- `definitions.predicates` + `{ "kind": "ref", "predicate": "<name>" }` to name a predicate once and reuse it.
- `definitions.groups` for allow‑lists (`good_mons`), threat groups, and value lists (`all_types`).
- `extends: ["./baseline.suite.json"]` to inherit a baseline suite's tests/definitions and add or override.

## Validate your suite

```bash
npm test                                   # validates everything under examples/
node -e "…"                                # or validate a single file with ajv
```

`data-lint` will flag a misspelled move/item/ability/species id, an unknown tag/effect/hazard, and a dangling `group`/`predicate`/`threat` reference — so a typo fails loudly instead of silently evaluating to "no match". Add your own suites under `examples/` (or wherever the future CLI points) to get the same coverage.

## Worked snippets

Every constraint family has an annotated example in [`examples/snippets/`](../examples/snippets):

| file                   | demonstrates                                                               |
| ---------------------- | -------------------------------------------------------------------------- |
| `defense-types.json`   | type resists, marilland‑style `coverage` over all types, defensive Tera    |
| `survival-calcs.json`  | `survives`, `coverage` over a threat group, `vsThreat`                     |
| `offense-calcs.json`   | `koes`, `dealsDamage`, "2HKO top‑N" via a meta group                       |
| `speed.json`           | `stat` (base & final+mods), `outspeeds`                                    |
| `immunities.json`      | `immuneTo` by effect and by `moveTag`, Intimidate                          |
| `moves-and-items.json` | `tagged` (setup/protect/speed_control), `countDistinct`, literal item/move |
| `hazards.json`         | `canRemove` (toxic spikes)                                                 |
| `composition.json`     | `inGroup` allow‑list, `team` existential assertion                         |
| `misc-atoms.json`      | `nature`, `gender`, `level`, `atLeastK`, `ref`, `teraType`                 |
