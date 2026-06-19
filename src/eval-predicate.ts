/**
 * Evaluates a single {@link Predicate} (an atom, or a boolean composite of
 * atoms) against one team member. This is the leaf-level engine that every
 * assertion shape (count / countDistinct / coverage / team) ultimately
 * calls once per member — see `docs/atoms.md` for the full atom catalog.
 */
import {
  buildCalcField,
  buildCalcPokemon,
  buildMemberPokemon,
  calcTotalDamage,
} from "./calc-pokemon.js";
import { compare } from "./compare.js";
import { gen9 } from "./dex.js";
import { evalSource } from "./eval-source.js";
import { tryOrNull } from "./safe.js";
import { applyMods } from "./stat-calc.js";
import { memberTypes } from "./team-member.js";
import {
  resolveGroup,
  resolveThreatRef,
  resolveVariations,
} from "./threats.js";
import { typeEffectiveness } from "./type-chart.js";
import type {
  EvalContext,
  FieldSpec,
  Predicate,
  StatModifier,
  TaggedPredicate,
  TagEntry,
  TagsData,
  TeamMember,
  Variation,
} from "./types.js";

// Canonical type used when checking OHKO-move immunities for typeImmuneToMove.
// Fissure (Ground) is the canonical VGC OHKO move.
const MOVE_TAG_TYPES: Record<string, string> = {
  ohko: "ground",
};

/** Wraps a possibly-absent `tags.json` entry lookup as a 0-or-1-element list, for uniform iteration. */
function singleEntry(
  byId: Record<string, TagEntry> | undefined,
  id: string | null,
): TagEntry[] {
  const e = id ? byId?.[id] : undefined;
  return e ? [e] : [];
}

/** Collects the `tags.json` entries for whichever of the member's moves/item/ability/species apply. */
function getTagEntry(
  member: TeamMember,
  of: TaggedPredicate["of"],
  tags: TagsData,
): TagEntry[] {
  switch (of) {
    case "move":
      return member.moves
        .map((id) => tags.moves?.[id])
        .filter((e): e is TagEntry => Boolean(e));
    case "item":
      return singleEntry(tags.items, member.item);
    case "ability":
      return singleEntry(tags.abilities, member.ability);
    case "species":
      return singleEntry(tags.species, member.species);
  }
}

/** Exact-match (`is`) or membership (`in`) test, shared by the species/ability/nature/teraType/item atoms. */
function evalIsIn(
  value: string | null,
  pred: { is?: string; in?: string[] },
): boolean {
  if (pred.is != null) return value === pred.is;
  if (pred.in != null) return value != null && pred.in.includes(value);
  return false;
}

/**
 * Evaluates a predicate against one team member.
 *
 * @param pred - The predicate to evaluate.
 * @param member - The team member to test (should already be enriched via
 *   {@link enrichTeam} so `_types`/`_baseStats` are populated).
 * @param ctx - Evaluation context: suite definitions, reference data, and
 *   the current `$each` binding (set by the enclosing coverage assertion).
 * @returns Whether `member` satisfies `pred`.
 * @throws If a `ref`/`inGroup` name doesn't resolve, or `$each` is used
 *   outside a coverage assertion.
 */
