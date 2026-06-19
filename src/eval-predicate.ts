/**
 * Evaluates a predicate against a single team member.
 */
import { Pokemon, Move, Field, Side, calculate } from "@smogon/calc";
import type { Result, State } from "@smogon/calc";

import { calcGen9, gen9 } from "./dex.js";
import { evalSource } from "./eval-source.js";
import { typeEffectiveness, properCase } from "./type-chart.js";
import { calcStat, applyMods } from "./stat-calc.js";
import type {
  Predicate,
  TaggedPredicate,
  EvalContext,
  TeamMember,
  ThreatSpec,
  GroupSpec,
  Variation,
  FieldSpec,
  SideSpec,
  TagEntry,
  TagsData,
  Op,
} from "./types.js";

// -----------------------------------------------------------------------------
// Calc-library branded/literal type aliases (derived from State, since the
// package doesn't re-export I.AbilityName etc. directly).
// -----------------------------------------------------------------------------
type CalcAbilityName = NonNullable<State.Pokemon["ability"]>;
type CalcItemName = NonNullable<State.Pokemon["item"]>;
type CalcNatureName = NonNullable<State.Pokemon["nature"]>;
type CalcTypeName = NonNullable<State.Pokemon["teraType"]>;
type CalcWeather = NonNullable<State.Field["weather"]>;
type CalcTerrain = NonNullable<State.Field["terrain"]>;

function compare(lhs: number, op: Op, rhs: number): boolean {
  switch (op) {
    case ">=":
      return lhs >= rhs;
    case "<=":
      return lhs <= rhs;
    case ">":
      return lhs > rhs;
    case "<":
      return lhs < rhs;
    case "==":
      return lhs === rhs;
    case "!=":
      return lhs !== rhs;
    default:
      throw new Error(`Unknown op: ${op}`);
  }
}

// Canonical type used when checking OHKO-move immunities for typeImmuneToMove.
// Fissure (Ground) is the canonical VGC OHKO move.
const MOVE_TAG_TYPES: Record<string, string> = {
  ohko: "ground",
};

// -----------------------------------------------------------------------------
// Threat / calc-Pokemon helpers
// -----------------------------------------------------------------------------

function resolveThreat(ref: string | ThreatSpec, ctx: EvalContext): ThreatSpec {
  if (typeof ref === "object") return ref; // inline
  if (ref === "$each") {
    const bound = ctx.each;
    if (bound == null)
      throw new Error("$each used outside a coverage assertion");
    return resolveThreat(bound, ctx);
  }
  const suiteThreat = ctx.suite.definitions?.threats?.[ref];
  if (suiteThreat) return suiteThreat;
  const libThreat = ctx.threatsLib.threats?.[ref];
  if (libThreat) return libThreat;
  // Fall back: treat the ref as a bare species ID with a default ("usage") spread.
  return { species: ref, set: "usage" };
}

function resolveVariations(threat: ThreatSpec, ctx: EvalContext): Variation[] {
  const variations = threat.variations ?? [];
  return variations.map((v) => {
    if (typeof v === "string") {
      return ctx.threatsLib.variations?.[v] ?? { name: v };
    }
    return v;
  });
}

function buildCalcPokemon(
  threatSpec: ThreatSpec,
  resolvedVariation?: Variation | null,
): Pokemon {
  const base: ThreatSpec = { ...threatSpec };

  if (resolvedVariation) {
    if (resolvedVariation.item) base.item = resolvedVariation.item;
    if (resolvedVariation.ability) base.ability = resolvedVariation.ability;
    if (resolvedVariation.boosts)
      base.boosts = { ...(base.boosts ?? {}), ...resolvedVariation.boosts };
    if (resolvedVariation.field)
      base.field = { ...(base.field ?? {}), ...resolvedVariation.field };
  }

  // For set:'usage' we don't have actual usage data, so 0 EVs is the default.
  const evs = base.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const ivs = base.ivs ?? {
    hp: 31,
    atk: 31,
    def: 31,
    spa: 31,
    spd: 31,
    spe: 31,
  };
  const isTera = base.tera ?? false;

  return new Pokemon(calcGen9, base.species, {
    level: base.level ?? 50,
    ability: base.ability as CalcAbilityName | undefined,
    item: base.item as CalcItemName | undefined,
    nature: properCase(base.nature ?? "hardy") as CalcNatureName,
    evs,
    ivs,
    teraType:
      isTera && base.teraType
        ? (properCase(base.teraType) as CalcTypeName)
        : undefined,
    boosts: base.boosts,
  });
}

