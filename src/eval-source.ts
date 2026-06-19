/**
 * Evaluates the source-predicate grammar used in data/interactions.json.
 *
 * Node shapes:
 *   { anyOf: [...] }          OR
 *   { all: [...] }            AND
 *   { type: str | str[] }     member has (any of) these types
 *   { ability: [ids] }        member's ability is in list
 *   { item: [ids] }           member holds one of these items
 *   { move: [ids] }           member knows one of these moves
 *   { grounded: true }        member is grounded
 *   { typeImmuneToMove: true } member's typing is immune to any of opts.moveTypes
 *   { weather: name }         battle weather (not checkable without state → false)
 */
import { memberTypes } from "./team-member.js";
import type { SourceNode, TeamMember } from "./types.js";

/** Options threaded through {@link evalSource} for the `typeImmuneToMove` node. */
export interface EvalSourceOpts {
  /** Type-effectiveness function, injected to avoid a hard dependency on type-chart.ts. */
  typeEffectiveness?: (type: string, defenderTypes: string[]) => number;
  /**
   * The attack type(s) that can trigger this moveTag, e.g. `['ground',
   * 'normal', 'ice']` for `ohko` (Fissure, Horn Drill/Guillotine, Sheer
   * Cold respectively — a single moveTag can map to several real moves of
   * different types). The member is immune if its typing blocks ANY one of
   * these types — it doesn't need to be immune to all of them.
   */
  moveTypes?: string[];
}

/**
 * Evaluates one node of the `data/interactions.json` source-predicate
 * grammar against a team member. Used by the `immuneTo` and `canRemove`
 * atoms, which look up a named effect/hazard in the reference data and
 * pass its source node here.
 *
 * @param node - The source node (see the module doc comment for shapes).
 *   `undefined` (an unknown effect/hazard name) evaluates to `false`.
 * @param member - The team member to test.
 * @param opts - Extra context needed only by the `typeImmuneToMove` node.
 */
export function evalSource(
  node: SourceNode | undefined,
  member: TeamMember,
  opts: EvalSourceOpts = {},
): boolean {
  if (!node || typeof node !== "object") return false;

  if (node.anyOf) return node.anyOf.some((n) => evalSource(n, member, opts));
  if (node.all) return node.all.every((n) => evalSource(n, member, opts));

  if (node.type != null) {
    const mTypes = memberTypes(member);
    const required = ([] as string[])
      .concat(node.type)
      .map((t) => t.toLowerCase());
    return required.some((t) => mTypes.includes(t));
  }

  if (node.ability) {
    return member.ability != null && node.ability.includes(member.ability);
  }

  if (node.item) {
    return member.item != null && node.item.includes(member.item);
  }

  if (node.move) {
    const moves = member.moves ?? [];
    return node.move.some((m) => moves.includes(m));
  }

  if (node.grounded != null) {
    const types = memberTypes(member);
    const flying = types.includes("flying");
    const levitate = member.ability === "levitate";
    const airBalloon = member.item === "airballoon";
    const isGrounded = !flying && !levitate && !airBalloon;
    return node.grounded ? isGrounded : !isGrounded;
  }

  if (node.typeImmuneToMove) {
    if (!opts.moveTypes?.length || !opts.typeEffectiveness) return false;
    return opts.moveTypes.some(
      (moveType) =>
        opts.typeEffectiveness!(moveType, member._types ?? []) === 0,
    );
  }

  if (node.weather) {
    // Cannot check weather without live battle state.
    return false;
  }

  return false;
}
