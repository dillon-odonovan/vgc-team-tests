import { useState } from "react";

import { SAMPLE_TEAM, SUITES, evaluate } from "./engine-host.ts";
import type { Report, Result } from "../../src/types.ts";

const SEVERITY_STYLES: Record<string, string> = {
  error: "bg-red-100 text-red-800 ring-red-200",
  warn: "bg-amber-100 text-amber-800 ring-amber-200",
  info: "bg-sky-100 text-sky-800 ring-sky-200",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset ${cls}`}
    >
      {severity}
    </span>
  );
}

function SummaryChips({ report }: { report: Report }) {
  const order: Array<"error" | "warn" | "info"> = ["error", "warn", "info"];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map((sev) => {
        const tally = report.summary[sev];
        if (!tally) return null;
        return (
          <div
            key={sev}
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            <SeverityBadge severity={sev} />
            <span className="text-emerald-600 font-medium">
              {tally.passed} pass
            </span>
            <span className="text-slate-300">/</span>
            <span
              className={
                tally.failed > 0 ? "text-red-600 font-medium" : "text-slate-400"
              }
            >
              {tally.failed} fail
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResultCard({ result }: { result: Result }) {
  const uncovered = result.coverage?.uncovered ?? [];
  return (
    <li
      className={`rounded-lg border p-4 ${
        result.pass
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-red-200 bg-red-50/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`text-lg leading-none ${
              result.pass ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {result.pass ? "✔" : "✘"}
          </span>
          <h3 className="font-medium text-slate-900">
            {result.title ?? result.id}
          </h3>
        </div>
        <SeverityBadge severity={result.severity ?? "error"} />
      </div>

      {result.message && (
        <p className="mt-2 text-sm text-slate-600">{result.message}</p>
      )}

      {result.satisfiedBy && result.satisfiedBy.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Satisfied by:{" "}
          <span className="font-medium text-slate-700">
            {result.satisfiedBy.map((m) => m.species).join(", ")}
          </span>
        </p>
      )}

      {uncovered.length > 0 && (
        <p className="mt-2 text-xs text-red-600">
          Uncovered: {uncovered.join(", ")}
        </p>
      )}
    </li>
  );
}

export default function App() {
  const [suiteId, setSuiteId] = useState(SUITES[0].id);
  const [teamText, setTeamText] = useState(SAMPLE_TEAM);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runTests() {
    const entry = SUITES.find((s) => s.id === suiteId);
    if (!entry) return;
    setRunning(true);
    setError(null);
    try {
      const result = await evaluate(entry.suite, teamText);
      setReport(result);
    } catch (err) {
      setReport(null);
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          VGC Team Tests
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste a Showdown team, pick a suite, and check it against declarative
          team-building rules. Everything runs in your browser.
        </p>
      </header>

      <section className="space-y-4">
        <div>
          <label
            htmlFor="suite"
            className="block text-sm font-medium text-slate-700"
          >
            Suite
          </label>
          <select
            id="suite"
            value={suiteId}
            onChange={(e) => setSuiteId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {SUITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="team"
            className="block text-sm font-medium text-slate-700"
          >
            Team paste
          </label>
          <textarea
            id="team"
            value={teamText}
            onChange={(e) => setTeamText(e.target.value)}
            spellCheck={false}
            rows={14}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <button
          onClick={runTests}
          disabled={running}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run tests"}
        </button>
      </section>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && (
        <section className="mt-8 space-y-4">
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              report.passed
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {report.passed
              ? "✔ All error-severity tests passed"
              : "✘ Some error-severity tests failed"}
          </div>

          <SummaryChips report={report} />

          <ul className="space-y-3">
            {report.results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