function buildMemberPokemon(
  member: TeamMember,
  opts: { withTera?: boolean } = {},
): Pokemon {
  return new Pokemon(calcGen9, member.species, {
    level: member.level,
    ability: (member.ability ?? undefined) as CalcAbilityName | undefined,
    item: (member.item ?? undefined) as CalcItemName | undefined,
    nature: properCase(member.nature ?? "hardy") as CalcNatureName,
    evs: member.evs,
    ivs: member.ivs,
    teraType:
      opts.withTera && member.teraType
        ? (properCase(member.teraType) as CalcTypeName)
        : undefined,
  });
}

function toCalcWeather(w: FieldSpec["weather"]): CalcWeather | undefined {
  if (!w || w === "none") return undefined;
  return properCase(w) as CalcWeather;
}

function toCalcTerrain(t: FieldSpec["terrain"]): CalcTerrain | undefined {
  if (!t || t === "none") return undefined;
  return properCase(t) as CalcTerrain;
}

function toCalcSide(
  side: SideSpec | undefined,
): Partial<State.Side> | undefined {
  if (!side) return undefined;
  const out: Partial<State.Side> = {};
  if (side.tailwind != null) out.isTailwind = side.tailwind;
  if (side.reflect != null) out.isReflect = side.reflect;
  if (side.lightScreen != null) out.isLightScreen = side.lightScreen;
  if (side.auroraVeil != null) out.isAuroraVeil = side.auroraVeil;
  if (side.helpingHand != null) out.isHelpingHand = side.helpingHand;
  if (side.friendGuard != null) out.isFriendGuard = side.friendGuard;
  if (side.isProtected != null) out.isProtected = side.isProtected;
  return out;
}

function buildCalcField(merged: FieldSpec): Field {
  const opts: Partial<State.Field> = { gameType: "Doubles" };
  const weather = toCalcWeather(merged.weather);
  if (weather) opts.weather = weather;
  const terrain = toCalcTerrain(merged.terrain);
  if (terrain) opts.terrain = terrain;
  const attackerSide = toCalcSide(merged.attackerSide);
  if (attackerSide) opts.attackerSide = new Side(attackerSide);
  const defenderSide = toCalcSide(merged.defenderSide);
  if (defenderSide) opts.defenderSide = new Side(defenderSide);
  // Note: Trick Room only affects turn order, not damage math, so there's no
  // corresponding Field property — `underTrickRoom` is handled in `outspeeds`.
  return new Field(opts);
}

function getDamageRolls(damage: Result["damage"]): number[] {
  if (typeof damage === "number") return [damage];
  if (Array.isArray(damage)) {
    if (damage.length > 0 && Array.isArray(damage[0]))
      return (damage as number[][]).flat();
    return damage as number[];
  }
  return [];
}

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
      return member.item
        ? [tags.items?.[member.item]].filter((e): e is TagEntry => Boolean(e))
        : [];
    case "ability":
      return member.ability
        ? [tags.abilities?.[member.ability]].filter((e): e is TagEntry =>
            Boolean(e),
          )
        : [];
    case "species": {
      const e = tags.species?.[member.species];
      return e ? [e] : [];
    }
  }
}

export function resolveGroup(name: string, ctx: EvalContext): GroupSpec | null {
  return (
    ctx.suite.definitions?.groups?.[name] ??
    ctx.threatsLib.groups?.[name] ??
    null
  );
}

