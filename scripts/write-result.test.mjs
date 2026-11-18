import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildResult } from "./write-result.mjs";

const base = { job: "nextcloud/server/66147", ref: "v0.1.0", sha: "abc", run: "https://example.test/run/1", now: new Date("2026-01-02T03:04:05Z") };

async function bundle(content) {
  const path = join(await mkdtemp(join(tmpdir(), "result-")), "bundle.json");
  if (content !== undefined) await writeFile(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

test("exit 0 and an ok bundle succeed, and the tested stack is reported", async () => {
  const bundlePath = await bundle({ ok: true, provenance: { stack: { pullRequest: 66147, services: [{ sourceSha: "f474116", version: "36.0.0 dev" }] } } });
  const result = await buildResult({ ...base, exitCode: 0, bundlePath });
  assert.equal(result.succeeded, true);
  assert.deepEqual(result.target, { pullRequest: 66147, sourceSha: "f474116", version: "36.0.0 dev" });
  assert.equal(result.finishedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(result.error, undefined);
});

test("a failing bundle is a published failure, not an error", async () => {
  const result = await buildResult({ ...base, exitCode: 1, bundlePath: await bundle({ ok: false }) });
  assert.equal(result.succeeded, false);
  assert.equal(result.error, undefined);
  assert.equal(result.target, undefined);
});

test("a missing bundle fails with a reason", async () => {
  const result = await buildResult({ ...base, exitCode: 2, bundlePath: await bundle(undefined) });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /no bundle\.json \(exit 2\)/);
});

test("journey-mesh that never ran fails with a reason", async () => {
  const result = await buildResult({ ...base, exitCode: undefined, bundlePath: await bundle(undefined) });
  assert.equal(result.succeeded, false);
  assert.equal(result.error, "journey-mesh did not run");
});

test("an unreadable bundle fails with a reason", async () => {
  const result = await buildResult({ ...base, exitCode: 0, bundlePath: await bundle("{not json") });
  assert.equal(result.succeeded, false);
  assert.match(result.error, /unreadable bundle\.json/);
});

test("exit 0 never succeeds without ok:true, and a nonzero exit never succeeds with it", async () => {
  assert.equal((await buildResult({ ...base, exitCode: 0, bundlePath: await bundle({ ok: false }) })).succeeded, false);
  assert.equal((await buildResult({ ...base, exitCode: 0, bundlePath: await bundle({}) })).succeeded, false);
  const mismatch = await buildResult({ ...base, exitCode: 1, bundlePath: await bundle({ ok: true }) });
  assert.equal(mismatch.succeeded, false);
  assert.match(mismatch.error, /exited 1/);
});
