import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSyntheticPredictions, evaluate, exportPrompts, formatMarkdown, normalizeAnswer, parseJSONL, validateDataset, validatePredictions } from '../src/index.js';

const dataset = JSON.parse(await readFile(new URL('../dataset/tasks.json', import.meta.url), 'utf8'));
const complete = () => dataset.tasks.map((task) => ({ id: task.id, response: task.kind === 'human' ? 'ئۈلگە جاۋاب.' : task.accepted[0] }));

test('bundled task set validates with explicit draft provenance and 32/8 split', () => {
  assert.deepEqual(validateDataset(dataset), { valid: true, errors: [], counts: { tasks: 40, automatic: 32, human: 8 } });
  assert.equal(dataset.dataset_status, 'draft');
  assert.equal(dataset.expert_reviewed, false);
  assert.equal(dataset.license, 'CC0-1.0');
  assert.match(dataset.provenance.origin, /Original/);
  for (const task of dataset.tasks.filter((task) => task.id.startsWith('count-'))) {
    const text = task.prompt.match(/«([^»]+)»/)[1];
    assert.equal(task.accepted[0], String(Array.from(text).length));
  }
});

test('normalization supports canonical equivalence and line endings without collapsing Uyghur letters', () => {
  assert.equal(normalizeAnswer(' e\u0301\r\n'), 'é');
  for (const letter of ['ئ', 'ە', 'ھ', 'ڭ', 'ۆ', 'ۈ', 'ې']) assert.equal(normalizeAnswer(letter), letter);
  assert.notEqual(normalizeAnswer('ھ'), normalizeAnswer('ه'));
  assert.notEqual(normalizeAnswer('ە'), normalizeAnswer('ه'));
  assert.equal(normalizeAnswer('ئا\u200c'), 'ئا\u200c');
  assert.equal(normalizeAnswer('سَلام'), 'سَلام');
  assert.equal(normalizeAnswer(' A ', { trim: false }), ' A ');
  assert.equal(normalizeAnswer('A', { caseInsensitive: true }), 'a');
  assert.throws(() => normalizeAnswer(null), TypeError);
});

test('JSONL supports a BOM and blank lines, with line-specific parse errors', () => {
  assert.deepEqual(parseJSONL('\uFEFF{"id":"copy-01","response":"ئۇيغۇر"}\r\n\n'), [{ id: 'copy-01', response: 'ئۇيغۇر' }]);
  assert.throws(() => parseJSONL('\nnot JSON\n{}\ninvalid'), (error) => error.code === 'INVALID_JSONL' && error.issues[0].includes('Line 2') && error.issues[1].includes('Line 4'));
});

test('complete automatic answer keys score fully while eight human responses remain pending', () => {
  const report = evaluate(dataset, complete(), { label: 'Test fixture' });
  assert.equal(report.automatic.correct, 32);
  assert.equal(report.automatic.total, 32);
  assert.equal(report.automatic.accuracy, 1);
  assert.equal(report.human.pending, 8);
  assert.equal(report.human.submitted, 8);
  assert.equal(report.items.filter((item) => item.status === 'pending_review').length, 8);
  assert.ok(report.warnings.some((warning) => warning.includes('not received expert review')));
});

test('missing answers stay in automatic denominator; missing human answers are counted separately', () => {
  const report = evaluate(dataset, [{ id: 'copy-01', response: 'ئۇيغۇر' }]);
  assert.equal(report.automatic.correct, 1);
  assert.equal(report.automatic.total, 32);
  assert.equal(report.automatic.missing, 31);
  assert.equal(report.automatic.accuracy, 1 / 32);
  assert.equal(report.human.missing, 8);
  assert.equal(report.human.pending, 0);
  assert.equal(evaluate(dataset, []).automatic.accuracy, 0);
});

test('human-only task sets have no automatic accuracy and never silently score references', () => {
  const humanOnly = { ...dataset, tasks: dataset.tasks.filter((task) => task.kind === 'human') };
  const predictions = humanOnly.tasks.map((task) => ({ id: task.id, response: task.reference_answer }));
  const report = evaluate(humanOnly, predictions);
  assert.equal(report.automatic.total, 0);
  assert.equal(report.automatic.accuracy, null);
  assert.equal(report.human.pending, 8);
});

test('wrong distinct letters do not pass, while choice labels are case-insensitive by task rule', () => {
  const report = evaluate(dataset, [{ id: 'preserve-01', response: 'ه' }, { id: 'choice-01', response: 'a' }]);
  assert.equal(report.items.find((item) => item.id === 'preserve-01').status, 'incorrect');
  assert.equal(report.items.find((item) => item.id === 'choice-01').status, 'correct');
});

