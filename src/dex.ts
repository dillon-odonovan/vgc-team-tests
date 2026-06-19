/**
 * Central place for the two data backends. Both @pkmn/dex and @smogon/calc
 * are plain CJS packages with bundled .d.ts files, so plain ESM `import`
 * works directly — no createRequire/CJS interop needed.
 *
 * Note: @smogon/calc's Generations.get() uses its own bundled species/move
 * data, independent of @pkmn/dex — it does not take a dex argument.
 */
import { Dex } from "@pkmn/dex";
import { Generations } from "@smogon/calc";

/** @pkmn/dex's gen 9 data: species/move/item/ability lookups for non-calc atoms. */
export const gen9 = Dex.forGen(9);

/** @smogon/calc's own gen 9 data: used when constructing `Pokemon`/`Move`/`Field` for damage calcs. */
export const calcGen9 = Generations.get(9);

/** The type of {@link gen9}, for typing functions that take a dex generation. */
export type Gen9 = typeof gen9;

/** The type of {@link calcGen9}. */
export type CalcGen9 = typeof calcGen9;
