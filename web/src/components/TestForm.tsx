/**
 * Editor for a single Test: metadata plus an assertion editor that switches
 * between the four assertion shapes (count / countDistinct / coverage / team).
 */
import type { Assert, Op, Predicate, Test } from "../../../src/types.ts";
import {
  OPS,
  SEVERITIES,
  assertShapeOf,
  defaultAssert,
  defaultPredicate,
  type AssertShape,
} from "../suite-defaults.ts";
import { Field, NumberInput, SelectInput, TextInput } from "./fields.tsx";
import { PredicateField } from "./PredicateField.tsx";

export function TestForm({
  test,
  index,
  onChange,
  onRemove,
}: {
  test: Test;
  index: number;
  onChange: (t: Test) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Test>) => onChange({ ...test, ...patch });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">
          Test {index + 1}
        </h4>
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Remove test
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="id">
          <TextInput value={test.id} onChange={(id) => set({ id })} />
        </Field>
        <Field label="severity">
          <SelectInput
            value={test.severity ?? "error"}
            options={SEVERITIES}
            onChange={(severity) => set({ severity })}
          />
        </Field>
        <Field label="title" className="col-span-2">
          <TextInput
            value={test.title ?? ""}
            onChange={(title) => set({ title })}
          />
        </Field>
        <Field label="rationale (optional)" className="col-span-2">
          <TextInput
            value={test.rationale ?? ""}
            onChange={(rationale) => set({ rationale: rationale || undefined })}
          />
        </Field>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
        <Field label="assertion">
          <SelectInput<AssertShape>
            value={assertShapeOf(test.assert)}
            options={
              [
                { value: "count", label: "count members" },
                { value: "countDistinct", label: "count distinct" },
                { value: "coverage", label: "coverage of group" },
                { value: "team", label: "team predicate" },
              ] as const
            }
            onChange={(shape) => set({ assert: defaultAssert(shape) })}
          />
        </Field>
        <div className="mt-2">
          <AssertEditor
            assert={test.assert}
            onChange={(assert) => set({ assert })}
          />
        </div>
      </div>
    </div>
  );
}

function AssertEditor({
  assert,
  onChange,
}: {
  assert: Assert;
  onChange: (a: Assert) => void;
}) {
  if ("count" in assert) {
    return (
      <div className="space-y-2">
        <OpValue
          op={assert.op}
          value={assert.value}
          onOp={(op) => onChange({ ...assert, op })}
          onValue={(value) => onChange({ ...assert, value })}
        />
        <p className="text-xs font-medium text-slate-600">
          where (each member):
        </p>
        <PredicateField
          value={assert.where ?? defaultPredicate("species")}
          onChange={(where) => onChange({ ...assert, where })}
        />
      </div>
    );
  }

  if ("countDistinct" in assert) {
    return (
      <div className="space-y-2">
        <Field label="attribute (e.g. species, item, type, facet:speedControlKind)">
          <TextInput
            value={assert.countDistinct}
            onChange={(countDistinct) => onChange({ ...assert, countDistinct })}
          />
        </Field>
        <OpValue
          op={assert.op}
          value={assert.value}
          onOp={(op) => onChange({ ...assert, op })}
          onValue={(value) => onChange({ ...assert, value })}
        />
      </div>
    );
  }

  if ("coverage" in assert) {
    const c = assert.coverage;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Field label="group" className="col-span-1">
            <TextInput
              value={c.group}
              onChange={(group) => onChange({ coverage: { ...c, group } })}
            />
          </Field>
          <Field label="atLeast">
            <NumberInput
              value={c.atLeast ?? 1}
              onChange={(atLeast) => onChange({ coverage: { ...c, atLeast } })}
            />
          </Field>
          <Field label="of">
            <SelectInput
              value={c.of ?? "all"}
              options={["all", "any"] as const}
              onChange={(of) => onChange({ coverage: { ...c, of } })}
            />
          </Field>
        </div>
        <p className="text-xs font-medium text-slate-600">
          each element ($each binds the current group member):
        </p>
        <PredicateField
          value={c.each}
          onChange={(each) => onChange({ coverage: { ...c, each } })}
        />
      </div>
    );
  }

  // team
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">
        whole-team predicate (member atoms are existential):
      </p>
      <PredicateField
        value={(assert as { team: Predicate }).team}
        onChange={(team) => onChange({ team })}
      />
    </div>
  );
}

function OpValue({
  op,
  value,
  onOp,
  onValue,
}: {
  op: Op;
  value: number;
  onOp: (op: Op) => void;
  onValue: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="op">
        <SelectInput<Op> value={op} options={OPS} onChange={onOp} />
      </Field>
      <Field label="value">
        <NumberInput value={value} onChange={onValue} />
      </Field>
    </div>
  );
}
