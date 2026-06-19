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
 *   { typeImmuneToMove: true } member's typing is immune to opts.moveType
 *   { weather: name }         battle weather (not checkable without state → false)
 *
 * opts:
 *   typeEffectiveness(type, memberTypes) → number
 *   moveType: string  (type to use for typeImmuneToMove checks)
 */

export function evalSource(node, member, opts = {}) {
  if (!node || typeof node !== "object") return false;

  if (node.anyOf) return node.anyOf.some((n) => evalSource(n, member, opts));
  if (node.all) return node.all.every((n) => evalSource(n, member, opts));

  if ("type" in node) {
    const mTypes = (member._types ?? []).map((t) => t.toLowerCase());
    const required = [].concat(node.type).map((t) => t.toLowerCase());
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

  if ("grounded" in node) {
    const types = (member._types ?? []).map((t) => t.toLowerCase());
    const flying = types.includes("flying");
    const levitate = member.ability === "levitate";
    const airBalloon = member.item === "airballoon";
    const isGrounded = !flying && !levitate && !airBalloon;
    return node.grounded ? isGrounded : !isGrounded;
  }

  if (node.typeImmuneToMove) {
    // Requires opts.moveType and opts.typeEffectiveness
    if (!opts.moveType || !opts.typeEffectiveness) return false;
    const mult = opts.typeEffectiveness(opts.moveType, member._types ?? []);
    return mult === 0;
  }

  if (node.weather) {
    // Cannot check weather without live battle state.
    return false;
  }

  return false;
}
