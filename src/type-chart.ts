/**
 * Type effectiveness, backed by @smogon/calc's own Gen 9 type data rather
 * than a hand-maintained chart. `calcGen9.types.get(id)` expects a lowercase
 * canonical id (matching our Showdown-id convention) and returns a `Type`
 * whose `.effectiveness` map is keyed by the capitalized `TypeName` literal
 * the library uses everywhere else — hence `properCase` on the defender side.
 */
import { calcGen9 } from "./dex.js";

/**
 * Capitalizes a single-word id for interop with @smogon/calc's literal-cased
 * names, e.g. `'ground'` -> `'Ground'`, `'adamant'` -> `'Adamant'`. Our own
 * data uses lowercase Showdown ids throughout; this is only needed at that
 * one boundary.
 */
export function properCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Returns the type effectiveness multiplier for `attackType` hitting a
 * (possibly dual-typed) defender. Case-insensitive; multiplies across all
 * of `defenderTypes` (e.g. `4` for a 2x/2x weakness, `0` if any type is
 * immune). An unrecognized `attackType` is treated as neutral (`1`).
 */
// calcGen9.types.get() takes a branded `ID`, which the package doesn't
// export by name; derive it structurally from the (public) method
// signature instead of reaching into internal modules.
type CalcTypeId = Parameters<typeof calcGen9.types.get>[0];

export function typeEffectiveness(
  attackType: string,
  defenderTypes: string[],
): number {
  const atk = calcGen9.types.get(attackType.toLowerCase() as CalcTypeId);
  if (!atk) return 1;
  // `.effectiveness` is keyed by the branded `TypeName` literal union, which
  // is a plain capitalized string at runtime — index with that cast rather
  // than importing the internal `TypeName` type.
  const effectiveness = atk.effectiveness as Record<string, number | undefined>;
  let mult = 1;
  for (const dt of defenderTypes) {
    mult *= effectiveness[properCase(dt)] ?? 1;
  }
  return mult;
}
