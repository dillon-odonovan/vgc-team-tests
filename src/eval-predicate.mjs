/**
 * Evaluates a predicate against a single team member.
 *
 * ctx shape:
 *   suite          – the full suite object (for definitions.*)
 *   tags           – data/tags.json parsed
 *   interactions   – data/interactions.json parsed
 *   gen            – @pkmn/dex gen9 instance
 *   calcTools      – { Generations, Pokemon, Move, Field, calculate } from @smogon/calc
 *   calcGen        – @smogon/calc gen9 (Generations.get(9, Dex))
 *   each           – current $each binding (string; null outside coverage)
 *
 * Returns boolean. Throws on unknown kind.
 */

import {evalSource} from './eval-source.mjs';
import {typeEffectiveness} from './type-chart.mjs';
import {calcStat, applyMods, natureModifier} from './stat-calc.mjs';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function compare(lhs, op, rhs) {
  switch (op) {
    case '>=': return lhs >= rhs;
    case '<=': return lhs <= rhs;
    case '>':  return lhs > rhs;
    case '<':  return lhs < rhs;
    case '==': return lhs === rhs;
    case '!=': return lhs !== rhs;
    default: throw new Error(`Unknown op: ${op}`);
  }
}

// Canonical type used when checking OHKO-move immunities for typeImmuneToMove.
// Fissure (Ground) is the canonical VGC OHKO move.
const MOVE_TAG_TYPES = {
  ohko: 'ground',
};

// Resolve a threat name or inline threat spec to a threat object.
function resolveThreat(ref, ctx) {
  if (typeof ref === 'object') return ref;  // inline
  if (ref === '$each') {
    // $each is either a threat-name string or a species ID used as a target
    const bound = ctx.each;
    if (!bound) throw new Error('$each used outside a coverage assertion');
    // Try as a named threat first
    return resolveThreat(bound, ctx);
  }
  // Check suite definitions
  const suiteThreat = ctx.suite.definitions?.threats?.[ref];
  if (suiteThreat) return suiteThreat;
  // Check shared library
  const libThreat = ctx.threatsLib?.threats?.[ref];
  if (libThreat) return libThreat;
  // Fall back: treat the ref as a bare species ID
  return {species: ref, set: 'usage'};
}

