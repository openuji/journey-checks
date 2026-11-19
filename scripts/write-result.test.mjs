import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { writeRunRecord } from "../journey-mesh/packages/journey-run-record/dist/node.js";
import { buildResult } from "./write-result.mjs";

const base = { job: "nextcloud/server/pr66147", ref: "v0.3.0", sha: "abc", run: "https://example.test/run/1", now: new Date("2026-01-02T03:04:05Z") };
const execute = promisify(execFile);

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "journey-result-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

function testRecord(id, ok = true) {
  return {
    format: "journey-mesh/run/test", version: 1, id, ok,
    segments: [], views: {}, plan: { id: "plan", operations: [] },
    result: { ok, runId: "run", plan: { id: "plan" }, errors: [], assessments: [], executions: [], evidence: { executions: [] } },
    observers: [], observerErrors: [], files: [],
  };
}

// Use the tool's writer to exercise the v0.3.0 disk format and referenced test records.
async function runRecord(t, summary) {
  const path = await directory(t);
  if (summary === undefined) return path;
  await writeRunRecord(path, {
    startedAt: "2026-01-02T03:00:00.000Z", finishedAt: base.now.toISOString(),
    errors: [], provenance: {}, files: [], tests: [testRecord("browser", summary.ok)],
    ...summary,
  });
  return path;
}

async function updateJson(path, override) {
  await writeFile(path, JSON.stringify({ ...JSON.parse(await readFile(path, "utf8")), ...override }));
}

test("exit 0 and an ok run record succeed without a legacy manifest or rendered report", async (t) => {
  const reportDir = await runRecord(t, { ok: true, provenance: { stack: { pullRequest: 66147, services: [{ sourceSha: "f474116", version: "36.0.0 dev" }] } } });
  for (const href of ["manifest.json", "report/report.json"]) await assert.rejects(readFile(join(reportDir, href)), { code: "ENOENT" });
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, true);
  assert.deepEqual(result.target, { pullRequest: 66147, sourceSha: "f474116", version: "36.0.0 dev" });
  assert.equal(result.finishedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(result.error, undefined);
});

test("a failing run record is a published failure, not an error", async (t) => {
  for (const exitCode of [0, 1]) {
    const result = await buildResult({ ...base, exitCode, reportDir: await runRecord(t, { ok: false }) });
    assert.equal(result.succeeded, false);
    assert.equal(result.error, undefined);
    assert.equal(result.target, undefined);
  }
});

test("a missing run record fails with a reason, even after exit 0", async (t) => {
  for (const exitCode of [0, 2]) {
    const result = await buildResult({ ...base, exitCode, reportDir: await runRecord(t, undefined) });
    assert.equal(result.succeeded, false);
    assert.equal(result.error, `journey-mesh produced no complete run record (exit ${exitCode})`);
  }
});

test("journey-mesh that never ran cannot reuse a previous successful run record", async (t) => {
  const result = await buildResult({ ...base, exitCode: undefined, reportDir: await runRecord(t, { ok: true, target: { version: "stale" } }) });
  assert.equal(result.succeeded, false);
  assert.equal(result.error, "journey-mesh did not run");
  assert.equal(result.target, undefined);
});

test("an unreadable run record fails with a reason", async (t) => {
  const reportDir = await runRecord(t, { ok: true });
  await writeFile(join(reportDir, "run.json"), "{not json");
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /unreadable run record/);
});

test("exit 0 never succeeds without a boolean ok verdict", async (t) => {
  for (const ok of [undefined, null, "true", 1]) {
    const invalid = await buildResult({ ...base, exitCode: 0, reportDir: await runRecord(t, { ok }) });
    assert.equal(invalid.succeeded, false);
    assert.match(invalid.error, /Invalid run record verdict/);
  }
});

test("execution and reporting errors never succeed with an ok run record", async (t) => {
  for (const exitCode of [1, 3]) {
    const result = await buildResult({ ...base, exitCode, reportDir: await runRecord(t, { ok: true }) });
    assert.equal(result.succeeded, false);
    assert.equal(result.error, `journey-mesh exited ${exitCode} although the run record says ok`);
  }
});

test("the mesh-selected installed target takes precedence over the hosting server", async (t) => {
  const target = { repository: "https://github.com/nextcloud/collectives.git", pullRequest: 2945, sourceSha: "a".repeat(40), version: "4.8.0" };
  const result = await buildResult({ ...base, exitCode: 0, reportDir: await runRecord(t, { ok: true, target, provenance: { stack: { services: [{ version: "35.0.2" }] } } }) });
  assert.deepEqual(result.target, target);
  assert.equal(result.succeeded, true);
});

test("multiple referenced test records are read from the completed run", async (t) => {
  const reportDir = await runRecord(t, { ok: true, tests: [testRecord("page.own"), testRecord("collective-member")] });
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, true);
  assert.equal(result.error, undefined);
});

test("legacy and rendered reports without a committed run record cannot pass", async (t) => {
  const reportDir = await runRecord(t, { ok: true });
  await rm(join(reportDir, "run.json"));
  await mkdir(join(reportDir, "report"));
  for (const href of ["bundle.json", "manifest.json", "report/report.json"]) {
    await writeFile(join(reportDir, href), JSON.stringify({ ok: true }));
  }
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /no complete run record/);
});

