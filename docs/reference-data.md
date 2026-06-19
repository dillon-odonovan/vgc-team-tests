# Reference data & evaluator integration

The schema deliberately holds no meta knowledge. Three data files do, and a future evaluator wires the atoms to standard calculation primitives.

## `data/tags.json` — the taxonomy

```jsonc
{ "moves":     { "<moveid>":    { "tags": [ … ], "<facet>": <value> } },
  "items":     { "<itemid>":    { "tags": [ … ], "speedMult"?: 1.5, "grantsImmunity"?: [ … ] } },
  "abilities": { "<abilityid>": { "tags": [ … ], "grantsImmunity"?: [ … ] } },
  "species":   { "<speciesid>": { "tags": [ … ] } } }
```

- `tags` is the open vocabulary the `tagged` atom matches against.
- **Facets** (any key other than `tags`) carry sub‑type data — e.g. `speedControlKind: tailwind | trick_room | paralysis | lower_speed`. `countDistinct: "facet:speedControlKind"` counts distinct _mechanisms_; `tagged … facet/equals` filters to one.
- Seed from standard competitive categorizations: protect moves, priority moves, redirection, hazard control, setup moves, choice items, speed‑modifying items/abilities, and type/secondary immunities.

## `data/interactions.json` — immunity & removal sources

`effect → { anyOf: [ source‑predicate … ] }`. The generic `immuneTo`/`canRemove` atoms look the effect/hazard up here and evaluate the source‑predicate against the member.

**Source‑predicate grammar** (a node matches if it holds for the member):

| node                           | matches when                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `{ "type": name \| [names] }`  | member is (one of) that type                                                                                         |
| `{ "ability": [ids] }`         | member's ability ∈ list                                                                                              |
| `{ "item": [ids] }`            | member's item ∈ list                                                                                                 |
| `{ "move": [ids] }`            | member knows one of these moves                                                                                      |
| `{ "grounded": true }`         | member is grounded                                                                                                   |
| `{ "weather": name }`          | requires that weather active (conditional immunity)                                                                  |
| `{ "all": [ … ] }`             | AND                                                                                                                  |
| `{ "anyOf": [ … ] }`           | OR (also the top‑level form)                                                                                         |
| `{ "typeImmuneToMove": true }` | member's typing is immune to the incoming move's type (per‑move `moveTag` immunities, e.g. Flying vs Ground Fissure) |

Three buckets: `immunities` (named effects), `moveTagImmunities` (per‑move classes like `fissure`/`horndrill`/`sheercold`, each layering the type‑agnostic `ohko` block on top of its own type‑immunity — `ohko` itself stays type‑agnostic since Sturdy/Sash block any OHKO move regardless of type), `hazardRemoval` (per‑hazard).

## `data/threats.json` — calc targets, groups, variations

A shared library a runtime merges into a suite's `definitions` (so suites can reference its names). Structure mirrors the schema's `Threat` / `Group` / `Variation` `$defs` and is validated against them by `test/validate-examples`.

- **`set:"usage"`** is the friction‑minimizer: resolve the spread from usage stats; resolve the item from the Items marginal.
- **Groups**: `meta` (auto top‑N), `threats` (named/inline), `values` (e.g. all 18 types), `species` (allow‑lists).
- **Variations**: reusable board‑state overrides (`after_intimidate`, `helping_hand`, `rain`, …).

## Maintenance / linting

`test/data-lint` enforces, against `@pkmn/dex` (gen 9):

- every id in `tags.json` keys and in `interactions.json` / `threats.json` values is a real Showdown id;
- every tag/effect/hazard an example references exists in the data;
- every `group`/`predicate`/`threat` reference resolves within its suite (no dangling refs).

Run `npm test` after any edit. Add an id‑typo and watch it fail.

---

## Evaluator integration map (future runner)

Each atom `kind` becomes one registered function over a resolved member. Build on standard primitives rather than reinventing them:

| concern                             | approach                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Team / member model                 | a per‑Pokemon set — species, item, ability, moves, nature, EVs, and (required by calc atoms) `teraType`, `level`, `ivs`                        |
| Canonical ids                       | normalize to Showdown ids (lowercase, strip non‑alphanumerics); the schema validates ids as `^[a-z0-9]+$`                                      |
| `typeEffectiveness`                 | a type‑effectiveness table (attacker type → defender type → multiplier)                                                                        |
| `stat` / `outspeeds`                | a level‑50 stat calculator (from base/EVs/IVs/nature), then apply the `mods` multipliers (scarf, tailwind, paralysis, weather speed abilities) |
| `survives` / `koes` / `dealsDamage` | **`@smogon/calc`** (the chosen backend) for damage rolls; KO/2HKO with Focus Sash / Eviolite handling                                          |
| Threat `set:"usage"`                | a usage‑stats source: the most‑used spread for the species (any nature) plus the item marginal for a default item                              |
| Report                              | emit `team-test-report.schema.json` — `satisfiedBy` / `coverage.uncovered` feed the optimizer                                                  |

**Champions Reg M‑A caveat:** `@smogon/calc` assumes mainline 252‑EV stat math; the Champions format uses stat points with an EV cap of 32. An evaluator targeting that format needs a shim that converts Champions stat points → effective stats before invoking the calc. The schema carries EVs + `format` and is unaffected.