export function evalPredicate(
  pred: Predicate,
  member: TeamMember,
  ctx: EvalContext,
): boolean {
  switch (pred.kind) {
    // Composites
    case "all":
      return pred.of.every((p) => evalPredicate(p, member, ctx));
    case "any":
      return pred.of.some((p) => evalPredicate(p, member, ctx));
    case "not":
      return !evalPredicate(pred.of, member, ctx);
    case "atLeastK": {
      let k = 0;
      for (const p of pred.of) if (evalPredicate(p, member, ctx)) k++;
      return k >= pred.k;
    }
    case "ref": {
      const def = ctx.suite.definitions?.predicates?.[pred.predicate];
      if (!def) throw new Error(`Unknown predicate ref: ${pred.predicate}`);
      return evalPredicate(def, member, ctx);
    }

    // Identity atoms
    case "species":
      return evalIsIn(member.species, pred);
    case "ability":
      return evalIsIn(member.ability, pred);
    case "nature":
      return evalIsIn(member.nature, pred);
    case "gender":
      return member.gender === pred.is;
    case "level":
      return compare(member.level ?? 50, pred.op, pred.value);
    case "item": {
      if (pred.present != null) {
        const has = member.item != null && member.item !== "";
        return pred.present ? has : !has;
      }
      return evalIsIn(member.item, pred);
    }
    case "move": {
      const moves = member.moves ?? [];
      if (pred.has != null) return moves.includes(pred.has);
      if (pred.hasAny != null)
        return pred.hasAny.some((m) => moves.includes(m));
      if (pred.hasAll != null)
        return pred.hasAll.every((m) => moves.includes(m));
      return false;
    }
    case "type": {
      const types = memberTypes(member);
      if (pred.has != null) return types.includes(pred.has.toLowerCase());
      if (pred.hasAny != null)
        return pred.hasAny.some((t) => types.includes(t.toLowerCase()));
      if (pred.isExactly != null) {
        const a = [...pred.isExactly.map((t) => t.toLowerCase())].sort();
        const b = [...types].sort();
        return a.join(",") === b.join(",");
      }
      return false;
    }
    case "teraType":
      return evalIsIn(member.teraType, pred);
    case "inGroup": {
      const group = resolveGroup(pred.group, ctx);
      if (!group) throw new Error(`Unknown group: ${pred.group}`);
      if (group.kind === "species") {
        return (group.members ?? []).includes(member.species);
      }
      return false; // non-species groups are for coverage assertions, not inGroup
    }

    // Taxonomy atoms
    case "tagged": {
      const entries = getTagEntry(member, pred.of, ctx.tags);
      for (const entry of entries) {
        if (!entry.tags?.includes(pred.tag)) continue;
        if (pred.facet != null) {
          if (pred.equals != null) {
            if (entry[pred.facet] === pred.equals) return true;
          } else if (entry[pred.facet] != null) {
            return true;
          }
        } else {
          return true;
        }
      }
      return false;
    }
    case "immuneTo": {
      const { interactions } = ctx;
      if (pred.effect != null) {
        const src = interactions.immunities?.[pred.effect];
        if (!src) return false;
        return evalSource(src, member, { typeEffectiveness });
      }
      if (pred.moveTag != null) {
        const src = interactions.moveTagImmunities?.[pred.moveTag];
        if (!src) return false;
        const moveType = MOVE_TAG_TYPES[pred.moveTag] ?? null;
        return evalSource(src, member, { typeEffectiveness, moveType });
      }
      return false;
    }
    case "canRemove": {
      const src = ctx.interactions.hazardRemoval?.[pred.hazard];
      if (!src) return false;
      return evalSource(src, member, { typeEffectiveness });
    }

    // Computed atoms
    case "stat": {
      const statKey = pred.stat;
      if (pred.vs === "base") {
        const speciesData = gen9.species.get(member.species);
        if (!speciesData?.exists) return false;
        const value = applyMods(
          speciesData.baseStats[statKey],
          statKey,
          pred.mods,
        );
        return compare(value, pred.op, pred.value);
      }
      const pokemon = tryOrNull(() => buildMemberPokemon(member));
      if (!pokemon) return false;
      const value = applyMods(pokemon.stats[statKey], statKey, pred.mods);
      return compare(value, pred.op, pred.value);
    }

    case "outspeeds": {
      const threat = resolveThreatRef(pred.threat, ctx);

      const memberPokemon = tryOrNull(() => buildMemberPokemon(member));
      const threatPokemon = tryOrNull(() => buildCalcPokemon(threat));
      if (!memberPokemon || !threatPokemon) return false;

      const memberSpeed = applyMods(memberPokemon.stats.spe, "spe", pred.mods);

      const threatMods: StatModifier[] =
        threat.item === "choicescarf" ? ["scarf"] : [];
      const threatSpeed = applyMods(threatPokemon.stats.spe, "spe", threatMods);

      if (pred.underTrickRoom) {
        return pred.orSpeedTie
          ? memberSpeed <= threatSpeed
          : memberSpeed < threatSpeed;
      }
      return pred.orSpeedTie
        ? memberSpeed >= threatSpeed
        : memberSpeed > threatSpeed;
    }

    case "typeEffectiveness": {
      const vsType =
        pred.vsType === "$each"
          ? typeof ctx.each === "string"
            ? ctx.each
            : null
          : pred.vsType;
      if (vsType == null)
        throw new Error("$each used outside a coverage assertion");

      const effectiveTypes =
        pred.withTera && member.teraType
          ? [member.teraType]
          : memberTypes(member);

      if (pred.role === "defending") {
        const mult = typeEffectiveness(vsType, effectiveTypes);
        return compare(mult, pred.op, pred.value);
      }
      // attacking: member's offensive type(s) vs the vsType target
      const maxMult = Math.max(
        ...effectiveTypes.map((at) => typeEffectiveness(at, [vsType])),
      );
      return compare(maxMult, pred.op, pred.value);
    }

    case "survives": {
      const threat = resolveThreatRef(pred.threat, ctx);
      if (!threat.move) return false; // no move specified on threat — can't run calc

      const variations = resolveVariations(threat, ctx);
      // Always include the base case (no variation overlay), then each variation.
      const combos: (Variation | null)[] = [null, ...variations];

      const defender = buildMemberPokemon(member, { withTera: pred.withTera });
      const defHP = defender.stats.hp;
      const roll = pred.roll ?? "min";
      const hits = pred.hits ?? 1;

      let worstSurvives: boolean | null = null;
      let bestSurvives: boolean | null = null;

      for (const variation of combos) {
        if (
          pred.variation &&
          variation?.name &&
          variation.name !== pred.variation
        )
          continue;

        const attacker = tryOrNull(() => buildCalcPokemon(threat, variation));
        if (!attacker) continue;

        const mergedField: FieldSpec = {
          ...(threat.field ?? {}),
          ...(variation?.field ?? {}),
        };
        const field = buildCalcField(mergedField);

        const totalDmg = calcTotalDamage(
          attacker,
          defender,
          threat.move,
          field,
          roll,
          hits,
          { isCrit: threat.isCrit },
        );
        if (totalDmg == null) continue;

        const survives = totalDmg < defHP;
        if (worstSurvives === null || !survives) worstSurvives = survives;
        if (bestSurvives === null || survives) bestSurvives = survives;
      }

      if (pred.case === "worst") return worstSurvives ?? false;
      if (pred.case === "best") return bestSurvives ?? false;
      // 'specified' or default: conservative (must survive every case checked)
      return worstSurvives ?? false;
    }

    case "koes": {
      const threat = resolveThreatRef(pred.threat, ctx);

      const defender = tryOrNull(() => buildCalcPokemon(threat));
      if (!defender) return false;

      const defHP = defender.stats.hp;
      const hits = pred.hits ?? 1;
      const roll = pred.roll ?? "max";
      const attacker = buildMemberPokemon(member, { withTera: pred.withTera });
      const movesToTry = pred.move ? [pred.move] : member.moves;
      const field = buildCalcField({});

      return movesToTry.some((moveId) => {
        const dmg = calcTotalDamage(
          attacker,
          defender,
          moveId,
          field,
          roll,
          hits,
        );
        return dmg != null && dmg >= defHP;
      });
    }

    case "dealsDamage": {
      const threat = resolveThreatRef(pred.threat, ctx);

      const defender = tryOrNull(() => buildCalcPokemon(threat));
      if (!defender) return false;

      const defHP = defender.stats.hp;
      const roll = pred.roll ?? "avg";
      const attacker = buildMemberPokemon(member);
      const movesToTry = pred.move ? [pred.move] : member.moves;
      const field = buildCalcField({});

      return movesToTry.some((moveId) => {
        const dmg = calcTotalDamage(attacker, defender, moveId, field, roll);
        return (
          dmg != null &&
          compare(dmg / defHP, pred.fraction.op, pred.fraction.value)
        );
      });
    }

    case "foulPlay":
      // Reserved atom — always false until a battle-AI backend is wired up.
      return false;
  }
}
