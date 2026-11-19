import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { writeJsonDocument } from "../journey-mesh/packages/journey-plugin/dist/index.js";
import { buildResult } from "./write-result.mjs";

const base = { job: "nextcloud/server/66147", ref: "v0.2.0", sha: "abc", run: "https://example.test/run/1", now: new Date("2026-01-02T03:04:05Z") };
const execute = promisify(execFile);

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), "journey-result-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

// Use the tool's encoder to exercise its real disk format, including split summaries.
async function report(t, summary, { maxFileBytes = 5 * 1024 * 1024, summaryHref = "data/summary.json" } = {}) {
  const path = await directory(t);
  if (summary === undefined) return path;
  await writeJsonDocument({
    maxFileBytes,
    async write({ name, data }) {
      await mkdir(dirname(join(path, name)), { recursive: true });
      await writeFile(join(path, name), data);
      return { name, href: name };
    },
  }, { name: summaryHref, value: { kind: "suite", ...summary } });
  await writeFile(join(path, "manifest.json"), JSON.stringify({
    format: "journey-mesh/report", version: 1, kind: "suite",
    storage: { maxFileBytes }, summary: { href: summaryHref }, tests: { href: "data/tests.json" },
  }));
  return path;
}

test("exit 0 and an ok report succeed, and the tested stack is reported", async (t) => {
  const reportDir = await report(t, { ok: true, provenance: { stack: { pullRequest: 66147, services: [{ sourceSha: "f474116", version: "36.0.0 dev" }] } } });
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, true);
  assert.deepEqual(result.target, { pullRequest: 66147, sourceSha: "f474116", version: "36.0.0 dev" });
  assert.equal(result.finishedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(result.error, undefined);
});

test("a failing report is a published failure, not an error", async (t) => {
  const result = await buildResult({ ...base, exitCode: 1, reportDir: await report(t, { ok: false }) });
  assert.equal(result.succeeded, false);
  assert.equal(result.error, undefined);
  assert.equal(result.target, undefined);
});

test("a missing report fails with a reason", async (t) => {
  const result = await buildResult({ ...base, exitCode: 2, reportDir: await report(t, undefined) });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /no complete report \(exit 2\)/);
});

test("journey-mesh that never ran cannot reuse a previous successful report", async (t) => {
  const result = await buildResult({ ...base, exitCode: undefined, reportDir: await report(t, { ok: true, target: { version: "stale" } }) });
  assert.equal(result.succeeded, false);
  assert.equal(result.error, "journey-mesh did not run");
  assert.equal(result.target, undefined);
});

test("an unreadable manifest fails with a reason", async (t) => {
  const reportDir = await report(t, { ok: true });
  await writeFile(join(reportDir, "manifest.json"), "{not json");
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /unreadable report/);
});

test("exit 0 never succeeds without ok:true, and a nonzero exit never succeeds with it", async (t) => {
  assert.equal((await buildResult({ ...base, exitCode: 0, reportDir: await report(t, { ok: false }) })).succeeded, false);
  const invalid = await buildResult({ ...base, exitCode: 0, reportDir: await report(t, {}) });
  assert.equal(invalid.succeeded, false);
  assert.match(invalid.error, /Invalid suite report summary/);
  const mismatch = await buildResult({ ...base, exitCode: 1, reportDir: await report(t, { ok: true }) });
  assert.equal(mismatch.succeeded, false);
  assert.match(mismatch.error, /exited 1/);
});

test("the mesh-selected installed target takes precedence over the hosting server", async (t) => {
  const target = { repository: 'https://github.com/nextcloud/collectives.git', pullRequest: 2945, sourceSha: 'a'.repeat(40), version: '4.8.0' };
  const result = await buildResult({ ...base, exitCode: 0, reportDir: await report(t, { ok: true, target, provenance: { stack: { services: [{ version: '35.0.2' }] } } }) });
  assert.deepEqual(result.target, target);
  assert.equal(result.succeeded, true);
});

test("the manifest's summary reference is decoded even when split across files", async (t) => {
  const target = { pullRequest: 2945, sourceSha: "a".repeat(40), version: "4.8.0" };
  const summaryHref = "data/custom-summary.json";
  const reportDir = await report(t, { ok: true, target, provenance: { samples: Array.from({ length: 1000 }, (_, i) => i) } }, { maxFileBytes: 512, summaryHref });
  assert.equal(JSON.parse(await readFile(join(reportDir, summaryHref), "utf8")).kind, "concat");
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, true);
  assert.deepEqual(result.target, target);
});

test("a summary and legacy bundle without a committed manifest cannot pass", async (t) => {
  const reportDir = await report(t, { ok: true });
  await rm(join(reportDir, "manifest.json"));
  await writeFile(join(reportDir, "bundle.json"), JSON.stringify({ ok: true }));
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /no complete report/);
});

