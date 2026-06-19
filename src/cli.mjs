#!/usr/bin/env node
/**
 * CLI entry point for the VGC team test engine.
 *
 * Usage:
 *   node src/cli.mjs --suite <path> --team <path> [--tests id1,id2] [--pretty]
 *   cat team.txt | node src/cli.mjs --suite <path>
 */

import { readFileSync } from "node:fs";
import { runSuite, runTests } from "./engine.mjs";

// ---------------------------------------------------------------------------
// Arg parsing (no deps — keep it simple)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
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

function die(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function usage() {
  process.stdout.write(
    `
Usage: node src/cli.mjs --suite <suite.json> [--team <team.txt>] [options]

Options:
  --suite <path>    Path to a .suite.json file (required)
  --team  <path>    Path to a Showdown/pokepaste team file
                    (if omitted, reads team from stdin)
  --tests <ids>     Comma-separated test ids to run (default: all)
  --pretty          Pretty-print JSON output (default: compact)
  --help            Show this help

Examples:
  node src/cli.mjs --suite examples/suites/reg-m-a-baseline.suite.json --team team.txt
  cat team.txt | node src/cli.mjs --suite examples/suites/reg-m-a-baseline.suite.json --pretty
`.trimStart(),
  );
}

// ---------------------------------------------------------------------------
// Read stdin (for piped team text)
// ---------------------------------------------------------------------------
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    process.stdin.resume();
  });
}

// ---------------------------------------------------------------------------
// Pretty-print summary to stderr
// ---------------------------------------------------------------------------
function printSummary(report) {
  const PASS = "\x1b[32m✓\x1b[0m";
  const FAIL = "\x1b[31m✗\x1b[0m";
  const WARN = "\x1b[33m!\x1b[0m";

  process.stderr.write(`\nSuite: ${report.suite}\n`);
  process.stderr.write(
    `Team:  ${report.team.map((m) => m.species).join(", ")}\n\n`,
  );

  const sevIcon = { error: FAIL, warn: WARN, info: "·" };
  for (const r of report.results) {
    const icon = r.pass ? PASS : (sevIcon[r.severity] ?? FAIL);
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
  const e = summary?.error ?? { passed: 0, failed: 0 };
  const w = summary?.warn ?? { passed: 0, failed: 0 };
  const i = summary?.info ?? { passed: 0, failed: 0 };

  process.stderr.write(
    `\nErrors: ${e.passed}/${(e.passed || 0) + (e.failed || 0)} passed`,
  );
  process.stderr.write(
    `  Warns: ${w.passed}/${(w.passed || 0) + (w.failed || 0)} passed`,
  );
  process.stderr.write(
    `  Info:  ${i.passed}/${(i.passed || 0) + (i.failed || 0)} passed\n`,
  );
  process.stderr.write(
    `Overall: ${report.passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}\n\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  usage();
  process.exit(0);
}
if (!args.suite) die("--suite is required. Run with --help for usage.");

let suiteData;
try {
  suiteData = JSON.parse(readFileSync(args.suite, "utf8"));
} catch (err) {
  die(`Cannot read suite file "${args.suite}": ${err.message}`);
}

let teamText;
if (args.team) {
  try {
    teamText = readFileSync(args.team, "utf8");
  } catch (err) {
    die(`Cannot read team file "${args.team}": ${err.message}`);
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
  const report = testIds
    ? await runTests(suiteData, teamText, testIds)
    : await runSuite(suiteData, teamText);

  if (args.pretty) printSummary(report);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  process.exit(report.passed ? 0 : 1);
} catch (err) {
  die(err.message);
}
