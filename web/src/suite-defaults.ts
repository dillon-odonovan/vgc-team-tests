/**
 * Factory helpers that produce schema-valid skeletons for the builder. Keeping
 * these in one place means the builder and the "New suite" action agree on what
 * a fresh test / predicate / assertion looks like.
 */
import type { Assert, Predicate, Suite, Test } from "../../src/types.ts";

export const OPS = [">=", "<=", ">", "<", "==", "!="] as const;
export const SEVERITIES = ["error", "warn", "info"] as const;
export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** Predicate kinds the guided builder renders. Others remain JSON-editable. */
export type BuilderPredicateKind = Predicate["kind"];

export const PREDICATE_KINDS: BuilderPredicateKind[] = [
  // composites
  "all",
  "any",
  "not",
  "atLeastK",
  "ref",
  // leaf atoms
  "species",
  "ability",
  "nature",
  "teraType",
  "gender",
  "level",
  "item",
  "move",
  "type",
  "inGroup",
  "tagged",
  "stat",
  "outspeeds",
  "typeEffectiveness",
  "immuneTo",
  "canRemove",
  "survives",
  "koes",
  "dealsDamage",
];

export type AssertShape = "count" | "countDistinct" | "coverage" | "team";

export function defaultPredicate(kind: BuilderPredicateKind): Predicate {
  switch (kind) {
    case "all":
      return { kind: "all", of: [] };
    case "any":
      return { kind: "any", of: [] };
    case "not":
      return { kind: "not", of: { kind: "species", is: "" } };
    case "atLeastK":
      return { kind: "atLeastK", k: 1, of: [] };
    case "ref":
      return { kind: "ref", predicate: "" };
    case "species":
    case "ability":
    case "nature":
    case "teraType":
      return { kind, is: "" };
    case "gender":
      return { kind: "gender", is: "M" };
    case "level":
      return { kind: "level", op: ">=", value: 50 };
    case "item":
      return { kind: "item", is: "" };
    case "move":
      return { kind: "move", has: "" };
    case "type":
      return { kind: "type", has: "" };
    case "inGroup":
      return { kind: "inGroup", group: "" };
    case "tagged":
      return { kind: "tagged", of: "move", tag: "" };
    case "stat":
      return { kind: "stat", stat: "spe", vs: "final", op: ">=", value: 0 };
    case "outspeeds":
      return { kind: "outspeeds", threat: "" };
    case "typeEffectiveness":
      return {
        kind: "typeEffectiveness",
        role: "defending",
        vsType: "",
        op: "<=",
        value: 0.5,
      };
    case "immuneTo":
      return { kind: "immuneTo", effect: "" };
    case "canRemove":
      return { kind: "canRemove", hazard: "" };
    case "survives":
      return { kind: "survives", threat: "", case: "worst", hits: 1 };
    case "koes":
      return { kind: "koes", threat: "", hits: 1 };
    case "dealsDamage":
      return {
        kind: "dealsDamage",
        threat: "",
        fraction: { op: ">=", value: 0.5 },
      };
    default:
      return { kind: "species", is: "" };
  }
}

export function defaultAssert(shape: AssertShape): Assert {
  switch (shape) {
    case "count":
      // `where` is optional; omitting it counts all members and keeps a fresh
      // suite valid out of the box. The builder still shows an editable
      // predicate (filling it in sets `where`).
      return { count: "members", op: ">=", value: 1 };
    case "countDistinct":
      return { countDistinct: "species", op: ">=", value: 1 };
    case "coverage":
      return {
        coverage: {
          group: "",
          each: { kind: "koes", threat: "$each", hits: 2 },
          atLeast: 1,
          of: "all",
        },
      };
    case "team":
      return { team: { kind: "all", of: [] } };
  }
}

/** The assertion shape discriminator for an existing assertion. */
export function assertShapeOf(assert: Assert): AssertShape {
  if ("count" in assert) return "count";
  if ("countDistinct" in assert) return "countDistinct";
  if ("coverage" in assert) return "coverage";
  return "team";
}

let testCounter = 0;

export function emptyTest(): Test {
  testCounter += 1;
  return {
    id: `test-${testCounter}`,
    title: "",
    severity: "error",
    assert: defaultAssert("count"),
  };
}

export function emptySuite(): Suite {
  return {
    schemaVersion: "1.0.0",
    name: "My custom suite",
    description: "",
    tests: [emptyTest()],
  };
}
