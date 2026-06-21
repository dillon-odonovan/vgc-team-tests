/**
 * Modal editor for a custom suite. Two tabs over one working Suite object:
 *  - Builder: guided forms (suite metadata + a list of TestForms).
 *  - JSON:    raw, schema-validated JSON for full power / power users.
 * Both stay in sync through the shared `suite` state. Footer offers
 * Save / Cancel / Export (download) / Import (upload).
 */
import { useMemo, useRef, useState } from "react";

import type { Suite } from "../../../src/types.ts";
import { emptyTest } from "../suite-defaults.ts";
import { validateSuite } from "../validation.ts";
import { labelFor } from "../storage.ts";
import { Field, TextInput } from "./fields.tsx";
import { TestForm } from "./TestForm.tsx";

type Tab = "builder" | "json";

export function SuiteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Suite;
  onSave: (suite: Suite) => void;
  onCancel: () => void;
}) {
  const [suite, setSuite] = useState<Suite>(() => structuredClone(initial));
  const [tab, setTab] = useState<Tab>("builder");
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(initial, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => validateSuite(suite), [suite]);
  const canSave = validation.valid && !jsonError;

  function switchTab(next: Tab) {
    if (next === "json") {
      setJsonText(JSON.stringify(suite, null, 2));
      setJsonError(null);
    }
    setTab(next);
  }

  function onJsonChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      setSuite(parsed as Suite);
    } catch (err) {
      setJsonError((err as Error).message);
    }
  }

  function patchSuite(patch: Partial<Suite>) {
    setSuite((s) => ({ ...s, ...patch }));
  }

  function exportSuite() {
    const blob = new Blob([JSON.stringify(suite, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug =
      labelFor(suite)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "suite";
    a.download = `${slug}.suite.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importSuite(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Suite;
      setSuite(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      setTab("builder");
    } catch (err) {
      setJsonError(`Import failed: ${(err as Error).message}`);
      setTab("json");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-xl">
        {/* Header + tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Suite editor</h2>
          <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 text-sm">
            {(["builder", "json"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={`rounded px-3 py-1 capitalize ${
                  tab === t
                    ? "bg-white shadow-sm font-medium text-slate-900"
                    : "text-slate-500"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          {tab === "builder" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="name">
                  <TextInput
                    value={suite.name ?? ""}
                    onChange={(name) => patchSuite({ name })}
                  />
                </Field>
                <Field label="format (optional)">
                  <TextInput
                    value={suite.format ?? ""}
                    onChange={(format) =>
                      patchSuite({ format: format || undefined })
                    }
                  />
                </Field>
                <Field label="description (optional)" className="col-span-2">
                  <TextInput
                    value={suite.description ?? ""}
                    onChange={(description) =>
                      patchSuite({ description: description || undefined })
                    }
                  />
                </Field>
              </div>

              <div className="space-y-3">
                {suite.tests.map((test, i) => (
                  <TestForm
                    key={i}
                    test={test}
                    index={i}
                    onChange={(next) =>
                      patchSuite({
                        tests: suite.tests.map((t, j) => (j === i ? next : t)),
                      })
                    }
                    onRemove={() =>
                      patchSuite({
                        tests: suite.tests.filter((_, j) => j !== i),
                      })
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patchSuite({ tests: [...suite.tests, emptyTest()] })
                  }
                  className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  + Add test
                </button>
              </div>
            </>
          ) : (
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => onJsonChange(e.target.value)}
                spellCheck={false}
                rows={22}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              {jsonError && (
                <p className="mt-1 text-xs text-red-600">
                  JSON error: {jsonError}
                </p>
              )}
            </div>
          )}

          {/* Validation panel */}
          {!jsonError && !validation.valid && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">Not yet valid against the schema:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {validation.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {validation.errors.length > 12 && (
                  <li>…and {validation.errors.length - 12} more</li>
                )}
              </ul>
            </div>
          )}
          {canSave && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              ✔ Valid suite
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportSuite}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importSuite(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave(suite)}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
