/**
 * Recursive editor for a single Predicate. Composites (all/any/not/atLeastK)
 * render nested PredicateFields; leaf atoms render kind-specific inputs. The
 * full union from src/types.ts is the source of truth — kinds not given a
 * dedicated form here can still be edited in the JSON tab.
 */
import type { Predicate } from "../../../src/types.ts";
import {
  OPS,
  PREDICATE_KINDS,
  STAT_KEYS,
  defaultPredicate,
  type BuilderPredicateKind,
} from "../suite-defaults.ts";
import {
  Checkbox,
  Field,
  NumberInput,
  SelectInput,
  TextInput,
} from "./fields.tsx";

type Patch = Record<string, unknown>;

export function PredicateField({
  value,
  onChange,
  onRemove,
}: {
  value: Predicate;
  onChange: (p: Predicate) => void;
  onRemove?: () => void;
}) {
  // Patch helper that preserves the discriminant while updating fields.
  const set = (patch: Patch) =>
    onChange({
      ...(value as unknown as Record<string, unknown>),
      ...patch,
    } as unknown as Predicate);

  const p = value as Predicate & Record<string, unknown>;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
      <div className="flex items-center gap-2">
        <SelectInput<BuilderPredicateKind>
          value={value.kind}
          options={PREDICATE_KINDS}
          onChange={(kind) => onChange(defaultPredicate(kind))}
        />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            aria-label="Remove condition"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2">{renderBody(p, set, onChange)}</div>
    </div>
  );
}

