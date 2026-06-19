/**
 * Evaluates the four assertion shapes (count / countDistinct / coverage /
 * team) and returns a partial {@link Result} (id/title/severity are added
 * by the engine afterward).
 */
import { compare } from "./compare.js";
import { evalPredicate } from "./eval-predicate.js";
import { tryOrNull } from "./safe.js";
import { memberTypes } from "./team-member.js";
import { resolveGroup } from "./threats.js";
import type {
  Assert,
  EvalContext,
  GroupSpec,
  MemberRef,
  PartialResult,
  Predicate,
  TeamMember,
  ThreatSpec,
} from "./types.js";

function memberRef(m: TeamMember): MemberRef {
  return { slot: m.slot, species: m.species };
}

/** Evaluates a predicate, treating evaluator errors (e.g. an unresolved `$each`) as "doesn't match" rather than aborting the whole assertion. */
function safeEval(pred: Predicate, m: TeamMember, ctx: EvalContext): boolean {
  return tryOrNull(() => evalPredicate(pred, m, ctx)) ?? false;
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

type PrimitiveValue = string | number | boolean;

function isPrimitive(v: unknown): v is PrimitiveValue {
  return (
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
  );
}

/** Adds `entry[facetKey]` to `values` if it's present and a primitive. */
function addFacetValue(
  values: Set<PrimitiveValue>,
  entry: Record<string, unknown> | undefined,
  facetKey: string,
): void {
  const v = entry?.[facetKey];
  if (isPrimitive(v)) values.add(v);
}

/** Collects the distinct values a member contributes for a `countDistinct` attribute. */
function getMemberAttributeValues(
  member: TeamMember,
  attribute: string,
  ctx: EvalContext,
): Set<PrimitiveValue> {
  if (attribute.startsWith("facet:")) {
    const facetKey = attribute.slice(6);
    const values = new Set<PrimitiveValue>();
    for (const moveId of member.moves ?? [])
      addFacetValue(values, ctx.tags.moves?.[moveId], facetKey);
    addFacetValue(
      values,
      member.item ? ctx.tags.items?.[member.item] : undefined,
      facetKey,
    );
    addFacetValue(
      values,
      member.ability ? ctx.tags.abilities?.[member.ability] : undefined,
      facetKey,
    );
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
      return new Set(memberTypes(member));
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

  const distinctValues = new Set<PrimitiveValue>();
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
  /** The element ids/species/types to check coverage for. */
  elements: string[];
  /** For `threats` groups: the original (possibly inline-object) members, used to bind `$each`. */
  rawMembers?: (string | ThreatSpec)[];
  /** Set for `meta` groups, which need a live usage-stats resolver we don't have yet. */
  notImplemented?: boolean;
}

/** Normalizes any {@link GroupSpec} kind into a flat list of coverage elements. */
function groupElements(groupSpec: GroupSpec | null): GroupElements {
  if (!groupSpec) return { elements: [] };

  switch (groupSpec.kind) {
    case "values":
    case "species":
      return { elements: groupSpec.members ?? [] };
    case "threats": {
      const members = groupSpec.members ?? [];
      return {
        elements: members.map((m) => (typeof m === "string" ? m : m.species)),
        rawMembers: members,
      };
    }
    case "meta":
      return { elements: [], notImplemented: true };
  }
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

/**
 * Evaluates a predicate in "team scope": each leaf atom means "some member
 * satisfies it" (existential), so `all`/`any`/`not`/`atLeastK` combine
 * *different* existential requirements rather than testing one member.
 */
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

/**
 * Evaluates one test's assertion against the whole team, dispatching to the
 * matching shape (`count` / `countDistinct` / `coverage` / `team`).
 *
 * @param assert - The assertion to evaluate (a {@link Test}'s `assert` field).
 * @param team - The full (dex-enriched) team.
 * @param ctx - Evaluation context shared across all tests in the suite run.
 * @returns A partial result; the engine fills in `id`/`title`/`severity`.
 */
export function evalAssertion(
  assert: Assert,
  team: TeamMember[],
  ctx: EvalContext,
): PartialResult {
  if ("count" in assert) return evalCount(assert, team, ctx);
  if ("countDistinct" in assert) return evalCountDistinct(assert, team, ctx);
  if ("coverage" in assert) return evalCoverage(assert, team, ctx);
  if ("team" in assert) return evalTeam(assert, team, ctx);
  throw new Error(
    `Unknown assertion shape: ${JSON.stringify(Object.keys(assert))}`,
  );
}
