#!/usr/bin/env node
// Turns one journey-mesh run into the published result:
//   { "job": "...", "succeeded": true|false, ... }
// A job succeeded only if journey-mesh exited 0 AND its completed report says ok.
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

async function readSummary(reportDir) {
  const directory = await realpath(reportDir);
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  if (manifest?.format !== "journey-mesh/report" || manifest.version !== 1 || manifest.kind !== "suite") {
    throw new Error("Expected a Journey Mesh suite report manifest (version 1)");
  }
  // run-job builds the checkout first. Load its decoder only when reading a report,
  // so setup failures can still publish a result without a built tool.
  const { readJsonDocument, validateReportHref } = await import("../journey-mesh/packages/journey-plugin/dist/index.js");
  const read = async ({ href }) => {
    validateReportHref(href);
    const path = await realpath(resolve(directory, href));
    const child = relative(directory, path);
    if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      throw new Error("Report reference escapes the report directory");
    }
    return readFile(path);
  };
  const summary = await readJsonDocument(read, manifest.summary);
  if (summary?.kind !== "suite" || typeof summary.ok !== "boolean") throw new Error("Invalid suite report summary");
  return summary;
}

export async function buildResult({ job, exitCode, reportDir, ref, sha, run, now = new Date() }) {
  const ran = Number.isInteger(exitCode);
  let summary;
  let error;
  if (!ran) error = "journey-mesh did not run";
  else {
    try {
      summary = await readSummary(reportDir);
    } catch (cause) {
      error = cause.code === "ENOENT"
        ? `journey-mesh produced no complete report (exit ${exitCode})`
        : `unreadable report: ${cause.message}`;
    }
  }
  const succeeded = ran && exitCode === 0 && summary?.ok === true;
  if (!error && !succeeded && summary?.ok === true) error = `journey-mesh exited ${exitCode} although the report says ok`;

  // The tested stack, when journey-mesh recorded one (e.g. the PR's head commit).
  const stack = summary?.provenance?.stack;
  const service = stack?.services?.[0];
  const target = summary?.target ?? (stack && {
    ...(stack.pullRequest !== undefined && { pullRequest: stack.pullRequest }),
    ...(service?.sourceSha && { sourceSha: service.sourceSha }),
    ...(service?.version && { version: service.version }),
  });

  return {
    job,
    succeeded,
    finishedAt: now.toISOString(),
    ...(run && { run }),
    journeyMesh: { ref, ...(sha && { sha }) },
    ...(target && Object.keys(target).length && { target }),
    ...(error && { error }),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      job: { type: "string" },
      exit: { type: "string", default: "" },
      report: { type: "string" },
      out: { type: "string" },
      ref: { type: "string" },
      sha: { type: "string", default: "" },
      run: { type: "string", default: "" },
    },
  });
  for (const required of ["job", "report", "out", "ref"]) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  const result = await buildResult({
    job: values.job,
    exitCode: values.exit === "" ? undefined : Number(values.exit),
    reportDir: values.report,
    ref: values.ref,
    sha: values.sha,
    run: values.run,
  });
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.succeeded ? "PASS" : "FAIL"} ${result.job}${result.error ? ` (${result.error})` : ""}`);
}

const entryPoint = process.argv[1] && await realpath(process.argv[1]).catch(() => undefined);
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
