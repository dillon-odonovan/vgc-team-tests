/**
 * Small Tailwind-styled form primitives shared by the suite builder. Kept
 * intentionally minimal — they match the look of the inputs in App.tsx.
 */
import { useEffect, useState, type ReactNode } from "react";

import type { Op } from "../../../src/types.ts";
import { OPS } from "../suite-defaults.ts";

const inputCls =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

// Matches a number being typed incrementally: "", "-", "1", "1.", "-1.5", etc.
const PARTIAL_NUMBER = /^-?\d*\.?\d*$/;

export function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Accepted for API symmetry with the old native number input; unused now
   * that this renders as text (no spinner to step). */
  step?: number;
}) {
  // Renders as a text input with a numeric inputMode rather than
  // type="number": browsers sanitize a type="number" input's `.value` to ""
  // the instant it holds something that isn't yet a complete number (e.g. a
  // lone "-" or a trailing "."), which happens before our onChange ever sees
  // it — so a text input is the only way to let users type a negative or
  // decimal value one keystroke at a time.
  const [text, setText] = useState(() =>
    Number.isFinite(value) ? String(value) : "",
  );

  useEffect(() => {
    if (Number(text) !== value) {
      setText(Number.isFinite(value) ? String(value) : "");
    }
  }, [value]);

  function handleChange(raw: string) {
    if (!PARTIAL_NUMBER.test(raw)) return;
    setText(raw);
    const n = Number(raw);
    if (raw !== "" && raw !== "-" && Number.isFinite(n)) onChange(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => {
        // If the user leaves an incomplete entry (e.g. a lone "-") behind,
        // snap the display back to the last committed value.
        if (!Number.isFinite(Number(text)) || text === "" || text === "-") {
          setText(Number.isFinite(value) ? String(value) : "");
        }
      }}
      className={inputCls}
    />
  );
}

export function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[] | readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={inputCls}
    >
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Paired "op" / "value" comparison fields, shared by predicate and assertion editors. */
export function OpValue({
  op,
  value,
  step,
  onOp,
  onValue,
}: {
  op: Op;
  value: number;
  step?: number;
  onOp: (op: Op) => void;
  onValue: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="op">
        <SelectInput<Op> value={op} options={OPS} onChange={onOp} />
      </Field>
      <Field label="value">
        <NumberInput value={value} step={step} onChange={onValue} />
      </Field>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      {label}
    </label>
  );
}
