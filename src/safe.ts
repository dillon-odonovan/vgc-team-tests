/**
 * A single "construct/evaluate this, and treat a thrown error as absence"
 * pattern recurs throughout the evaluator: building a calc `Pokemon`/`Move`
 * for a possibly-invalid species/move id, running a damage calc, evaluating
 * a predicate that references an unresolved `$each`. Centralizing it here
 * keeps that fallback behavior consistent and the call sites terse.
 */

/**
 * Calls `fn`, returning its result, or `null` if it throws.
 *
 * @example
 * const pokemon = tryOrNull(() => buildCalcPokemon(threat));
 * if (!pokemon) return false; // unknown species, etc.
 */
export function tryOrNull<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