// -----------------------------------------------------------------------------
// Evaluator
// -----------------------------------------------------------------------------

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
    case "species": {
      const sp = member.species;
      if (pred.is != null) return sp === pred.is;
      if (pred.in != null) return pred.in.includes(sp);
      return false;
    }
    case "ability": {
      const ab = member.ability;
      if (pred.is != null) return ab === pred.is;
      if (pred.in != null) return ab != null && pred.in.includes(ab);
      return false;
    }
    case "nature": {
      const nat = member.nature;
      if (pred.is != null) return nat === pred.is;
      if (pred.in != null) return nat != null && pred.in.includes(nat);
      return false;
    }
    case "gender":
      return member.gender === pred.is;
    case "level":
      return compare(member.level ?? 50, pred.op, pred.value);
    case "item": {
      if (pred.present != null) {
        const has = member.item != null && member.item !== "";
        return pred.present ? has : !has;
      }
      if (pred.is != null) return member.item === pred.is;
      if (pred.in != null)
        return member.item != null && pred.in.includes(member.item);
      return false;
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
      const types = (member._types ?? []).map((t) => t.toLowerCase());
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
    case "teraType": {
      const tt = member.teraType;
      if (pred.is != null) return tt === pred.is;
      if (pred.in != null) return tt != null && pred.in.includes(tt);
      return false;
    }
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
      const speciesData = gen9.species.get(member.species);
      if (!speciesData?.exists) return false;
      const statKey = pred.stat;
      let value: number;
      if (pred.vs === "base") {
        value = speciesData.baseStats[statKey];
        value = applyMods(value, statKey, pred.mods);
      } else {
        const base = speciesData.baseStats[statKey];
        const ev = member.evs?.[statKey] ?? 0;
        const iv = member.ivs?.[statKey] ?? 31;
        const nat = member.nature ?? "hardy";
        value = calcStat(statKey, base, ev, iv, nat, member.level ?? 50);
        value = applyMods(value, statKey, pred.mods);
      }
      return compare(value, pred.op, pred.value);
    }

    case "outspeeds": {
      const threatRef = pred.threat === "$each" ? ctx.each : pred.threat;
      if (threatRef == null)
        throw new Error("$each used outside a coverage assertion");
      const threat = resolveThreat(threatRef, ctx);
      const threatSpecies = gen9.species.get(threat.species);
      if (!threatSpecies?.exists) return false;

      const mBase = gen9.species.get(member.species)?.baseStats?.spe ?? 0;
      let mSpeed = calcStat(
        "spe",
        mBase,
        member.evs?.spe ?? 0,
        member.ivs?.spe ?? 31,
        member.nature ?? "hardy",
        member.level ?? 50,
      );
      mSpeed = applyMods(mSpeed, "spe", pred.mods);

      const tBase = threatSpecies.baseStats.spe;
      const tMods: "scarf"[] = threat.item === "choicescarf" ? ["scarf"] : [];
      let tSpeed = calcStat(
        "spe",
        tBase,
        threat.evs?.spe ?? 0,
        threat.ivs?.spe ?? 31,
        threat.nature ?? "hardy",
        threat.level ?? 50,
      );
      tSpeed = applyMods(tSpeed, "spe", tMods);

      if (pred.underTrickRoom) {
        return pred.orSpeedTie ? mSpeed <= tSpeed : mSpeed < tSpeed;
      }
      return pred.orSpeedTie ? mSpeed >= tSpeed : mSpeed > tSpeed;
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

      if (pred.role === "defending") {
        const defTypes =
          pred.withTera && member.teraType
            ? [member.teraType]
            : (member._types ?? []);
        const mult = typeEffectiveness(vsType, defTypes);
        return compare(mult, pred.op, pred.value);
      }
      // attacking: member's offensive type(s) vs the vsType target
      const atkTypes =
        pred.withTera && member.teraType
          ? [member.teraType]
          : (member._types ?? []);
      const maxMult = Math.max(
        ...atkTypes.map((at) => typeEffectiveness(at, [vsType])),
      );
      return compare(maxMult, pred.op, pred.value);
    }

    case "survives": {
      const threatRef = pred.threat === "$each" ? ctx.each : pred.threat;
      if (threatRef == null)
        throw new Error("$each used outside a coverage assertion");
      const threat = resolveThreat(threatRef, ctx);
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

        let attacker: Pokemon;
        try {
          attacker = buildCalcPokemon(threat, variation);
        } catch {
          continue;
        }

        const merged: FieldSpec = {
          ...(threat.field ?? {}),
          ...(variation?.field ?? {}),
        };
        const field = buildCalcField(merged);

        let move: Move;
        try {
          move = new Move(calcGen9, threat.move, { isCrit: threat.isCrit });
        } catch {
          continue;
        }

        let result: Result;
        try {
          result = calculate(calcGen9, attacker, defender, move, field);
        } catch {
          continue;
        }

        const rolls = getDamageRolls(result.damage);
        if (!rolls.length) continue;

        let dmg: number;
        if (roll === "min") dmg = rolls[0];
        else if (roll === "max") dmg = rolls[rolls.length - 1];
        else dmg = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);

        const totalDmg = dmg * hits;
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
      const threatRef = pred.threat === "$each" ? ctx.each : pred.threat;
      if (threatRef == null)
        throw new Error("$each used outside a coverage assertion");
      const threat = resolveThreat(threatRef, ctx);

      let defender: Pokemon;
      try {
        defender = buildCalcPokemon(threat);
      } catch {
        return false;
      }

      const defHP = defender.stats.hp;
      const hits = pred.hits ?? 1;
      const roll = pred.roll ?? "max";

      const attacker = buildMemberPokemon(member, { withTera: pred.withTera });
      const movesToTry = pred.move ? [pred.move] : member.moves;
      const field = buildCalcField({});

      for (const moveId of movesToTry) {
        let move: Move;
        try {
          move = new Move(calcGen9, moveId);
        } catch {
          continue;
        }

        let result: Result;
        try {
          result = calculate(calcGen9, attacker, defender, move, field);
        } catch {
          continue;
        }

        const rolls = getDamageRolls(result.damage);
        if (!rolls.length) continue;

        const dmg = roll === "min" ? rolls[0] : rolls[rolls.length - 1];
        const totalDmg = dmg * hits;
        if (totalDmg >= defHP) return true;
      }
      return false;
    }

    case "dealsDamage": {
      const threatRef = pred.threat === "$each" ? ctx.each : pred.threat;
      if (threatRef == null)
        throw new Error("$each used outside a coverage assertion");
      const threat = resolveThreat(threatRef, ctx);

      let defender: Pokemon;
      try {
        defender = buildCalcPokemon(threat);
      } catch {
        return false;
      }

      const defHP = defender.stats.hp;
      const roll = pred.roll ?? "avg";
      const attacker = buildMemberPokemon(member);
      const movesToTry = pred.move ? [pred.move] : member.moves;
      const field = buildCalcField({});

      for (const moveId of movesToTry) {
        let move: Move;
        try {
          move = new Move(calcGen9, moveId);
        } catch {
          continue;
        }

        let result: Result;
        try {
          result = calculate(calcGen9, attacker, defender, move, field);
        } catch {
          continue;
        }

        const rolls = getDamageRolls(result.damage);
        if (!rolls.length) continue;

        let dmg: number;
        if (roll === "min") dmg = rolls[0];
        else if (roll === "max") dmg = rolls[rolls.length - 1];
        else dmg = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);

        const fraction = dmg / defHP;
        if (compare(fraction, pred.fraction.op, pred.fraction.value))
          return true;
      }
      return false;
    }

    case "foulPlay":
      // Reserved atom — always false until a battle-AI backend is wired up.
      return false;
  }
}
