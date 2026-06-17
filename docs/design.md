# Design

## The problem

We want to express constraints on a VGC team — *"≥2 Water resists"*, *"2 mons survive Garchomp Dragon Claw"*, *"multiple forms of speed control"*, *"2HKO every top‑10 threat"* — in a form that is **actionable** (a program can check it and say which members pass) yet **flexible** enough to encode higher‑level concepts that evolve with the meta. Today these checks tend to live as one‑off imperative functions scattered across teambuilding scripts (a hand‑rolled "count the Protects", a bespoke type‑coverage loop). This schema generalizes them into a declarative, composable form.

## The structural insight

Almost every constraint is the same shape:

> **`COUNT( members satisfying a predicate )  compared to  a threshold`**

That gives a three‑layer architecture, and — crucially — pushes the hard, fast‑moving knowledge **out of the schema and into data**:

```
┌───────────────────────────────────────────────────────────────┐
│ 1. ASSERTION   count · countDistinct · coverage · team         │  the actionable skeleton
│                (a quantifier + a threshold)                    │  → trivially evaluable & explainable
├───────────────────────────────────────────────────────────────┤
│ 2. PREDICATE   all / any / not / atLeastK / ref  over ATOMS    │  composability
│                each atom → exactly one evaluator function      │
├───────────────────────────────────────────────────────────────┤
│ 3. REFERENCE DATA   tags.json · interactions.json · threats.json │ the flexibility
│   "what IS speed control / powder immunity / Garchomp's spread"  │ → edit data, no schema change
└───────────────────────────────────────────────────────────────┘
```

**Why this altitude is right**

- *Actionable*: an assertion is a count and a comparison — there is nothing to interpret. Each leaf atom maps to one small function, so the evaluator is a registry of ~25 functions, and a report can name the exact members that passed/failed.
- *Flexible*: the boolean algebra composes atoms arbitrarily; `coverage` expresses the whole "for every threat / type, the team has an answer" family in one shape; and the **tag taxonomy** lets you say "speed control" or "setup" without ever enumerating moves in a test.
- *The crux you flagged* — "moves with speed control are hard to codify" — is answered by **not codifying them in the schema**. `tagged(move, speed_control)` defers to `data/tags.json`. When the meta shifts, you edit a data file, not the schema and not any test.

## Why knowledge lives in data, not the schema

Three datasets, each versioned independently of the tests:

- **`tags.json`** — a semantic taxonomy: canonical id → tags (+ facets). `speed_control`, `protect`, `setup`, `priority`, `redirection`, `hazard_removal`, … and facets like `speedControlKind: tailwind | trick_room | paralysis | lower_speed` that power "distinct **forms**".
- **`interactions.json`** — an immunity/removal **source map**: `powder → grass‑type | Overcoat | Safety Goggles`, `prankster → dark‑type`, `intimidate → {Clear Body, Inner Focus, …} | Clear Amulet`, `ohko → Sturdy | Sash | type‑immune`. The generic `immuneTo` / `canRemove` atoms read this, so new sources are a data edit.
- **`threats.json`** — named calc targets and meta‑resolved groups, with `set:"usage"` as the low‑friction default (name a species, the spread fills in from usage stats).

A test references these by name. The test logic is stable; the domain knowledge is a living document.

## Composability levers

1. **Boolean algebra** in predicates (`all`/`any`/`not`/`atLeastK`).
2. **Named reusable fragments** — `definitions.threats` / `groups` / `predicates`, referenced by `{ "kind": "ref", … }`, threat names, group names.
3. **The tag taxonomy** — higher‑level concepts without enumeration.
4. **`coverage`** — "for every element of a group, someone satisfies a per‑element predicate" (`$each` binds the element).
5. **Suite composition** — `extends` merges a baseline suite so a format/team suite can specialize it.

## Damage calcs, with low friction

The weightiest atoms (`survives`, `koes`, `dealsDamage`) reference a **named threat**. A threat is a full set whose fields project onto `@smogon/calc`'s `Pokemon` + `Move` + `Field`. Two design choices keep friction low while staying accurate:

- **`set:"usage"`** auto‑fills the spread (and item) from the meta snapshot — name `garchomp` + `dragonclaw` and you're done. (Resolve from a usage‑stats source: the most‑used spread for the species, plus the item marginal for the attacker case.)
- **Variations** (`after_intimidate`, `plus_one`, `helping_hand`, `rain`, …) expand one threat into several board states; `survives`/`koes` pick across them with `case: worst|best|specified`, and `roll: min|max` chooses guaranteed vs possible.

