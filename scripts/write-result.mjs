#!/usr/bin/env node
// Turns one journey-mesh run into the published result:
//   { "job": "...", "succeeded": true|false, ... }
// A job succeeded only if journey-mesh exited 0 AND its bundle.json says ok.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

export async function buildResult({ job, exitCode, bundlePath, ref, sha, run, now = new Date() }) {
  const ran = Number.isInteger(exitCode);
  let bundle;
  let error;
  try {
    bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  } catch (cause) {
    error = !ran
      ? "journey-mesh did not run"
      : cause.code === "ENOENT"
        ? `journey-mesh produced no bundle.json (exit ${exitCode})`
        : `unreadable bundle.json: ${cause.message}`;
  }
  const succeeded = ran && exitCode === 0 && bundle?.ok === true;
  if (!error && !succeeded && bundle?.ok === true) error = `journey-mesh exited ${exitCode} although the bundle reports ok`;

  // The tested stack, when journey-mesh recorded one (e.g. the PR's head commit).
  const stack = bundle?.provenance?.stack;
  const service = stack?.services?.[0];
  const target = stack && {
    ...(stack.pullRequest !== undefined && { pullRequest: stack.pullRequest }),
    ...(service?.sourceSha && { sourceSha: service.sourceSha }),
    ...(service?.version && { version: service.version }),
  };

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
      bundle: { type: "string" },
      out: { type: "string" },
      ref: { type: "string" },
      sha: { type: "string", default: "" },
      run: { type: "string", default: "" },
    },
  });
  for (const required of ["job", "bundle", "out", "ref"]) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  const result = await buildResult({
    job: values.job,
    exitCode: values.exit === "" ? undefined : Number(values.exit),
    bundlePath: values.bundle,
    ref: values.ref,
    sha: values.sha,
    run: values.run,
  });
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.succeeded ? "PASS" : "FAIL"} ${result.job}${result.error ? ` (${result.error})` : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
