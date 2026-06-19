/**
 * Domain-specific stat math that @smogon/calc doesn't provide: named stat
 * modifiers (scarf/tailwind/paralysis/etc.) and EV/IV default spreads.
 *
 * The level-50 EV/IV/nature stat formula itself is *not* reimplemented here
 * — @smogon/calc's `Pokemon.stats` already computes it, so the `stat` and
 * `outspeeds` atoms in eval-predicate.ts build a `Pokemon` and read its
 * `.stats` rather than going through a hand-rolled formula.
 */
import type { EvSpread, StatKey, StatModifier } from "./types.js";

interface StatMod {
  stat: StatKey;
  mult: number;
}

// Multipliers applied on top of a Pokemon's computed stat value.
const MODS: Record<StatModifier, StatMod> = {
  scarf: { stat: "spe", mult: 1.5 },
  tailwind: { stat: "spe", mult: 2 },
  paralysis: { stat: "spe", mult: 0.5 },
  swift_swim: { stat: "spe", mult: 2 },
  chlorophyll: { stat: "spe", mult: 2 },
  sand_rush: { stat: "spe", mult: 2 },
  slush_rush: { stat: "spe", mult: 2 },
  surge_surfer: { stat: "spe", mult: 2 },
  unburden: { stat: "spe", mult: 2 },
  quark_drive_spe: { stat: "spe", mult: 1.5 },
  protosynthesis_spe: { stat: "spe", mult: 1.5 },
  choice_band: { stat: "atk", mult: 1.5 },
  choice_specs: { stat: "spa", mult: 1.5 },
  iron_ball: { stat: "spe", mult: 0.5 },
  grass_pelt: { stat: "def", mult: 1.5 },
};

/**
 * Applies any `mods` whose target stat matches `stat` as successive
 * multipliers (each rounded down), e.g. Choice Scarf's `×1.5` on Speed.
 * Mods targeting a different stat are ignored.
 */
export function applyMods(
  value: number,
  stat: StatKey,
  mods: StatModifier[] | undefined,
): number {
  let v = value;
  for (const mod of mods ?? []) {
    const def = MODS[mod];
    if (def?.stat === stat) v = Math.floor(v * def.mult);
  }
  return v;
}

/** A fresh all-zero EV spread (the `set: 'usage'` fallback when no spread is given). */
export function zeroEvs(): Required<EvSpread> {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

/** A fresh all-31 IV spread (the default for both parsed teams and `set: 'usage'` threats). */
export function maxIvs(): Required<EvSpread> {
  return { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
}