test('duplicate, extra, malformed and oversized records fail before scoring', () => {
  const rows = [{ id: 'copy-01', response: 'ئۇيغۇر' }, { id: 'copy-01', response: 'wrong' }, { id: 'unknown-id', response: '' }, { id: 'copy-02', response: 12 }, null];
  const validation = validatePredictions(dataset, rows);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length, 4);
  assert.throws(() => evaluate(dataset, rows), (error) => error.code === 'INVALID_SUBMISSION' && error.issues.length === 4);
  assert.equal(validatePredictions(dataset, [{ id: 'copy-01', response: 'x'.repeat(100001) }]).valid, false);
  assert.equal(validatePredictions(dataset, [{ id: 'copy-01', response: '', source: 1 }]).valid, false);
});

test('invalid dataset kinds, keys, references and normalization are reported', () => {
  const invalid = structuredClone(dataset);
  invalid.tasks[1].id = invalid.tasks[0].id;
  invalid.tasks[0].accepted = [12];
  invalid.tasks[2].normalization = { removeHamza: true };
  invalid.tasks.at(-1).rubric = [];
  invalid.tasks.find((task) => task.kind === 'multiple_choice').accepted = ['D'];
  const validation = validateDataset(invalid);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length, 5);
  assert.throws(() => evaluate(invalid, []), (error) => error.code === 'INVALID_DATASET');
});

test('category names cannot mutate Object.prototype', () => {
  const custom = { ...dataset, tasks: [{ ...dataset.tasks[0], category: '__proto__' }] };
  const report = evaluate(custom, [{ id: 'copy-01', response: 'ئۇيغۇر' }]);
  assert.equal(report.categories.__proto__.correct, 1);
  assert.equal({}.correct, undefined);
});

test('synthetic fixtures are explicitly marked and produce reproducible results', () => {
  const a = createSyntheticPredictions(dataset);
  assert.deepEqual(a, createSyntheticPredictions(dataset));
  assert.ok(a.every((row) => row.source === 'synthetic-fixture'));
  const report = evaluate(dataset, a, { label: 'Synthetic demonstration' });
  assert.equal(report.automatic.correct, 24);
  assert.equal(report.submission.synthetic, true);
  assert.ok(report.warnings.some((warning) => warning.includes('not model performance')));
});
test('synthetic multiple-choice responses stay valid when every label is accepted', () => {
  const custom = {
    ...dataset,
    tasks: [dataset.tasks[0], {
      id: 'all-correct', category: 'custom', kind: 'multiple_choice', prompt: 'Choose either accepted label.',
      choices: { A: 'First', B: 'Second' }, accepted: ['A', 'B'],
    }, dataset.tasks.find((task) => task.kind === 'human')],
  };
  assert.equal(validateDataset(custom).valid, true);
  const rows = createSyntheticPredictions(custom);
  assert.equal(typeof rows[1].response, 'string');
  assert.equal(validatePredictions(custom, rows).valid, true);
  const report = evaluate(custom, rows);
  assert.equal(report.items[1].status, 'incorrect');
  assert.equal(report.automatic.total, 2);
  assert.equal(report.human.pending, 1);
});
test('deliberately wrong fixtures respect normalization and avoid accepted marker strings', () => {
  const equivalentChoices = {
    id: 'case-labels', category: 'custom', kind: 'multiple_choice', prompt: 'Choose a label.',
    choices: { A: 'First', a: 'Second' }, accepted: ['A'], normalization: { caseInsensitive: true },
  };
  const marker = '[deliberately incorrect fixture]';
  const markerTask = { id: 'marker', category: 'custom', kind: 'exact', prompt: 'Return a marker.', accepted: [marker, marker + '!'] };
  for (const task of [equivalentChoices, markerTask]) {
    const custom = { ...dataset, tasks: [dataset.tasks[0], task] };
    const rows = createSyntheticPredictions(custom);
    assert.equal(validatePredictions(custom, rows).valid, true);
    assert.equal(evaluate(custom, rows).items[1].status, 'incorrect');
  }
});

test('prompt exports omit automatic keys and human reference translations', () => {
  const exported = exportPrompts(dataset);
  assert.equal(exported.length, 40);
  for (const task of exported) {
    assert.equal(Object.hasOwn(task, 'accepted'), false);
    assert.equal(Object.hasOwn(task, 'reference_answer'), false);
    assert.ok(task.prompt);
  }
});

test('Markdown contains auditable task results, human queue and escaped table content', () => {
  const rows = complete();
  rows[0].response = '<script>|test\nline';
  const markdown = formatMarkdown(evaluate(dataset, rows, { label: '<b>|label' }));
  assert.match(markdown, /31\/32 correct/);
  assert.match(markdown, /8 pending/);
  assert.match(markdown, /&lt;script&gt;\\\|test line/);
  assert.match(markdown, /## Human review queue/);
  assert.match(markdown, /Draft reference:/);
  assert.doesNotMatch(markdown, /<script>/);
});

test('labels validate and unknown normalization options are rejected', () => {
  assert.throws(() => evaluate(dataset, [], { label: '' }), (error) => error.code === 'INVALID_LABEL');
  assert.throws(() => evaluate(dataset, [], { label: 'x'.repeat(201) }), (error) => error.code === 'INVALID_LABEL');
});