test("unsupported or malformed run indexes fail", async (t) => {
  for (const override of [{ format: "other" }, { version: 2 }, { tests: {} }]) {
    const reportDir = await runRecord(t, { ok: true });
    await updateJson(join(reportDir, "run.json"), override);
    const result = await buildResult({ ...base, exitCode: 0, reportDir });
    assert.equal(result.succeeded, false);
    assert.match(result.error, /Expected a Journey Mesh run record/);
  }
});

test("missing or invalid referenced test records fail even when the run index says ok", async (t) => {
  for (const override of [undefined, { format: "other" }, { version: 2 }, { id: "another-test" }]) {
    const reportDir = await runRecord(t, { ok: true });
    const path = join(reportDir, "tests/browser/run.json");
    if (override === undefined) await rm(path);
    else await updateJson(path, override);
    const result = await buildResult({ ...base, exitCode: 0, reportDir });
    assert.equal(result.succeeded, false);
    assert.match(result.error, override === undefined ? /no complete run record/ : /Invalid test record/);
  }
});

test("test record references cannot escape the evidence directory", async (t) => {
  const reportDir = await runRecord(t, { ok: true });
  const other = await runRecord(t, { ok: true });
  for (const href of ["../outside.json", "tests/outside.json"]) {
    if (href === "tests/outside.json") await symlink(join(other, "tests/browser/run.json"), join(reportDir, href));
    await updateJson(join(reportDir, "run.json"), { tests: [{ id: "browser", ok: true, href }] });
    const result = await buildResult({ ...base, exitCode: 0, reportDir });
    assert.equal(result.succeeded, false);
    assert.match(result.error, /Invalid run record reference|escapes the run directory/);
  }
});

test("run-job publishes results and propagates success, failures, and stale-run rejection", async (t) => {
  for (const scenario of [
    { name: "pass", summary: { ok: true }, exit: 0, succeeded: true },
    { name: "failed journeys", summary: { ok: false }, exit: 1, succeeded: false },
    { name: "nonzero exit with an ok record", summary: { ok: true }, exit: 1, succeeded: false, error: /exited 1/ },
    { name: "report failed after passing tests", summary: { ok: true }, exit: 3, succeeded: false, error: /exited 3/ },
    { name: "no new run record", exit: 0, succeeded: false, error: /no complete run record/ },
    { name: "validation failed", exit: 2, succeeded: false, error: /no complete run record/ },
    { name: "setup failed", setupFailed: true, exit: 1, succeeded: false, error: /did not run/ },
  ]) {
    await t.test(scenario.name, async (t) => {
      const root = await directory(t);
      await mkdir(join(root, "scripts"));
      for (const file of ["run-job.sh", "write-result.mjs"]) await copyFile(new URL(file, import.meta.url), join(root, "scripts", file));
      if (scenario.setupFailed) await mkdir(join(root, "journey-mesh"));
      else await symlink(fileURLToPath(new URL("../journey-mesh", import.meta.url)), join(root, "journey-mesh"));
      const jobdir = join(root, "jobs", base.job);
      await mkdir(jobdir, { recursive: true });
      await writeFile(join(jobdir, "check.mesh.yaml"), "kind: suite\n");
      const out = join(jobdir, "out");
      await cp(await runRecord(t, { ok: true }), out, { recursive: true });
      await mkdir(join(out, "report"));
      for (const href of ["manifest.json", "bundle.json", "report/report.json"]) {
        await writeFile(join(out, href), JSON.stringify({ ok: true }));
      }
      const fixture = await runRecord(t, scenario.summary);
      await mkdir(join(root, "bin"));
      await writeFile(join(root, "bin/pnpm"), `#!/usr/bin/env node
import { cpSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.FIXTURE_SETUP_FAILED) process.exit(1);
if (args[0] !== "exec" || args[1] !== "journey-mesh" || args[2] !== "test") process.exit(99);
if (args[3] !== "jobs/${base.job}/check.mesh.yaml" || args.includes("--test")) process.exit(99);
if (process.env.FIXTURE_WRITE_RECORD) cpSync(process.env.FIXTURE_RECORD, args[args.indexOf("--output") + 1], { recursive: true });
process.exit(Number(process.env.FIXTURE_EXIT));
`, { mode: 0o755 });
      await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
      const resultPath = join(root, "site-part", `${base.job}.json`);
      let exit = 0;
      try {
        await execute("bash", [join(root, "scripts/run-job.sh"), base.job], { cwd: root, timeout: 30000, env: {
          ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, OUT: "", RESULT: "",
          SKIP_SETUP: scenario.setupFailed ? "" : "1", JOURNEY_MESH_REF: base.ref, GITHUB_RUN_ID: "",
          FIXTURE_RECORD: fixture, FIXTURE_WRITE_RECORD: scenario.summary ? "1" : "", FIXTURE_EXIT: String(scenario.exit),
          FIXTURE_SETUP_FAILED: scenario.setupFailed ? "1" : "",
        } });
      } catch (error) {
        if (error.code !== 1) throw error;
        exit = error.code;
      }
      assert.equal(exit, scenario.succeeded ? 0 : 1);
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      assert.equal(result.job, base.job);
      assert.equal(result.succeeded, scenario.succeeded);
      if (scenario.error) assert.match(result.error, scenario.error);
      else assert.equal(result.error, undefined);
      for (const href of ["manifest.json", "bundle.json", "report/report.json", ...(!scenario.summary ? ["run.json"] : [])]) {
        await assert.rejects(readFile(join(out, href)), { code: "ENOENT" });
      }
    });
  }
});
