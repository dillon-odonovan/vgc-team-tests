/**
 * Shared comparison-operator evaluator used by every assertion shape and by
 * the `level` / `stat` / `typeEffectiveness` / `dealsDamage` atoms.
 */
import type { Op } from "./types.js";

/**
 * Evaluates `lhs <op> rhs` for the schema's six comparison operators.
 *
 * @param lhs - The measured (left-hand) value.
 * @param op - One of `>= <= > < == !=`.
 * @param rhs - The threshold (right-hand) value.
 * @returns The result of the comparison.
 * @throws If `op` is not a recognized operator.
 */
export function compare(lhs: number, op: Op, rhs: number): boolean {
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