A threat is usable on **either side**: as an attacker (its `move` matters) for `survives`, or as a defender (its bulk matters; `move` ignored) for `koes`/`dealsDamage`.

> **Open risk for the runner (not the schema):** the Pokémon Champions Reg M‑A format uses "stat points" with an EV cap of **32**, whereas `@smogon/calc` models mainline 252‑EV math. An evaluator targeting that format will need a shim mapping Champions stat points → effective stats before calling the calc. The schema is unaffected: it carries EVs + `format`, and intentionally does **not** hard‑code EV caps.

## Future features slot in without schema change

- **Auto‑generate "2HKO top‑N"** — emit a suite with one `coverage` test over a `meta` group. Pure data‑gen.
- **Suggestion / optimizer** — declarative predicates + the report's `uncovered`/`satisfiedBy` witnesses → for each failing test, score candidate species by how many failing atoms they flip. Entirely programmatic.
- **foul‑play / "blackglasses"** — the reserved `foulPlay` atom: a flaky AI signal over a toy board state, same assertion shell, `severity:"info"`.

---

## Hand‑traced walkthrough

Tracing three tests from `examples/suites/reg-m-a-baseline.suite.json` against the team in `examples/reports/reg-m-a-baseline.report.json` — Incineroar, Flutter Mane, Amoonguss, Garchomp, Rillaboom, Iron Hands — to confirm the atoms express the intended check. (No runner yet; this is a manual evaluation of what the evaluator will compute.)

### 1. `two-water-resists` — `count(typeEffectiveness defending water ≤ 0.5) ≥ 2`

Evaluate the per‑member predicate (defensive multiplier of incoming Water):

| member | Water multiplier | ≤ 0.5? |
|---|---|---|
| Incineroar (Fire/Dark) | 2× | ✗ |
| Flutter Mane (Ghost/Fairy) | 1× | ✗ |
| Amoonguss (Grass/Poison) | 0.5× | ✓ |
| Garchomp (Dragon/Ground) | 0.5× | ✓ |
| Rillaboom (Grass) | 0.5× | ✓ |
| Iron Hands (Fighting/Electric) | 1× | ✗ |

Count = 3, `3 >= 2` → **pass**, `satisfiedBy = [amoonguss, garchomp, rillaboom]`. (The report shows 2 for brevity; the trace shows the evaluator naming the witnesses.)

### 2. `speed-control-variety` — `countDistinct(facet:speedControlKind) where tagged(move, speed_control) ≥ 2`

Filter to members holding a speed‑control move, then collect distinct `speedControlKind` facet values from `tags.json`:

- Rillaboom → Fake Out/U‑turn/Wood Hammer + **Grassy Glide** (priority, not speed control) — but suppose it runs **Tailwind** ⇒ `speedControlKind: tailwind`.
- Amoonguss → **Trick Room?** No; Amoonguss commonly runs **Spore/Rage Powder** — not speed control here.
- Flutter Mane → fast, no speed‑control move.

To make the example concrete: with Rillaboom **Tailwind** and an Indeedee/Hatterene **Trick Room** the distinct set is `{tailwind, trick_room}` ⇒ count 2 ⇒ **pass**. Two copies of Tailwind would be `{tailwind}` ⇒ 1 ⇒ fail — which is exactly why "**forms**" uses `countDistinct` over the facet rather than `count` over members.

### 3. `twohko-top10` — `coverage{ group: top10, each: koes(2), atLeast: 1 }`

`top10` is a `meta` group → resolve to the 10 most‑used species from the snapshot, each as a defender. For each element, ask "does any member guarantee a 2HKO (low roll)?":

- Flutter Mane → Incineroar Knock Off / Iron Hands Wild Charge 2HKO ⇒ covered.
- … (8 more) …
- Iron Hands, Iron Bundle → suppose no member guarantees the 2HKO ⇒ **uncovered**.

`of:"all"` requires every element covered; two are not ⇒ **fail**, with `coverage.uncovered = [ironhands, ironbundle]`. That `uncovered` list is precisely what a suggestion button would consume: search the legal pool for a member that adds the missing 2HKOs.
