/**
 * Builds @smogon/calc `Pokemon` / `Field` objects from our domain types, and
 * runs/interprets damage calculations. This is the only module that talks
 * to @smogon/calc directly — atom evaluators go through
 * {@link calcTotalDamage} rather than constructing `Move`/`Field` themselves.
 */
import { Field, Move, Pokemon, Side, calculate } from "@smogon/calc";
import type { Result, State } from "@smogon/calc";

import { calcGen9 } from "./dex.js";
import { tryOrNull } from "./safe.js";
import { maxIvs, zeroEvs } from "./stat-calc.js";
import { properCase } from "./type-chart.js";
import type {
  EvSpread,
  FieldSpec,
  SideSpec,
  TeamMember,
  ThreatSpec,
  Variation,
} from "./types.js";

// Calc-library branded/literal type aliases (derived from State, since the
// package doesn't re-export I.AbilityName etc. directly).
type CalcAbilityName = NonNullable<State.Pokemon["ability"]>;
type CalcItemName = NonNullable<State.Pokemon["item"]>;
type CalcNatureName = NonNullable<State.Pokemon["nature"]>;
type CalcTypeName = NonNullable<State.Pokemon["teraType"]>;
type CalcWeather = NonNullable<State.Field["weather"]>;
type CalcTerrain = NonNullable<State.Field["terrain"]>;

/** Roll selection for a damage calculation. */
export type DamageRoll = "min" | "max" | "avg";

interface CalcPokemonInputs {
  level?: number;
  ability?: string | null;
  item?: string | null;
  nature?: string | null;
  evs: EvSpread;
  ivs: EvSpread;
  /** Only applied if `isTera` is true — a known teraType with Tera inactive shouldn't affect the calc. */
  teraType?: string | null;
  isTera: boolean;
}

/**
 * Maps our generic spread/ability/item/nature/teraType fields onto
 * @smogon/calc's `Pokemon` constructor options, applying the branded-type
 * casts and `properCase` conversions that interop boundary needs. Shared by
 * {@link buildCalcPokemon} and {@link buildMemberPokemon}, which differ only
 * in where these fields come from (a threat vs. a team member) and how
 * EVs/IVs/Tera-activation default.
 */
function toCalcPokemonOptions(input: CalcPokemonInputs) {
  return {
    level: input.level ?? 50,
    ability: (input.ability ?? undefined) as CalcAbilityName | undefined,
    item: (input.item ?? undefined) as CalcItemName | undefined,
    nature: properCase(input.nature ?? "hardy") as CalcNatureName,
    evs: input.evs,
    ivs: input.ivs,
    teraType:
      input.isTera && input.teraType
        ? (properCase(input.teraType) as CalcTypeName)
        : undefined,
  };
}

/**
 * Builds a @smogon/calc `Pokemon` for a {@link ThreatSpec}, optionally
 * overlaid with a board-state {@link Variation} (e.g. "after Intimidate").
 *
 * `set: 'usage'` threats with no explicit EVs/IVs fall back to 0 EVs / 31
 * IVs — there's no live usage-stats resolver yet (see the design doc's
 * "Open risk for the runner" note), so these results are only as accurate
 * as the spread the suite author provides.
 */
export function buildCalcPokemon(
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

  return new Pokemon(calcGen9, base.species, {
    ...toCalcPokemonOptions({
      level: base.level,
      ability: base.ability,
      item: base.item,
      nature: base.nature,
      evs: base.evs ?? zeroEvs(),
      ivs: base.ivs ?? maxIvs(),
      teraType: base.teraType,
      isTera: base.tera ?? false,
    }),
    boosts: base.boosts,
  });
}

/**
 * Builds a @smogon/calc `Pokemon` for a team member.
 *
 * @param opts.withTera - If true, the member's Tera type is set as active
 *   (affecting STAB/defensive typing in the calc); otherwise Tera is ignored.
 */
export function buildMemberPokemon(
  member: TeamMember,
  opts: { withTera?: boolean } = {},
): Pokemon {
  return new Pokemon(
    calcGen9,
    member.species,
    toCalcPokemonOptions({
      level: member.level,
      ability: member.ability,
      item: member.item,
      nature: member.nature,
      evs: member.evs,
      ivs: member.ivs,
      teraType: member.teraType,
      isTera: Boolean(opts.withTera),
    }),
  );
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

/**
 * Builds a @smogon/calc `Field` (always doubles) from our `FieldSpec`,
 * translating the schema's lowercase weather/terrain/side-condition names
 * into the calc library's capitalized / `is`-prefixed equivalents.
 *
 * Trick Room is intentionally not modeled here — it only affects turn
 * order, not damage math, so it has no `Field` property. The `outspeeds`
 * atom's `underTrickRoom` flag handles that case directly.
 */
export function buildCalcField(merged: FieldSpec): Field {
  const opts: Partial<State.Field> = { gameType: "Doubles" };
  const weather = toCalcWeather(merged.weather);
  if (weather) opts.weather = weather;
  const terrain = toCalcTerrain(merged.terrain);
  if (terrain) opts.terrain = terrain;
  const attackerSide = toCalcSide(merged.attackerSide);
  if (attackerSide) opts.attackerSide = new Side(attackerSide);
  const defenderSide = toCalcSide(merged.defenderSide);
  if (defenderSide) opts.defenderSide = new Side(defenderSide);
  return new Field(opts);
}

/** Flattens a calc `Result.damage` (which may be a number, array, or nested array for multi-hit moves) into a roll list. */
function getDamageRolls(damage: Result["damage"]): number[] {
  if (typeof damage === "number") return [damage];
  if (Array.isArray(damage)) {
    if (damage.length > 0 && Array.isArray(damage[0]))
      return (damage as number[][]).flat();
    return damage as number[];
  }
  return [];
}

/** Picks a single damage value from a result's roll distribution. */
function pickRoll(rolls: number[], roll: DamageRoll): number {
  if (roll === "min") return rolls[0];
  if (roll === "max") return rolls[rolls.length - 1];
  return Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);
}

/**
 * Runs a single damage calculation and returns the total damage across
 * `hits` hits, using the requested roll. Returns `null` if the move name is
 * invalid or the calc itself throws — callers treat that as "this combo
 * doesn't apply" rather than a hard failure, so a single bad move/threat
 * doesn't abort the whole evaluation.
 *
 * @param roll - Which damage roll to use: the guaranteed minimum, the
 *   worst-case maximum, or the average of all 16 rolls.
 * @param hits - Number of hits to multiply the single-hit damage by (e.g.
 *   2 for a 2HKO check). Defaults to 1.
 * @param moveOpts - Extra move options, e.g. `{isCrit: true}`.
 * @returns The total damage, or `null` if the calc couldn't be run.
 */
export function calcTotalDamage(
  attacker: Pokemon,
  defender: Pokemon,
  moveId: string,
  field: Field,
  roll: DamageRoll,
  hits = 1,
  moveOpts?: { isCrit?: boolean },
): number | null {
  const move = tryOrNull(() => new Move(calcGen9, moveId, moveOpts));
  if (!move) return null;

  const result = tryOrNull(() =>
    calculate(calcGen9, attacker, defender, move, field),
  );
  if (!result) return null;

  const rolls = getDamageRolls(result.damage);
  if (!rolls.length) return null;
  return pickRoll(rolls, roll) * hits;
}
