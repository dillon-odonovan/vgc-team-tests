/**
 * Evaluates the four assertion shapes (count / countDistinct / coverage / team)
 * and returns a partial Result object (id/title/severity added by engine).
 */

import {evalPredicate, resolveGroup} from './eval-predicate.mjs';

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

function memberRef(m) { return {slot: m.slot, species: m.species}; }

// ---------------------------------------------------------------------------
// count assertion
// ---------------------------------------------------------------------------
function evalCount(assert, team, ctx) {
  const {op, value, where} = assert;
  const satisfied = where
    ? team.filter(m => { try { return evalPredicate(where, m, ctx); } catch { return false; } })
    : team;

  const actual = satisfied.length;
  const pass   = compare(actual, op, value);
  return {pass, actual, op, value, satisfiedBy: satisfied.map(memberRef)};
}

// ---------------------------------------------------------------------------
// countDistinct assertion
// ---------------------------------------------------------------------------
function getMemberAttributeValues(member, attribute, ctx) {
  if (attribute.startsWith('facet:')) {
    const facetKey = attribute.slice(6);
    const values = new Set();
    for (const moveId of member.moves ?? []) {
      const entry = ctx.tags.moves?.[moveId];
      if (entry && entry[facetKey] != null) values.add(entry[facetKey]);
    }
    // Also check item, ability, species facets
    const itemEntry = member.item ? ctx.tags.items?.[member.item] : null;
    if (itemEntry?.[facetKey] != null) values.add(itemEntry[facetKey]);
    const abilEntry = member.ability ? ctx.tags.abilities?.[member.ability] : null;
    if (abilEntry?.[facetKey] != null) values.add(abilEntry[facetKey]);
    return values;
  }
  switch (attribute) {
    case 'species':  return new Set([member.species]);
    case 'item':     return member.item     ? new Set([member.item])     : new Set();
    case 'ability':  return member.ability  ? new Set([member.ability])  : new Set();
    case 'teraType': return member.teraType ? new Set([member.teraType]) : new Set();
    case 'type':     return new Set((member._types ?? []).map(t => t.toLowerCase()));
    case 'move':     return new Set(member.moves ?? []);
    default: return new Set();
  }
}

function evalCountDistinct(assert, team, ctx) {
  const {countDistinct, where, op, value} = assert;
  const qualified = where
    ? team.filter(m => { try { return evalPredicate(where, m, ctx); } catch { return false; } })
    : team;

  const distinctValues = new Set();
  for (const m of qualified) {
    for (const v of getMemberAttributeValues(m, countDistinct, ctx)) {
      distinctValues.add(v);
    }
  }

  const actual = distinctValues.size;
  const pass   = compare(actual, op, value);
  return {
    pass,
    actual,
    op,
    value,
    satisfiedBy: qualified.map(memberRef),
    detail: {distinctValues: [...distinctValues]},
  };
}

// ---------------------------------------------------------------------------
// coverage assertion
// ---------------------------------------------------------------------------

// Resolve a group to its list of elements (strings).
function groupElements(groupSpec, ctx) {
  if (!groupSpec) return {elements: [], kind: 'unknown'};
  const {kind} = groupSpec;

  if (kind === 'values') {
    return {elements: groupSpec.members ?? [], kind: 'values', valueType: groupSpec.valueType};
  }
  if (kind === 'species') {
    return {elements: groupSpec.members ?? [], kind: 'species'};
  }
  if (kind === 'threats') {
    // Each member is a threat name (string) or inline threat object
    return {
      elements: (groupSpec.members ?? []).map(m => typeof m === 'string' ? m : m.species),
      kind: 'threats',
      rawMembers: groupSpec.members ?? [],
    };
  }
  if (kind === 'meta') {
    // Requires usage data — not implemented; return empty with note.
    return {elements: [], kind: 'meta', notImplemented: true};
  }
  return {elements: [], kind};
}

function evalCoverage(assert, team, ctx) {
  const {coverage} = assert;
  const {group: groupName, each: eachPred, atLeast = 1, of: ofMode = 'all'} = coverage;

  const groupSpec = resolveGroup(groupName, ctx);
  if (!groupSpec) {
    return {
      pass: false,
      message: `Unknown group: ${groupName}`,
      coverage: {covered: [], uncovered: [], byElement: {}},
    };
  }

  const {elements, kind, notImplemented, rawMembers} = groupElements(groupSpec, ctx);

  if (notImplemented) {
    return {
      pass: false,
      message: `Group "${groupName}" is kind:meta — usage-stats resolution not implemented yet.`,
      coverage: {of: ofMode, atLeast, covered: [], uncovered: [], byElement: {}},
    };
  }

  const covered   = [];
  const uncovered = [];
  const byElement = {};

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    // Bind $each to the raw member (threat ref or type string)
    const eachBinding = rawMembers ? rawMembers[i] : elem;
    const childCtx = {...ctx, each: eachBinding};

    const passing = [];
    for (const m of team) {
      try {
        if (evalPredicate(eachPred, m, childCtx)) passing.push(memberRef(m));
      } catch { /* skip */ }
    }

    byElement[elem] = passing;
    if (passing.length >= atLeast) {
      covered.push(elem);
    } else {
      uncovered.push(elem);
    }
  }

  const pass = ofMode === 'all'
    ? uncovered.length === 0
    : covered.length > 0;

  return {
    pass,
    coverage: {of: ofMode, atLeast, covered, uncovered, byElement},
  };
}

// ---------------------------------------------------------------------------
// team assertion
// ---------------------------------------------------------------------------

// In team scope each leaf atom is existential (any member satisfies it).
function evalTeamPredicate(pred, team, ctx) {
  switch (pred.kind) {
    case 'all':
      return pred.of.every(p => evalTeamPredicate(p, team, ctx));
    case 'any':
      return pred.of.some(p => evalTeamPredicate(p, team, ctx));
    case 'not':
      return !evalTeamPredicate(pred.of, team, ctx);
    case 'atLeastK': {
      let k = 0;
      for (const p of pred.of) if (evalTeamPredicate(p, team, ctx)) k++;
      return k >= pred.k;
    }
    case 'ref': {
      const def = ctx.suite.definitions?.predicates?.[pred.predicate];
      if (!def) throw new Error(`Unknown predicate ref: ${pred.predicate}`);
      return evalTeamPredicate(def, team, ctx);
    }
    default:
      // Leaf atom: existential over team
      return team.some(m => { try { return evalPredicate(pred, m, ctx); } catch { return false; } });
  }
}

function evalTeam(assert, team, ctx) {
  const pass = evalTeamPredicate(assert.team, team, ctx);
  return {pass};
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function evalAssertion(assert, team, ctx) {
  if ('count'         in assert) return evalCount(assert, team, ctx);
  if ('countDistinct' in assert) return evalCountDistinct(assert, team, ctx);
  if ('coverage'      in assert) return evalCoverage(assert, team, ctx);
  if ('team'          in assert) return evalTeam(assert, team, ctx);
  throw new Error(`Unknown assertion shape: ${JSON.stringify(Object.keys(assert))}`);
}
