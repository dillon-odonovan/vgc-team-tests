# Atom & assertion catalog

The normative source is [`schema/team-test-suite.schema.json`](../schema/team-test-suite.schema.json). This is the human reference: what each piece means, and which primitive a future evaluator computes it with.

## Assertions (`test.assert`)

| shape           | fields                                                        | semantics                                                                                                                                                       |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`         | `count:"members"`, `where?`, `op`, `value`                    | # members satisfying `where` (all if omitted) `op` `value`.                                                                                                     |
| `countDistinct` | `countDistinct`, `where?`, `op`, `value`                      | # **distinct** values of an attribute among members. Attribute: `species`/`item`/`ability`/`teraType`/`type`/`move`/`facet:<facetKey>`.                         |
| `coverage`      | `coverage:{ group, each, atLeast=1, of="all", by="members" }` | For `of` (all\|any) elements of `group`, ≥`atLeast` members satisfy `each`. `$each` binds the current element inside `each`.                                    |
| `team`          | `team: <predicate>`                                           | Whole‑team escape hatch. In team scope each **member‑atom is existential** ("some member satisfies it"), so `all`/`any`/`not` combine _different_ requirements. |

`op` ∈ `>= <= > < == !=`.

## Composites

| `kind`     | fields              | meaning                                  |
| ---------- | ------------------- | ---------------------------------------- |
| `all`      | `of: [pred…]`       | AND                                      |
| `any`      | `of: [pred…]`       | OR                                       |
| `not`      | `of: pred`          | NOT                                      |
| `atLeastK` | `k`, `of: [pred…]`  | ≥ k of n                                 |
| `ref`      | `predicate: <name>` | reference `definitions.predicates[name]` |

## Leaf atoms

Identity / membership (the "easy" ones — direct equality):

| `kind`     | fields                               | notes                                     |
| ---------- | ------------------------------------ | ----------------------------------------- |
| `species`  | `is` \| `in[]`                       | Showdown ids                              |
| `ability`  | `is` \| `in[]`                       |                                           |
| `item`     | `is` \| `in[]` \| `present:bool`     | `present:false` = holds no item           |
| `move`     | `has` \| `hasAny[]` \| `hasAll[]`    | knows move(s)                             |
| `type`     | `has` \| `hasAny[]` \| `isExactly[]` | the member's own typing                   |
| `teraType` | `is` \| `in[]`                       | includes `stellar`                        |
| `nature`   | `is` \| `in[]`                       |                                           |
| `gender`   | `is: M\|F\|N`                        |                                           |
| `level`    | `op`, `value`                        |                                           |
| `inGroup`  | `group: <name>`                      | species ∈ a `species` group (allow‑lists) |

Taxonomy / interaction‑backed (the "higher‑level concept" bridge — read reference data):

| `kind`      | fields                                                         | reads                                    | backend                                                 |
| ----------- | -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `tagged`    | `of: move\|item\|ability\|species`, `tag`, `facet?`, `equals?` | `data/tags.json`                         | seed from competitive move/item/ability categorizations |
| `immuneTo`  | `effect` \| `moveTag` \| `move`                                | `data/interactions.json`                 | new immunity = data edit                                |
| `canRemove` | `hazard`                                                       | `data/interactions.json` `hazardRemoval` | grounded‑poison absorb / spin / defog                   |

Computed (need calc/derivation):

| `kind`                  | fields                                                                                              | meaning                                                                                                                      | backend                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `stat`                  | `stat`, `vs: base\|final`, `mods[]`, `op`, `value`                                                  | base stat, or lvl‑50 stat from EVs/IVs/nature then `mods` (scarf ×1.5, tailwind ×2, paralysis ×0.5, weather speed abilities) | level‑50 stat calculator + mod multipliers |
| `outspeeds`             | `threat`, `mods[]`, `orSpeedTie?`, `underTrickRoom?`                                                | member effective Speed beats the threat's (threat carries its own mods)                                                      | effective‑speed comparison                 |
| `typeEffectiveness`     | `role: defending\|attacking`, `vsType`\|`vsThreat`, `withTera?`, `op`, `value`                      | incoming‑type multiplier on the member (resist ⇒ ≤0.5), or the member's offense vs a type/threat                             | type‑effectiveness table                   |
| `survives`              | `threat`, `case: worst\|best\|specified`, `variation?`, `roll: min\|max\|avg`, `hits?`, `withTera?` | member survives the threat's hit(s) from full HP                                                                             | `@smogon/calc`                             |
| `koes`                  | `threat`, `hits` (1=OHKO,2=2HKO), `roll: min\|max`, `move?`, `withTera?`                            | member's best move KOs the threat in `hits`                                                                                  | `@smogon/calc` (Sash/Eviolite‑aware)       |
| `dealsDamage`           | `threat`, `move?`, `roll`, `fraction:{op,value}`                                                    | member deals ≥/≤ a fraction of the threat's HP                                                                               | `@smogon/calc`                             |
| `foulPlay` _(reserved)_ | `scenario`, `threshold?`, `samples?`                                                                | flaky battle‑AI signal over a toy board state                                                                                | future                                     |

## Threats, groups, variations

- **Threat** (`definitions.threats[name]`): `species` (req), `move?`, `set` (`"usage"` = auto‑fill from meta), `item`/`ability`/`nature`/`evs`/`ivs`/`level`/`teraType`/`tera`/`boosts`/`isCrit`/`field`, `variations[]`. Fields project onto `@smogon/calc`.
- **Group** (`definitions.groups[name]`): `species` (allow‑list) · `threats` (list of names/inline) · `meta` (`from:"usage"`, `topN`, `move`) · `values` (`valueType`, `members`, for "every type" coverage).
- **Variation**: an override bundle (`boosts`/`field`/`item`/`ability`) applied on top of a threat to model a board state; referenced by name from `data/threats.json` `variations` or inlined.

The special token **`$each`** is valid wherever a `threat` or `vsType` is expected; inside a `coverage.each` predicate it binds to the current group element.