function renderBody(
  p: Predicate & Record<string, unknown>,
  set: (patch: Patch) => void,
  onChange: (p: Predicate) => void,
) {
  switch (p.kind) {
    case "all":
    case "any":
      return (
        <CompositeList
          items={(p.of as Predicate[]) ?? []}
          onChange={(of) => set({ of })}
        />
      );
    case "atLeastK":
      return (
        <div className="space-y-2">
          <Field label="k (at least)">
            <NumberInput
              value={(p.k as number) ?? 1}
              onChange={(k) => set({ k })}
            />
          </Field>
          <CompositeList
            items={(p.of as Predicate[]) ?? []}
            onChange={(of) => set({ of })}
          />
        </div>
      );
    case "not":
      return (
        <PredicateField
          value={(p.of as Predicate) ?? defaultPredicate("species")}
          onChange={(of) => set({ of })}
        />
      );
    case "ref":
      return (
        <Field label="predicate name">
          <TextInput
            value={(p.predicate as string) ?? ""}
            onChange={(predicate) => set({ predicate })}
          />
        </Field>
      );
    case "species":
    case "ability":
    case "nature":
    case "teraType":
    case "item":
      return (
        <Field label="is (id)">
          <TextInput
            value={(p.is as string) ?? ""}
            onChange={(is) => set({ is })}
            placeholder="e.g. incineroar"
          />
        </Field>
      );
    case "gender":
      return (
        <Field label="is">
          <SelectInput
            value={(p.is as "M" | "F" | "N") ?? "M"}
            options={["M", "F", "N"] as const}
            onChange={(is) => set({ is })}
          />
        </Field>
      );
    case "level":
      return (
        <OpValue
          op={p.op as string}
          value={p.value as number}
          onOp={(op) => set({ op })}
          onValue={(value) => set({ value })}
        />
      );
    case "move":
    case "type":
      return (
        <Field label="has (id)">
          <TextInput
            value={(p.has as string) ?? ""}
            onChange={(has) => set({ has })}
            placeholder={p.kind === "type" ? "e.g. fire" : "e.g. fakeout"}
          />
        </Field>
      );
    case "inGroup":
      return (
        <Field label="group name">
          <TextInput
            value={(p.group as string) ?? ""}
            onChange={(group) => set({ group })}
          />
        </Field>
      );
    case "tagged":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="of">
            <SelectInput
              value={(p.of as string) ?? "move"}
              options={["move", "item", "ability", "species"] as const}
              onChange={(of) => set({ of })}
            />
          </Field>
          <Field label="tag">
            <TextInput
              value={(p.tag as string) ?? ""}
              onChange={(tag) => set({ tag })}
              placeholder="e.g. speed_control"
            />
          </Field>
          <Field label="facet (optional)">
            <TextInput
              value={(p.facet as string) ?? ""}
              onChange={(facet) => set({ facet: facet || undefined })}
            />
          </Field>
          <Field label="equals (optional)">
            <TextInput
              value={(p.equals as string) ?? ""}
              onChange={(equals) => set({ equals: equals || undefined })}
            />
          </Field>
        </div>
      );
    case "stat":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="stat">
              <SelectInput
                value={(p.stat as string) ?? "spe"}
                options={STAT_KEYS}
                onChange={(stat) => set({ stat })}
              />
            </Field>
            <Field label="vs">
              <SelectInput
                value={(p.vs as string) ?? "final"}
                options={["base", "final"] as const}
                onChange={(vs) => set({ vs })}
              />
            </Field>
          </div>
          <OpValue
            op={p.op as string}
            value={p.value as number}
            onOp={(op) => set({ op })}
            onValue={(value) => set({ value })}
          />
        </div>
      );
    case "outspeeds":
      return (
        <div className="space-y-1">
          <Field label="threat">
            <TextInput
              value={(p.threat as string) ?? ""}
              onChange={(threat) => set({ threat })}
            />
          </Field>
          <Checkbox
            label="or speed tie"
            checked={Boolean(p.orSpeedTie)}
            onChange={(orSpeedTie) => set({ orSpeedTie })}
          />
          <Checkbox
            label="under Trick Room"
            checked={Boolean(p.underTrickRoom)}
            onChange={(underTrickRoom) => set({ underTrickRoom })}
          />
        </div>
      );
    case "typeEffectiveness":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="role">
              <SelectInput
                value={(p.role as string) ?? "defending"}
                options={["defending", "attacking"] as const}
                onChange={(role) => set({ role })}
              />
            </Field>
            <Field label="vs type">
              <TextInput
                value={(p.vsType as string) ?? ""}
                onChange={(vsType) => set({ vsType })}
                placeholder="e.g. water"
              />
            </Field>
          </div>
          <Checkbox
            label="with Tera"
            checked={Boolean(p.withTera)}
            onChange={(withTera) => set({ withTera })}
          />
          <OpValue
            op={p.op as string}
            value={p.value as number}
            step={0.25}
            onOp={(op) => set({ op })}
            onValue={(value) => set({ value })}
          />
        </div>
      );
    case "immuneTo":
      return (
        <div className="grid grid-cols-3 gap-2">
          <Field label="effect">
            <TextInput
              value={(p.effect as string) ?? ""}
              onChange={(effect) => set({ effect: effect || undefined })}
              placeholder="e.g. powder"
            />
          </Field>
          <Field label="moveTag">
            <TextInput
              value={(p.moveTag as string) ?? ""}
              onChange={(moveTag) => set({ moveTag: moveTag || undefined })}
            />
          </Field>
          <Field label="move">
            <TextInput
              value={(p.move as string) ?? ""}
              onChange={(move) => set({ move: move || undefined })}
            />
          </Field>
        </div>
      );
    case "canRemove":
      return (
        <Field label="hazard">
          <TextInput
            value={(p.hazard as string) ?? ""}
            onChange={(hazard) => set({ hazard })}
            placeholder="e.g. toxicspikes"
          />
        </Field>
      );
    case "survives":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="threat">
            <TextInput
              value={(p.threat as string) ?? ""}
              onChange={(threat) => set({ threat })}
            />
          </Field>
          <Field label="case">
            <SelectInput
              value={(p.case as string) ?? "worst"}
              options={["worst", "best", "specified"] as const}
              onChange={(c) => set({ case: c })}
            />
          </Field>
          <Field label="hits">
            <NumberInput
              value={(p.hits as number) ?? 1}
              onChange={(hits) => set({ hits })}
            />
          </Field>
          <Field label="roll">
            <SelectInput
              value={(p.roll as string) ?? "max"}
              options={["min", "max", "avg"] as const}
              onChange={(roll) => set({ roll })}
            />
          </Field>
        </div>
      );
    case "koes":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label="threat">
            <TextInput
              value={(p.threat as string) ?? ""}
              onChange={(threat) => set({ threat })}
            />
          </Field>
          <Field label="hits">
            <NumberInput
              value={(p.hits as number) ?? 1}
              onChange={(hits) => set({ hits })}
            />
          </Field>
          <Field label="roll">
            <SelectInput
              value={(p.roll as string) ?? "min"}
              options={["min", "max"] as const}
              onChange={(roll) => set({ roll })}
            />
          </Field>
          <Field label="move (optional)">
            <TextInput
              value={(p.move as string) ?? ""}
              onChange={(move) => set({ move: move || undefined })}
            />
          </Field>
        </div>
      );
    case "dealsDamage": {
      const fraction = (p.fraction as { op: string; value: number }) ?? {
        op: ">=",
        value: 0.5,
      };
      return (
        <div className="space-y-2">
          <Field label="threat">
            <TextInput
              value={(p.threat as string) ?? ""}
              onChange={(threat) => set({ threat })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="fraction op">
              <SelectInput
                value={fraction.op}
                options={OPS}
                onChange={(op) => set({ fraction: { ...fraction, op } })}
              />
            </Field>
            <Field label="fraction value">
              <NumberInput
                value={fraction.value}
                step={0.05}
                onChange={(value) => set({ fraction: { ...fraction, value } })}
              />
            </Field>
          </div>
        </div>
      );
    }
    default:
      return (
        <p className="text-xs text-slate-500">
          Edit this condition in the JSON tab.
        </p>
      );
  }
}

function OpValue({
  op,
  value,
  step,
  onOp,
  onValue,
}: {
  op: string;
  value: number;
  step?: number;
  onOp: (op: string) => void;
  onValue: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="op">
        <SelectInput value={op} options={OPS} onChange={onOp} />
      </Field>
      <Field label="value">
        <NumberInput value={value} step={step} onChange={onValue} />
      </Field>
    </div>
  );
}

function CompositeList({
  items,
  onChange,
}: {
  items: Predicate[];
  onChange: (items: Predicate[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <PredicateField
          key={i}
          value={item}
          onChange={(next) =>
            onChange(items.map((it, j) => (j === i ? next : it)))
          }
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, defaultPredicate("species")])}
        className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        + Add condition
      </button>
    </div>
  );
}
