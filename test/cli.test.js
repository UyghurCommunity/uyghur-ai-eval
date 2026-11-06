import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../bin/ug-eval.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI validates the bundled dataset from an unrelated working directory', () => {
  const result = spawnSync(process.execPath, [cli, 'validate'], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /40 tasks; 32 automatic, 8 human-review/);
  assert.match(result.stdout, /Expert reviewed: no/);
});

test('CLI exports prompts, creates clearly synthetic predictions and writes JSON + Markdown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ug-eval-'));
  try {
    const predictions = join(dir, 'predictions.jsonl');
    const prefix = join(dir, 'nested', 'report');
    let result = run('sample', '--out', predictions);
    assert.equal(result.status, 0, result.stderr);
    const rows = (await readFile(predictions, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 40);
    assert.ok(rows.every((row) => row.source === 'synthetic-fixture'));
    result = run('score', predictions, '--label', 'Synthetic demo', '--out', prefix);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(`${prefix}.json`, 'utf8'));
    assert.equal(report.automatic.correct, 24);
    assert.equal(report.human.pending, 8);
    assert.equal(report.submission.synthetic, true);
    assert.match(await readFile(`${prefix}.md`, 'utf8'), /75.0%/);
    const prompts = run('tasks');
    assert.equal(prompts.status, 0);
    assert.doesNotMatch(prompts.stdout, /"accepted"|"reference_answer"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI produces actionable invalid submission and argument errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ug-eval-invalid-'));
  try {
    const input = join(dir, 'bad.jsonl');
    await writeFile(input, '{"id":"missing-task","response":"x"}\n');
    const result = run('score', input);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown id missing-task/);
    assert.equal(run('score').status, 2);
    assert.equal(run('validate', '--unknown').status, 2);
    assert.equal(run('sample', '--out').status, 2);
    assert.equal(run('validate', '--out', 'ignored').status, 2);
    assert.equal(run('validate', '--dataset', 'a', '--dataset', 'b').status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
