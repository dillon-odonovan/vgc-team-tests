#!/usr/bin/env node
/**
 * CLI entry point for the VGC team test engine.
 *
 * Usage:
 *   node dist/cli.js --suite <path> --team <path> [--tests id1,id2] [--pretty]
 *   cat team.txt | node dist/cli.js --suite <path>
 */
import { readFileSync } from "node:fs";
import { runSuite, runTests } from "./engine.js";
import { loadReferenceData } from "./load-data.js";
import type { Report, Suite } from "./types.js";

interface Args {
  suite?: string;
  team?: string;
  tests?: string;
  pretty?: boolean;
  help?: boolean;
}

// ---------------------------------------------------------------------------
// Arg parsing (no deps — keep it simple)
// ---------------------------------------------------------------------------

/** Parses `--flag value` / `--flag` style args; unrecognized flags are ignored. */
function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") {
      args.suite = argv[++i];
      continue;
    }
    if (a === "--team") {
      args.team = argv[++i];
      continue;
    }
    if (a === "--tests") {
      args.tests = argv[++i];
      continue;
    }
    if (a === "--pretty") {
      args.pretty = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }
  }
  return args;
}

/** Prints an error to stderr and exits with code 1. */
function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

/** Prints `--help` usage text to stdout. */
function usage(): void {
  process.stdout.write(
    `
Usage: node dist/cli.js --suite <suite.json> [--team <team.txt>] [options]

Options:
  --suite <path>    Path to a .suite.json file (required)
  --team  <path>    Path to a Showdown/pokepaste team file
                    (if omitted, reads team from stdin)
  --tests <ids>     Comma-separated test ids to run (default: all)
  --pretty          Pretty-print JSON output (default: compact)
  --help            Show this help

Examples:
  node dist/cli.js --suite examples/suites/reg-m-a-baseline.suite.json --team team.txt
  cat team.txt | node dist/cli.js --suite examples/suites/reg-m-a-baseline.suite.json --pretty
`.trimStart(),
  );
}

// ---------------------------------------------------------------------------
// Read stdin (for piped team text)
// ---------------------------------------------------------------------------

/** Buffers all of stdin and resolves with it as a UTF-8 string, used when `--team` is omitted. */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer | string) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
    );
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    process.stdin.resume();
  });
}

// ---------------------------------------------------------------------------
// Pretty-print summary to stderr
// ---------------------------------------------------------------------------

const EMPTY_TALLY = { passed: 0, failed: 0 };

/** Prints a colorized pass/fail summary of `report` to stderr (the `--pretty` output). */
function printSummary(report: Report): void {
  const PASS = "\x1b[32m✓\x1b[0m";
  const FAIL = "\x1b[31m✗\x1b[0m";
  const WARN = "\x1b[33m!\x1b[0m";

  process.stderr.write(`\nSuite: ${report.suite}\n`);
  process.stderr.write(
    `Team:  ${report.team.map((m) => m.species).join(", ")}\n\n`,
  );

  const sevIcon: Record<string, string> = {
    error: FAIL,
    warn: WARN,
    info: "·",
  };
  for (const r of report.results) {
    const icon = r.pass ? PASS : (sevIcon[r.severity ?? "error"] ?? FAIL);
    const label = r.pass ? "PASS" : "FAIL";
    let line = `  ${icon} [${label}] ${r.id}`;
    if (r.title) line += ` — ${r.title}`;
    process.stderr.write(line + "\n");
    if (!r.pass && r.message) {
      process.stderr.write(`       ${r.message}\n`);
    }
    if (!r.pass && r.coverage?.uncovered?.length) {
      process.stderr.write(
        `       uncovered: ${r.coverage.uncovered.join(", ")}\n`,
      );
    }
  }

  const { summary } = report;
  const e = summary?.error ?? EMPTY_TALLY;
  const w = summary?.warn ?? EMPTY_TALLY;
  const i = summary?.info ?? EMPTY_TALLY;

  process.stderr.write(`\nErrors: ${e.passed}/${e.passed + e.failed} passed`);
  process.stderr.write(`  Warns: ${w.passed}/${w.passed + w.failed} passed`);
  process.stderr.write(`  Info:  ${i.passed}/${i.passed + i.failed} passed\n`);
  process.stderr.write(
    `Overall: ${report.passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}\n\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Parses args, loads the suite/team, runs the engine, and exits 0/1 on pass/fail. */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.suite) die("--suite is required. Run with --help for usage.");

  let suiteData: Suite;
  try {
    suiteData = JSON.parse(readFileSync(args.suite, "utf8")) as Suite;
  } catch (err) {
    die(`Cannot read suite file "${args.suite}": ${(err as Error).message}`);
  }

  let teamText: string;
  if (args.team) {
    try {
      teamText = readFileSync(args.team, "utf8");
    } catch (err) {
      die(`Cannot read team file "${args.team}": ${(err as Error).message}`);
    }
  } else if (!process.stdin.isTTY) {
    teamText = await readStdin();
  } else {
    die("Provide a team via --team <path> or pipe it to stdin.");
  }

  try {
    const testIds = args.tests
      ? args.tests.split(",").map((s) => s.trim())
      : null;
    const data = loadReferenceData();
    const report = testIds
      ? await runTests(suiteData, teamText, testIds, data)
      : await runSuite(suiteData, teamText, data);

    if (args.pretty) printSummary(report);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");

    process.exit(report.passed ? 0 : 1);
  } catch (err) {
    die((err as Error).message);
  }
}

main();
