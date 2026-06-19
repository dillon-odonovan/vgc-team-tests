/**
 * Resolves threat / group / variation references used by the calc-backed
 * atoms (`survives`, `koes`, `dealsDamage`, `outspeeds`) and by `coverage`
 * assertions. A reference is looked up first in the suite's own
 * `definitions`, then in the shared `data/threats.json` library.
 */
import type { EvalContext, GroupSpec, ThreatSpec, Variation } from "./types.js";

/**
 * Looks up `name` in the suite's own definitions first, falling back to the
 * shared threats library — the precedence rule every named reference
 * (threats, groups) in a suite follows.
 */
function lookupDefinition<T>(
  name: string,
  suiteMap: Record<string, T> | undefined,
  libMap: Record<string, T> | undefined,
): T | undefined {
  return suiteMap?.[name] ?? libMap?.[name];
}

/**
 * Resolves a threat reference to its full spec.
 *
 * `ref` may be an inline {@link ThreatSpec} object, the literal `'$each'`
 * (bound to the current coverage element via `ctx.each`), or a name looked
 * up in the suite's `definitions.threats` and then the shared threats
 * library. An unresolvable name falls back to `{species: ref, set: 'usage'}`
 * so suites can reference a species directly without a named definition.
 *
 * @throws If `ref` is `'$each'` outside of a coverage assertion.
 */
export function resolveThreat(
  ref: string | ThreatSpec,
  ctx: EvalContext,
): ThreatSpec {
  if (typeof ref === "object") return ref; // inline
  if (ref === "$each") {
    const bound = ctx.each;
    if (bound == null)
      throw new Error("$each used outside a coverage assertion");
    return resolveThreat(bound, ctx);
  }
  const found = lookupDefinition(
    ref,
    ctx.suite.definitions?.threats,
    ctx.threatsLib.threats,
  );
  // Fall back: treat the ref as a bare species ID with a default ("usage") spread.
  return found ?? { species: ref, set: "usage" };
}

/**
 * Resolves an atom's `threat` field (which may be the literal `'$each'`) to
 * a full {@link ThreatSpec}. Calc-backed atoms call this instead of
 * {@link resolveThreat} directly since it also performs the `$each`
 * substitution from `ctx.each`.
 *
 * @throws If `threatField` is `'$each'` outside of a coverage assertion.
 */
export function resolveThreatRef(
  threatField: string,
  ctx: EvalContext,
): ThreatSpec {
  const ref = threatField === "$each" ? ctx.each : threatField;
  if (ref == null) throw new Error("$each used outside a coverage assertion");
  return resolveThreat(ref, ctx);
}

/**
 * Expands a threat's `variations` (names or inline override bundles) into
 * full {@link Variation} objects, resolving named ones against the shared
 * threats library's `variations` map.
 */
export function resolveVariations(
  threat: ThreatSpec,
  ctx: EvalContext,
): Variation[] {
  const variations = threat.variations ?? [];
  return variations.map((v) => {
    if (typeof v === "string")
      return ctx.threatsLib.variations?.[v] ?? { name: v };
    return v;
  });
}

/**
 * Resolves a group reference (used by the `inGroup` atom and `coverage`
 * assertions) by name, checking the suite's own `definitions.groups` before
 * the shared threats library.
 *
 * @returns The group spec, or `null` if no group with that name exists.
 */
export function resolveGroup(name: string, ctx: EvalContext): GroupSpec | null {
  return (
    lookupDefinition(
      name,
      ctx.suite.definitions?.groups,
      ctx.threatsLib.groups,
    ) ?? null
  );
}
