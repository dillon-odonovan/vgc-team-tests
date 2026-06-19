/**
 * Helpers for enriching parsed team members with @pkmn/dex species data,
 * and for querying that enrichment. Centralizing this keeps `_types` /
 * `_baseStats` as an implementation detail that the rest of the evaluator
 * doesn't need to touch directly.
 */
import type { Gen9 } from "./dex.js";
import type { TeamMember } from "./types.js";

/**
 * Looks up each member's species in the dex and populates `_types` /
 * `_baseStats` in place. A member whose species isn't found (e.g. a typo)
 * gets an empty type list and no base stats rather than throwing — atom
 * evaluators then naturally treat it as "this predicate can't be satisfied"
 * instead of crashing the whole suite.
 *
 * @param team - The parsed team; mutated in place.
 * @param gen - The @pkmn/dex generation to resolve species against.
 */
export function enrichTeam(team: TeamMember[], gen: Gen9): void {
  for (const member of team) {
    const speciesData = gen.species.get(member.species);
    member._types = speciesData?.exists ? [...speciesData.types] : [];
    member._baseStats = speciesData?.exists
      ? { ...speciesData.baseStats }
      : undefined;
  }
}

/**
 * The member's types, lowercased for case-insensitive comparison (e.g.
 * `['fire', 'dark']`). Empty if the species lookup failed or the member
 * hasn't been enriched yet via {@link enrichTeam}.
 */
export function memberTypes(member: TeamMember): string[] {
  return (member._types ?? []).map((t) => t.toLowerCase());
}
