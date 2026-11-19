#!/usr/bin/env node
// Turns one journey-mesh run into the published result:
//   { "job": "...", "succeeded": true|false, ... }
// A job succeeded only if journey-mesh exited 0 AND its completed run record says ok.
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

async function readRun(reportDir) {
  // run-job builds the checkout first. Load its reader only when reading a run,
  // so setup failures can still publish a result without a built tool.
  const { readRunRecord } = await import("../journey-mesh/packages/journey-run-record/dist/node.js");
  const record = await readRunRecord(reportDir);
  if (typeof record.ok !== "boolean") throw new Error("Invalid run record verdict");
  return record;
}

export async function buildResult({ job, exitCode, reportDir, ref, sha, run, now = new Date() }) {
  const ran = Number.isInteger(exitCode);
  let record;
  let error;
  if (!ran) error = "journey-mesh did not run";
  else {
    try {
      record = await readRun(reportDir);
    } catch (cause) {
      error = cause.code === "ENOENT"
        ? `journey-mesh produced no complete run record (exit ${exitCode})`
        : `unreadable run record: ${cause.message}`;
    }
  }
  const succeeded = ran && exitCode === 0 && record?.ok === true;
  if (!error && !succeeded && record?.ok === true) error = `journey-mesh exited ${exitCode} although the run record says ok`;

  // The tested stack, when journey-mesh recorded one (e.g. the PR's head commit).
  const stack = record?.provenance?.stack;
  const service = stack?.services?.[0];
  const target = record?.target ?? (stack && {
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
