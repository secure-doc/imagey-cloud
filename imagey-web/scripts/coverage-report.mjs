// Frontend coverage reports and gates (docs/plans/combined-frontend-coverage.md).
//
// Both suites measure with istanbul: the Pact suite against the instrumented dev server, the
// E2E suite against the instrumented bundle (npm run build:coverage). The instrumented code is
// lowered TS/JSX; the counters are mapped back to the original sources here.
//
//   --suite contract  Pact suite: reads target/coverage-istanbul/contract, writes the mapped
//                     data (target/coverage-raw/contract) for the combined gate, leaves out
//                     alwaysExcluded + contractExcluded and checks the gate.
//   --suite e2e       E2E suite: reads ../imagey-e2e/target/coverage-istanbul/e2e and writes
//                     the mapped data (../imagey-e2e/target/coverage-raw/e2e). No gate.
//   --suite combined  Merges both mapped data sets (or the --input directories), leaves out
//                     alwaysExcluded only and checks the gate.
import fs from "node:fs";
import path from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import libSourceMaps from "istanbul-lib-source-maps";
import reports from "istanbul-reports";
import {
  alwaysExcluded,
  contractExcluded,
  thresholds,
} from "../coverage.config.mjs";

const args = process.argv.slice(2);
const option = (name) =>
  args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
const suite = option("suite")[0];
if (!["contract", "e2e", "combined"].includes(suite)) {
  console.error("Usage: coverage-report.mjs --suite contract|e2e|combined");
  process.exit(2);
}

const rawInput = {
  contract: "target/coverage-istanbul/contract",
  e2e: "../imagey-e2e/target/coverage-istanbul/e2e",
};
const mappedOutput = {
  contract: "target/coverage-raw/contract",
  e2e: "../imagey-e2e/target/coverage-raw/e2e",
};
const mappedFile = "coverage.json";
const srcDir = path.resolve("src") + path.sep;
const matches = (list, file) => list.some((pattern) => pattern.test(file));
const isMeasured = (file) =>
  file.startsWith(srcDir) && !matches(alwaysExcluded, file);

function readJsonFiles(dir) {
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    : [];
  if (files.length === 0) {
    console.error(`No coverage data found in ${dir}`);
    process.exit(1);
  }
  return files.map((f) => ({
    name: f,
    data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
  }));
}

// Raw data -> counters of the original sources, with paths relative to imagey-web, so that
// data from different checkouts (CI jobs) merges.
async function mapRaw(dir) {
  const merged = libCoverage.createCoverageMap({});
  const entries = readJsonFiles(dir);
  // The Pact suite writes the statement maps of a file once (maps-*.json) and only the counters
  // with every test; join them again.
  const maps = Object.assign(
    {},
    ...entries.filter((e) => e.name.startsWith("maps-")).map((e) => e.data),
  );
  // A file holds one coverage object or, for E2E, a list of them (one per document).
  for (const { name, data } of entries) {
    if (name.startsWith("maps-")) {
      continue;
    }
    for (const coverage of [data].flat()) {
      for (const [file, entry] of Object.entries(coverage)) {
        if (!entry.statementMap) {
          coverage[file] = { ...maps[file], ...entry };
        }
      }
      merged.merge(coverage);
    }
  }
  const mapped = await libSourceMaps
    .createSourceMapStore()
    .transformCoverage(merged);
  const result = {};
  for (const file of mapped.files()) {
    if (file.startsWith(srcDir)) {
      const coverage = mapped.fileCoverageFor(file).toJSON();
      const relative = path.relative(process.cwd(), file);
      result[relative] = { ...coverage, path: relative };
    }
  }
  return result;
}

function absolute(map) {
  const coverageMap = libCoverage.createCoverageMap({});
  for (const [relative, coverage] of Object.entries(map)) {
    const file = path.resolve(relative);
    coverageMap.addFileCoverage({ ...coverage, path: file });
  }
  return coverageMap;
}

function writeMapped(dir, map) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, mappedFile), JSON.stringify(map));
}

function report(coverageMap, outputDir, names) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  const context = libReport.createContext({ dir: outputDir, coverageMap });
  for (const name of names) {
    reports.create(name).execute(context);
  }
}

function filtered(coverageMap, accept) {
  const result = libCoverage.createCoverageMap({});
  for (const file of coverageMap.files()) {
    if (accept(file)) {
      result.addFileCoverage(coverageMap.fileCoverageFor(file));
    }
  }
  return result;
}

function checkGate(label, coverageMap) {
  const summary = coverageMap.getCoverageSummary().toJSON();
  console.log(
    `${label}: ` +
      Object.keys(thresholds)
        .map((metric) => `${metric} ${summary[metric].pct}%`)
        .join(", "),
  );
  const failures = Object.entries(thresholds)
    .filter(([metric, min]) => summary[metric].pct < min)
    .map(([metric, min]) => `${metric}: ${summary[metric].pct}% < ${min}%`);
  if (failures.length > 0) {
    console.error(
      `Coverage gate (${suite}) failed:\n  ${failures.join("\n  ")}`,
    );
    process.exit(1);
  }
}

if (suite === "e2e") {
  writeMapped(mappedOutput.e2e, await mapRaw(rawInput.e2e));
  process.exit(0);
}

let all;
if (suite === "contract") {
  const map = await mapRaw(rawInput.contract);
  writeMapped(mappedOutput.contract, map);
  all = absolute(map);
} else {
  const inputs = option("input");
  const dirs = inputs.length
    ? inputs
    : [mappedOutput.contract, mappedOutput.e2e];
  all = libCoverage.createCoverageMap({});
  for (const dir of dirs) {
    const file = path.join(dir, mappedFile);
    if (!fs.existsSync(file)) {
      console.error(`No coverage data found in ${dir}`);
      process.exit(1);
    }
    all.merge(absolute(JSON.parse(fs.readFileSync(file, "utf8"))));
  }
}

const measured = filtered(all, isMeasured);
const gated =
  suite === "contract"
    ? filtered(measured, (file) => !matches(contractExcluded, file))
    : measured;
report(gated, suite === "contract" ? "coverage" : "target/coverage-combined", [
  "lcovonly",
  "html",
  "text-summary",
]);

if (suite === "combined" && contractExcluded.length > 0) {
  console.log("Files that the contract gate leaves out (carried by E2E):");
  for (const file of measured
    .files()
    .filter((f) => matches(contractExcluded, f))) {
    const summary = measured.fileCoverageFor(file).toSummary().toJSON();
    console.log(
      `  ${path.relative(process.cwd(), file)}: ` +
        Object.keys(thresholds)
          .map((metric) => `${metric} ${summary[metric].pct}%`)
          .join(", "),
    );
  }
}
checkGate(suite, gated);