test("unsupported manifests and inconsistent summaries fail", async (t) => {
  for (const override of [{ format: "other" }, { version: 2 }, { kind: "comparison" }]) {
    const reportDir = await report(t, { ok: true });
    const path = join(reportDir, "manifest.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...manifest, ...override }));
    const result = await buildResult({ ...base, exitCode: 0, reportDir });
    assert.equal(result.succeeded, false);
    assert.match(result.error, /Expected a Journey Mesh suite report manifest/);
  }
  const result = await buildResult({ ...base, exitCode: 0, reportDir: await report(t, { kind: "comparison", ok: true }) });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /Invalid suite report summary/);
});

test("a missing summary chunk fails with a reason", async (t) => {
  const reportDir = await report(t, { ok: true });
  await writeFile(join(reportDir, "data/summary.json"), JSON.stringify({
    format: "journey-mesh/json-document", version: 1, kind: "concat", collection: "object", parts: [{ href: "data/missing.json" }],
  }));
  const result = await buildResult({ ...base, exitCode: 0, reportDir });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /no complete report/);
});

test("report references cannot escape the evidence directory", async (t) => {
  const reportDir = await report(t, { ok: true });
  const other = await report(t, { ok: true });
  for (const href of ["../outside.json", "data/outside.json"]) {
    if (href === "data/outside.json") await symlink(join(other, "data/summary.json"), join(reportDir, href));
    await writeFile(join(reportDir, "manifest.json"), JSON.stringify({
      format: "journey-mesh/report", version: 1, kind: "suite", summary: { href },
    }));
    const result = await buildResult({ ...base, exitCode: 0, reportDir });
    assert.equal(result.succeeded, false);
    assert.match(result.error, /relative evidence path|escapes the report directory/);
  }
});

test("run-job publishes results and propagates success, failures, and stale-report rejection", async (t) => {
  for (const scenario of [
    { name: "pass", summary: { ok: true }, exit: 0, succeeded: true },
    { name: "failed journeys", summary: { ok: false }, exit: 1, succeeded: false },
    { name: "nonzero exit with an ok report", summary: { ok: true }, exit: 1, succeeded: false, error: /exited 1/ },
    { name: "no new report", exit: 0, succeeded: false, error: /no complete report/ },
    { name: "setup failed", setupFailed: true, exit: 1, succeeded: false, error: /did not run/ },
  ]) {
    await t.test(scenario.name, async (t) => {
      const root = await directory(t);
      await mkdir(join(root, "scripts"));
      for (const file of ["run-job.sh", "write-result.mjs"]) await copyFile(new URL(file, import.meta.url), join(root, "scripts", file));
      if (scenario.setupFailed) await mkdir(join(root, "journey-mesh"));
      else await symlink(fileURLToPath(new URL("../journey-mesh", import.meta.url)), join(root, "journey-mesh"));
      await mkdir(join(root, "jobs/check"), { recursive: true });
      await writeFile(join(root, "jobs/check/job.json"), JSON.stringify({ mesh: "check.mesh.yaml" }));
      await writeFile(join(root, "jobs/check/check.mesh.yaml"), "kind: suite\n");
      const out = join(root, "jobs/check/out");
      await cp(await report(t, { ok: true }), out, { recursive: true });
      await writeFile(join(out, "bundle.json"), JSON.stringify({ ok: true }));
      const fixture = await report(t, scenario.summary);
      await mkdir(join(root, "bin"));
      await writeFile(join(root, "bin/pnpm"), `#!/usr/bin/env node
import { cpSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.FIXTURE_SETUP_FAILED) process.exit(1);
if (args[0] !== "exec" || args[1] !== "journey-mesh" || args[2] !== "test") process.exit(99);
if (process.env.FIXTURE_WRITE_REPORT) cpSync(process.env.FIXTURE_REPORT, args[args.indexOf("--output") + 1], { recursive: true });
process.exit(Number(process.env.FIXTURE_EXIT));
`, { mode: 0o755 });
      await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
      const resultPath = join(root, "result.json");
      let exit = 0;
      try {
        await execute("bash", [join(root, "scripts/run-job.sh"), "check"], { cwd: root, timeout: 30000, env: {
          ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, OUT: out, RESULT: resultPath,
          SKIP_SETUP: scenario.setupFailed ? "" : "1", JOURNEY_MESH_REF: base.ref, GITHUB_RUN_ID: "",
          FIXTURE_REPORT: fixture, FIXTURE_WRITE_REPORT: scenario.summary ? "1" : "", FIXTURE_EXIT: String(scenario.exit),
          FIXTURE_SETUP_FAILED: scenario.setupFailed ? "1" : "",
        } });
      } catch (error) {
        if (error.code !== 1) throw error;
        exit = error.code;
      }
      assert.equal(exit, scenario.succeeded ? 0 : 1);
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      assert.equal(result.succeeded, scenario.succeeded);
      if (scenario.error) assert.match(result.error, scenario.error);
    });
  }
});
