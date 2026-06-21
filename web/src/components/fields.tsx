/**
 * Small Tailwind-styled form primitives shared by the suite builder. Kept
 * intentionally minimal — they match the look of the inputs in App.tsx.
 */
import type { ReactNode } from "react";

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

export function NumberInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      step={step}
      onChange={(e) =>
        onChange(e.target.value === "" ? 0 : Number(e.target.value))
      }
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