// Build @smogon/calc Pokemon args from a threat spec.
function buildCalcPokemon(threatSpec, ctx, resolvedVariation = null) {
  const {calcGen, calcTools} = ctx;
  const {Pokemon} = calcTools;

  const base = {...threatSpec};

  // Merge variation
  if (resolvedVariation) {
    if (resolvedVariation.item)    base.item    = resolvedVariation.item;
    if (resolvedVariation.ability) base.ability = resolvedVariation.ability;
    if (resolvedVariation.boosts)  base.boosts  = {...(base.boosts ?? {}), ...resolvedVariation.boosts};
    if (resolvedVariation.field)   base.field   = resolvedVariation.field; // handled at Field level
  }

  // For set:'usage' we don't have actual usage data, so use 0 EVs as default.
  const evs = base.evs ?? {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  const ivs = base.ivs ?? {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};

  return new Pokemon(calcGen, base.species, {
    level:    base.level  ?? 50,
    ability:  base.ability,
    item:     base.item,
    nature:   base.nature ?? 'Hardy',
    evs,
    ivs,
    teraType: base.teraType,
    tera:     base.tera   ?? false,
    boosts:   base.boosts,
    curHP:    undefined,
  });
}

// Build @smogon/calc Pokemon from a team member.
function buildMemberPokemon(member, ctx, opts = {}) {
  const {calcGen, calcTools} = ctx;
  const {Pokemon} = calcTools;
  return new Pokemon(calcGen, member.species, {
    level:    member.level ?? 50,
    ability:  member.ability,
    item:     member.item,
    nature:   member.nature ?? 'Hardy',
    evs:      member.evs,
    ivs:      member.ivs,
    teraType: opts.withTera ? member.teraType : undefined,
    tera:     opts.withTera ? true : false,
  });
}

// Find threat variations, resolving named ones from the shared library.
function resolveVariations(threat, ctx) {
  const variations = threat.variations ?? [];
  return variations.map(v => {
    if (typeof v === 'string') {
      return ctx.threatsLib?.variations?.[v] ?? {name: v};
    }
    return v;
  });
}

// Run a @smogon/calc damage result and get damage rolls array.
function getDamageRolls(result) {
  const d = result.damage;
  return Array.isArray(d) ? d : [d];
}

// Tags lookup: returns the entity's entry in tags.json for a given category.
function getTagEntry(member, of, tags) {
  switch (of) {
    case 'move':    return member.moves.map(id => tags.moves?.[id]).filter(Boolean);
    case 'item':    return member.item   ? [tags.items?.[member.item]].filter(Boolean) : [];
    case 'ability': return member.ability ? [tags.abilities?.[member.ability]].filter(Boolean) : [];
    case 'species': return [tags.species?.[member.species]].filter(Boolean);
    default: return [];
  }
}

// -----------------------------------------------------------------------------
// Evaluator
// -----------------------------------------------------------------------------

export function evalPredicate(pred, member, ctx) {
  switch (pred.kind) {
    // Composites
    case 'all':
      return pred.of.every(p => evalPredicate(p, member, ctx));
    case 'any':
      return pred.of.some(p => evalPredicate(p, member, ctx));
    case 'not':
      return !evalPredicate(pred.of, member, ctx);
    case 'atLeastK': {
      let k = 0;
      for (const p of pred.of) if (evalPredicate(p, member, ctx)) k++;
      return k >= pred.k;
    }
    case 'ref': {
      const def = ctx.suite.definitions?.predicates?.[pred.predicate];
      if (!def) throw new Error(`Unknown predicate ref: ${pred.predicate}`);
      return evalPredicate(def, member, ctx);
    }

    // Identity atoms
    case 'species': {
      const sp = member.species;
      if (pred.is  != null) return sp === pred.is;
      if (pred.in  != null) return pred.in.includes(sp);
      return false;
    }
    case 'ability': {
      const ab = member.ability;
      if (pred.is != null) return ab === pred.is;
      if (pred.in != null) return pred.in.includes(ab);
      return false;
    }
    case 'nature': {
      const nat = member.nature;
      if (pred.is != null) return nat === pred.is;
      if (pred.in != null) return pred.in.includes(nat);
      return false;
    }
    case 'gender':
      return member.gender === pred.is;
    case 'level':
      return compare(member.level ?? 50, pred.op, pred.value);
    case 'item': {
      if (pred.present != null) {
        const has = member.item != null && member.item !== '';
        return pred.present ? has : !has;
      }
      if (pred.is != null) return member.item === pred.is;
      if (pred.in != null) return pred.in.includes(member.item);
      return false;
    }
    case 'move': {
      const moves = member.moves ?? [];
      if (pred.has    != null) return moves.includes(pred.has);
      if (pred.hasAny != null) return pred.hasAny.some(m => moves.includes(m));
      if (pred.hasAll != null) return pred.hasAll.every(m => moves.includes(m));
      return false;
    }
    case 'type': {
      const types = (member._types ?? []).map(t => t.toLowerCase());
      if (pred.has      != null) return types.includes(pred.has.toLowerCase());
      if (pred.hasAny   != null) return pred.hasAny.some(t => types.includes(t.toLowerCase()));
      if (pred.isExactly != null) {
        const a = [...pred.isExactly.map(t => t.toLowerCase())].sort();
        const b = [...types].sort();
        return a.join(',') === b.join(',');
      }
      return false;
    }
    case 'teraType': {
      const tt = member.teraType;
      if (pred.is != null) return tt === pred.is;
      if (pred.in != null) return pred.in.includes(tt);
      return false;
    }
    case 'inGroup': {
      const group = resolveGroup(pred.group, ctx);
      if (!group) throw new Error(`Unknown group: ${pred.group}`);
      if (group.kind === 'species') {
        return (group.members ?? []).includes(member.species);
      }
      return false; // non-species groups are for coverage assertions, not inGroup atom
    }

    // Taxonomy atoms
    case 'tagged': {
      const entries = getTagEntry(member, pred.of, ctx.tags);
      for (const entry of entries) {
        if (!entry.tags?.includes(pred.tag)) continue;
        if (pred.facet != null) {
          if (pred.equals != null) {
            if (entry[pred.facet] === pred.equals) return true;
          } else {
            if (entry[pred.facet] != null) return true;
          }
        } else {
          return true;
        }
      }
      return false;
    }
    case 'immuneTo': {
      const {interactions} = ctx;
      if (pred.effect != null) {
        const src = interactions.immunities?.[pred.effect];
        if (!src) return false;
        return evalSource(src, member, {typeEffectiveness});
      }
      if (pred.moveTag != null) {
        const src = interactions.moveTagImmunities?.[pred.moveTag];
        if (!src) return false;
        const moveType = MOVE_TAG_TYPES[pred.moveTag] ?? null;
        return evalSource(src, member, {typeEffectiveness, moveType});
      }
      return false;
    }
    case 'canRemove': {
      const src = ctx.interactions.hazardRemoval?.[pred.hazard];
      if (!src) return false;
      return evalSource(src, member, {typeEffectiveness});
    }

    // Computed atoms
    case 'stat': {
      const speciesData = ctx.gen.species.get(member.species);
      if (!speciesData?.exists) return false;
      const statKey = pred.stat;
      let value;
      if (pred.vs === 'base') {
        value = speciesData.baseStats[statKey];
        value = applyMods(value, statKey, pred.mods);
      } else {
        // final (default)
        const base = speciesData.baseStats[statKey];
        const ev   = member.evs?.[statKey] ?? 0;
        const iv   = member.ivs?.[statKey] ?? 31;
        const nat  = member.nature ?? 'hardy';
        value = calcStat(statKey, base, ev, iv, nat, member.level ?? 50);
        value = applyMods(value, statKey, pred.mods);
      }
      return compare(value, pred.op, pred.value);
    }

    case 'outspeeds': {
      const threatRef = pred.threat === '$each' ? ctx.each : pred.threat;
      const threat = resolveThreat(threatRef, ctx);
      const threatSpecies = ctx.gen.species.get(threat.species);
      if (!threatSpecies?.exists) return false;

      // Member effective speed
      const mBase = ctx.gen.species.get(member.species)?.baseStats?.spe ?? 0;
      let mSpeed = calcStat('spe', mBase, member.evs?.spe ?? 0, member.ivs?.spe ?? 31, member.nature ?? 'hardy', member.level ?? 50);
      mSpeed = applyMods(mSpeed, 'spe', pred.mods);

      // Threat effective speed
      const tBase = threatSpecies.baseStats.spe;
      const tMods = [];
      if (threat.item === 'choicescarf') tMods.push('scarf');
      let tSpeed = calcStat('spe', tBase, threat.evs?.spe ?? 0, threat.ivs?.spe ?? 31, threat.nature ?? 'hardy', threat.level ?? 50);
      tSpeed = applyMods(tSpeed, 'spe', tMods);

      if (pred.underTrickRoom) {
        // Under TR, slower Pokémon move first; we're checking if member is "slower" (wins under TR)
        return pred.orSpeedTie ? mSpeed <= tSpeed : mSpeed < tSpeed;
      }
      return pred.orSpeedTie ? mSpeed >= tSpeed : mSpeed > tSpeed;
    }

    case 'typeEffectiveness': {
      const vsType = pred.vsType === '$each' ? ctx.each : pred.vsType;
      if (pred.role === 'defending') {
        const defTypes = pred.withTera && member.teraType
          ? [member.teraType]
          : (member._types ?? []);
        const mult = typeEffectiveness(vsType, defTypes);
        return compare(mult, pred.op, pred.value);
      }
      if (pred.role === 'attacking') {
        // Member's type effectiveness against the vsType target
        // vsType here is the defender's type
        const atkTypes = pred.withTera && member.teraType
          ? [member.teraType]
          : (member._types ?? []);
        const maxMult = Math.max(...atkTypes.map(at => typeEffectiveness(at, [vsType])));
        return compare(maxMult, pred.op, pred.value);
      }
      return false;
    }

    case 'survives': {
      if (!ctx.calcTools) return false;
      const {calculate, Move: CalcMove, Field} = ctx.calcTools;

      const threatRef = pred.threat === '$each' ? ctx.each : pred.threat;
      const threat = resolveThreat(threatRef, ctx);
      if (!threat?.move) return false; // no move specified on threat — can't run calc

      const variations = resolveVariations(threat, ctx);
      // Always include the base case (null = no variation overlay), then each variation.
      const combos = [null, ...variations];

      const defender = buildMemberPokemon(member, ctx, {withTera: pred.withTera});
      const defHP = defender.stats.hp;

      const roll = pred.roll ?? 'min';
      const hits = pred.hits ?? 1;

      let worstSurvives = null;
      let bestSurvives = null;

      for (const variation of combos) {
        if (pred.variation && variation?.name && variation.name !== pred.variation) continue;

        let attacker;
        try {
          attacker = buildCalcPokemon(threat, ctx, variation);
        } catch { continue; }

        let fieldOpts = {gameType: 'Doubles'};
        const varField = variation?.field ?? {};
        const threatField = threat.field ?? {};
        const merged = {...threatField, ...varField};
        if (merged.weather)       fieldOpts.weather = merged.weather;
        if (merged.terrain)       fieldOpts.terrain = merged.terrain;
        if (merged.trickRoom)     fieldOpts.isGravity = false; // trickRoom via field
        if (merged.attackerSide)  fieldOpts.attackerSide = new ctx.calcTools.Side(merged.attackerSide);
        if (merged.defenderSide)  fieldOpts.defenderSide = new ctx.calcTools.Side(merged.defenderSide);

        let move;
        try {
          move = new CalcMove(ctx.calcGen, threat.move, {isCrit: threat.isCrit});
        } catch { continue; }

        let result;
        try {
          result = calculate(ctx.calcGen, attacker, defender, move, new Field(fieldOpts));
        } catch { continue; }

        const rolls = getDamageRolls(result);
        if (!rolls.length) continue;

        // Choose which roll to use
        let dmg;
        if (roll === 'min') dmg = rolls[0];
        else if (roll === 'max') dmg = rolls[rolls.length - 1];
        else dmg = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);

        // Total damage over 'hits' hits
        const totalDmg = dmg * hits;
        const survives = totalDmg < defHP;

        if (worstSurvives === null || !survives) worstSurvives = survives;
        if (bestSurvives  === null || survives)  bestSurvives  = survives;
      }

      if (pred.case === 'worst') return worstSurvives ?? false;
      if (pred.case === 'best')  return bestSurvives  ?? false;
      // 'specified' or default: check all, require all to survive
      return worstSurvives ?? false;
    }

    case 'koes': {
      if (!ctx.calcTools) return false;
      const {calculate, Move: CalcMove, Field} = ctx.calcTools;

      const threatRef = pred.threat === '$each' ? ctx.each : pred.threat;
      const threat = resolveThreat(threatRef, ctx);

      let defender;
      try {
        defender = buildCalcPokemon(threat, ctx);
      } catch { return false; }

      const defHP = defender.stats.hp;
      const hits  = pred.hits ?? 1;
      const roll  = pred.roll ?? 'max';

      const attacker = buildMemberPokemon(member, ctx, {withTera: pred.withTera});

      // Try each of the member's moves (or the specified move)
      const movesToTry = pred.move
        ? [pred.move]
        : member.moves;

      for (const moveId of movesToTry) {
        let move;
        try {
          move = new CalcMove(ctx.calcGen, moveId);
        } catch { continue; }

        let result;
        try {
          result = calculate(ctx.calcGen, attacker, defender, move, new Field({gameType: 'Doubles'}));
        } catch { continue; }

        const rolls = getDamageRolls(result);
        if (!rolls.length) continue;

        let dmg;
        if (roll === 'min') dmg = rolls[0];
        else dmg = rolls[rolls.length - 1];

        const totalDmg = dmg * hits;
        if (totalDmg >= defHP) return true;
      }
      return false;
    }

    case 'dealsDamage': {
      if (!ctx.calcTools) return false;
      const {calculate, Move: CalcMove, Field} = ctx.calcTools;

      const threatRef = pred.threat === '$each' ? ctx.each : pred.threat;
      const threat = resolveThreat(threatRef, ctx);

      let defender;
      try {
        defender = buildCalcPokemon(threat, ctx);
      } catch { return false; }

      const defHP  = defender.stats.hp;
      const roll   = pred.roll ?? 'avg';
      const attacker = buildMemberPokemon(member, ctx);

      const movesToTry = pred.move ? [pred.move] : member.moves;

      for (const moveId of movesToTry) {
        let move;
        try {
          move = new CalcMove(ctx.calcGen, moveId);
        } catch { continue; }

        let result;
        try {
          result = calculate(ctx.calcGen, attacker, defender, move, new Field({gameType: 'Doubles'}));
        } catch { continue; }

        const rolls = getDamageRolls(result);
        if (!rolls.length) continue;

        let dmg;
        if (roll === 'min') dmg = rolls[0];
        else if (roll === 'max') dmg = rolls[rolls.length - 1];
        else dmg = Math.round(rolls.reduce((a, b) => a + b, 0) / rolls.length);

        const fraction = dmg / defHP;
        if (compare(fraction, pred.fraction.op, pred.fraction.value)) return true;
      }
      return false;
    }

    case 'foulPlay':
      // Reserved atom — always false until a battle-AI backend is wired up.
      return false;

    default:
      throw new Error(`Unknown predicate kind: "${pred.kind}"`);
  }
}

// Resolve a group by name (checks suite definitions then shared library).
export function resolveGroup(name, ctx) {
  return ctx.suite.definitions?.groups?.[name]
      ?? ctx.threatsLib?.groups?.[name]
      ?? null;
}
