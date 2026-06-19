/**
 * Evaluates the four assertion shapes (count / countDistinct / coverage / team)
 * and returns a partial Result object (id/title/severity added by engine).
 */
import { evalPredicate, resolveGroup } from "./eval-predicate.js";
import type {
  Assert,
  EvalContext,
  MemberRef,
  Op,
  PartialResult,
  Predicate,
  TeamMember,
  ThreatSpec,
} from "./types.js";

function compare(lhs: number, op: Op, rhs: number): boolean {
  switch (op) {
    case ">=":
      return lhs >= rhs;
    case "<=":
      return lhs <= rhs;
    case ">":
      return lhs > rhs;
    case "<":
      return lhs < rhs;
    case "==":
      return lhs === rhs;
    case "!=":
      return lhs !== rhs;
    default:
      throw new Error(`Unknown op: ${op}`);
  }
}

function memberRef(m: TeamMember): MemberRef {
  return { slot: m.slot, species: m.species };
}

function safeEval(pred: Predicate, m: TeamMember, ctx: EvalContext): boolean {
  try {
    return evalPredicate(pred, m, ctx);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// count assertion
// ---------------------------------------------------------------------------
function evalCount(
  assert: Extract<Assert, { count: "members" }>,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  const { op, value, where } = assert;
  const satisfied = where ? team.filter((m) => safeEval(where, m, ctx)) : team;

  const actual = satisfied.length;
  const pass = compare(actual, op, value);
  return { pass, actual, op, value, satisfiedBy: satisfied.map(memberRef) };
}

// ---------------------------------------------------------------------------
// countDistinct assertion
// ---------------------------------------------------------------------------
function getMemberAttributeValues(
  member: TeamMember,
  attribute: string,
  ctx: EvalContext,
): Set<string | number | boolean> {
  if (attribute.startsWith("facet:")) {
    const facetKey = attribute.slice(6);
    const values = new Set<string | number | boolean>();
    for (const moveId of member.moves ?? []) {
      const entry = ctx.tags.moves?.[moveId];
      const v = entry?.[facetKey];
      if (
        v != null &&
        (typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean")
      )
        values.add(v);
    }
    const itemEntry = member.item ? ctx.tags.items?.[member.item] : undefined;
    const itemV = itemEntry?.[facetKey];
    if (
      itemV != null &&
      (typeof itemV === "string" ||
        typeof itemV === "number" ||
        typeof itemV === "boolean")
    )
      values.add(itemV);
    const abilEntry = member.ability
      ? ctx.tags.abilities?.[member.ability]
      : undefined;
    const abilV = abilEntry?.[facetKey];
    if (
      abilV != null &&
      (typeof abilV === "string" ||
        typeof abilV === "number" ||
        typeof abilV === "boolean")
    )
      values.add(abilV);
    return values;
  }
  switch (attribute) {
    case "species":
      return new Set([member.species]);
    case "item":
      return member.item ? new Set([member.item]) : new Set();
    case "ability":
      return member.ability ? new Set([member.ability]) : new Set();
    case "teraType":
      return member.teraType ? new Set([member.teraType]) : new Set();
    case "type":
      return new Set((member._types ?? []).map((t) => t.toLowerCase()));
    case "move":
      return new Set(member.moves ?? []);
    default:
      return new Set();
  }
}

function evalCountDistinct(
  assert: Extract<Assert, { countDistinct: string }>,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  const { countDistinct, where, op, value } = assert;
  const qualified = where ? team.filter((m) => safeEval(where, m, ctx)) : team;

  const distinctValues = new Set<string | number | boolean>();
  for (const m of qualified) {
    for (const v of getMemberAttributeValues(m, countDistinct, ctx)) {
      distinctValues.add(v);
    }
  }

  const actual = distinctValues.size;
  const pass = compare(actual, op, value);
  return {
    pass,
    actual,
    op,
    value,
    satisfiedBy: qualified.map(memberRef),
    detail: { distinctValues: [...distinctValues] },
  };
}

// ---------------------------------------------------------------------------
// coverage assertion
// ---------------------------------------------------------------------------

interface GroupElements {
  elements: string[];
  rawMembers?: (string | ThreatSpec)[];
  notImplemented?: boolean;
}

function groupElements(
  groupSpec: ReturnType<typeof resolveGroup>,
): GroupElements {
  if (!groupSpec) return { elements: [] };

  if (groupSpec.kind === "values") return { elements: groupSpec.members ?? [] };
  if (groupSpec.kind === "species")
    return { elements: groupSpec.members ?? [] };
  if (groupSpec.kind === "threats") {
    return {
      elements: (groupSpec.members ?? []).map((m) =>
        typeof m === "string" ? m : m.species,
      ),
      rawMembers: groupSpec.members ?? [],
    };
  }
  // kind === 'meta': requires usage data — not implemented.
  return { elements: [], notImplemented: true };
}

function evalCoverage(
  assert: Extract<Assert, { coverage: unknown }>,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  const { coverage } = assert;
  const {
    group: groupName,
    each: eachPred,
    atLeast = 1,
    of: ofMode = "all",
  } = coverage;

  const groupSpec = resolveGroup(groupName, ctx);
  if (!groupSpec) {
    return {
      pass: false,
      message: `Unknown group: ${groupName}`,
      coverage: { covered: [], uncovered: [], byElement: {} },
    };
  }

  const { elements, notImplemented, rawMembers } = groupElements(groupSpec);

  if (notImplemented) {
    return {
      pass: false,
      message: `Group "${groupName}" is kind:meta — usage-stats resolution not implemented yet.`,
      coverage: {
        of: ofMode,
        atLeast,
        covered: [],
        uncovered: [],
        byElement: {},
      },
    };
  }

  const covered: string[] = [];
  const uncovered: string[] = [];
  const byElement: Record<string, MemberRef[]> = {};

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    // Bind $each to the raw member (threat ref or type string)
    const eachBinding = rawMembers ? rawMembers[i] : elem;
    const childCtx: EvalContext = { ...ctx, each: eachBinding };

    const passing: MemberRef[] = [];
    for (const m of team) {
      if (safeEval(eachPred, m, childCtx)) passing.push(memberRef(m));
    }

    byElement[elem] = passing;
    if (passing.length >= atLeast) covered.push(elem);
    else uncovered.push(elem);
  }

  const pass = ofMode === "all" ? uncovered.length === 0 : covered.length > 0;

  return {
    pass,
    coverage: { of: ofMode, atLeast, covered, uncovered, byElement },
  };
}

// ---------------------------------------------------------------------------
// team assertion
// ---------------------------------------------------------------------------

// In team scope each leaf atom is existential (any member satisfies it).
function evalTeamPredicate(
  pred: Predicate,
  team: TeamMember[],
  ctx: EvalContext,
): boolean {
  switch (pred.kind) {
    case "all":
      return pred.of.every((p) => evalTeamPredicate(p, team, ctx));
    case "any":
      return pred.of.some((p) => evalTeamPredicate(p, team, ctx));
    case "not":
      return !evalTeamPredicate(pred.of, team, ctx);
    case "atLeastK": {
      let k = 0;
      for (const p of pred.of) if (evalTeamPredicate(p, team, ctx)) k++;
      return k >= pred.k;
    }
    case "ref": {
      const def = ctx.suite.definitions?.predicates?.[pred.predicate];
      if (!def) throw new Error(`Unknown predicate ref: ${pred.predicate}`);
      return evalTeamPredicate(def, team, ctx);
    }
    default:
      // Leaf atom: existential over team
      return team.some((m) => safeEval(pred, m, ctx));
  }
}

function evalTeam(
  assert: Extract<Assert, { team: Predicate }>,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  return { pass: evalTeamPredicate(assert.team, team, ctx) };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function evalAssertion(
  assert: Assert,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  if ("count" in assert) return evalCount(assert, team, ctx);
  if ("countDistinct" in assert) return evalCountDistinct(assert, team, ctx);
  if ("coverage" in assert) return evalCoverage(assert, team, ctx);
  return evalTeam(assert, team, ctx);
}
