/** Offline, provider-neutral scoring. Uyghur letters and marks are preserved. */
export class EvaluationError extends Error {
  constructor(message, code, issues = []) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
    this.issues = issues;
  }
}

export function normalizeAnswer(value, { trim = true, caseInsensitive = false } = {}) {
  if (typeof value !== 'string') throw new TypeError('Answers must be strings.');
  let text = value.normalize('NFC').replace(/\r\n?/g, '\n');
  if (trim) text = text.trim();
  // Case folding is opt-in and used only for ASCII answer labels in this set.
  if (caseInsensitive) text = text.toLowerCase();
  return text;
}

export function parseJSONL(text) {
  if (typeof text !== 'string') throw new TypeError('JSONL input must be text.');
  const rows = [];
  const errors = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try { rows.push(JSON.parse(line)); }
    catch (_) { errors.push(`Line ${index + 1}: invalid JSON.`); }
  });
  if (errors.length) throw new EvaluationError('Submission contains malformed JSONL.', 'INVALID_JSONL', errors);
  return rows;
}

export function validateDataset(dataset) {
  const errors = [];
  const counts = { tasks: 0, automatic: 0, human: 0 };
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) return { valid: false, errors: ['Dataset must be an object.'], counts };
  for (const key of ['id', 'version', 'dataset_status', 'language', 'license']) {
    if (typeof dataset[key] !== 'string' || !dataset[key].trim()) errors.push(`Dataset ${key} must be a nonempty string.`);
  }
  if (!Array.isArray(dataset.tasks) || !dataset.tasks.length) return { valid: false, errors: [...errors, 'Dataset tasks must be a nonempty array.'], counts };
  const ids = new Set();
  dataset.tasks.forEach((task, index) => {
    const prefix = `Task ${index + 1}`;
    if (!task || typeof task !== 'object' || Array.isArray(task)) { errors.push(`${prefix} must be an object.`); return; }
    if (typeof task.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(task.id)) errors.push(`${prefix}: invalid id.`);
    if (ids.has(task.id)) errors.push(`${prefix}: duplicate id ${task.id}.`);
    ids.add(task.id);
    if (typeof task.prompt !== 'string' || !task.prompt.trim()) errors.push(`${prefix}: prompt is required.`);
    if (typeof task.category !== 'string' || !task.category.trim()) errors.push(`${prefix}: category is required.`);
    if (!['exact', 'multiple_choice', 'human'].includes(task.kind)) errors.push(`${prefix}: unsupported kind.`);
    if (task.kind === 'human') {
      counts.human++;
      if (!Array.isArray(task.rubric) || !task.rubric.length || task.rubric.some((item) => typeof item !== 'string' || !item.trim())) errors.push(`${prefix}: human tasks need rubric criteria.`);
      if (typeof task.reference_answer !== 'string' || !task.reference_answer.trim()) errors.push(`${prefix}: a draft reference answer is required.`);
    } else if (task.kind === 'exact' || task.kind === 'multiple_choice') {
      counts.automatic++;
      if (!Array.isArray(task.accepted) || !task.accepted.length || task.accepted.some((answer) => typeof answer !== 'string')) errors.push(`${prefix}: accepted must contain strings.`);
      if (task.kind === 'multiple_choice') {
        if (!task.choices || typeof task.choices !== 'object' || Array.isArray(task.choices) || Object.keys(task.choices).length < 2) errors.push(`${prefix}: multiple-choice tasks need choices.`);
        else {
          if (Object.values(task.choices).some((choice) => typeof choice !== 'string' || !choice.trim())) errors.push(`${prefix}: choices must contain nonempty string values.`);
          if (Array.isArray(task.accepted) && task.accepted.some((answer) => !Object.hasOwn(task.choices, answer))) errors.push(`${prefix}: accepted label does not exist in choices.`);
        }
      }
    }
    if (task.normalization !== undefined) {
      if (!task.normalization || typeof task.normalization !== 'object' || Array.isArray(task.normalization)) errors.push(`${prefix}: invalid normalization options.`);
      else for (const [key, value] of Object.entries(task.normalization)) {
        if (!['trim', 'caseInsensitive'].includes(key) || typeof value !== 'boolean') errors.push(`${prefix}: invalid normalization setting ${key}.`);
      }
    }
  });
  counts.tasks = dataset.tasks.length;
  return { valid: errors.length === 0, errors, counts };
}

export function validatePredictions(dataset, predictions) {
  const errors = [];
  if (!Array.isArray(predictions)) return { valid: false, errors: ['Predictions must be an array.'] };
  const known = new Set(dataset.tasks.map((task) => task.id));
  const seen = new Set();
  predictions.forEach((row, index) => {
    const prefix = `Record ${index + 1}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${prefix}: expected an object.`); return; }
    if (typeof row.id !== 'string' || !row.id) errors.push(`${prefix}: id must be a nonempty string.`);
    else {
      if (seen.has(row.id)) errors.push(`${prefix}: duplicate id ${row.id}.`);
      seen.add(row.id);
      if (!known.has(row.id)) errors.push(`${prefix}: unknown id ${row.id}.`);
    }
    if (typeof row.response !== 'string') errors.push(`${prefix}: response must be a string.`);
    else if (row.response.length > 100000) errors.push(`${prefix}: response exceeds 100,000 characters.`);
    if (row.source !== undefined && typeof row.source !== 'string') errors.push(`${prefix}: source must be a string when supplied.`);
  });
  return { valid: errors.length === 0, errors };
}

export function evaluate(dataset, predictions, { label = 'Unnamed submission' } = {}) {
  const datasetCheck = validateDataset(dataset);
  if (!datasetCheck.valid) throw new EvaluationError('Dataset validation failed.', 'INVALID_DATASET', datasetCheck.errors);
  const submissionCheck = validatePredictions(dataset, predictions);
  if (!submissionCheck.valid) throw new EvaluationError('Submission validation failed.', 'INVALID_SUBMISSION', submissionCheck.errors);
  if (typeof label !== 'string' || !label.trim() || label.length > 200) throw new EvaluationError('Label must contain 1–200 characters.', 'INVALID_LABEL');
  const byId = new Map(predictions.map((row) => [row.id, row]));
  const automatic = { correct: 0, total: datasetCheck.counts.automatic, answered: 0, missing: 0, accuracy: null };
  const human = { total: datasetCheck.counts.human, submitted: 0, missing: 0, pending: 0 };
  const categories = Object.create(null);
  const items = dataset.tasks.map((task) => {
    const supplied = byId.has(task.id);
    const row = byId.get(task.id);
    const response = supplied ? row.response : null;
    const category = categories[task.category] ||= { correct: 0, automatic: 0, answered: 0, missing: 0, human: 0, pendingHuman: 0 };
    const base = { id: task.id, category: task.category, kind: task.kind, prompt: task.prompt, response };
    if (task.kind === 'human') {
      category.human++;
      if (supplied) { human.submitted++; human.pending++; category.pendingHuman++; }
      else human.missing++;
      return { ...base, status: supplied ? 'pending_review' : 'missing', reference: task.reference_answer, rubric: [...task.rubric] };
    }
    category.automatic++;
    if (!supplied) {
      automatic.missing++;
      category.missing++;
      return { ...base, status: 'missing', accepted: [...task.accepted] };
    }
    automatic.answered++;
    category.answered++;
    const normalized = normalizeAnswer(response, task.normalization);
    const correct = task.accepted.some((answer) => normalizeAnswer(answer, task.normalization) === normalized);
    if (correct) { automatic.correct++; category.correct++; }
    return { ...base, status: correct ? 'correct' : 'incorrect', accepted: [...task.accepted] };
  });
  automatic.accuracy = automatic.total ? automatic.correct / automatic.total : null;
  const synthetic = predictions.some((row) => row.source === 'synthetic-fixture');
  return {
    report_version: '1.0',
    dataset: { id: dataset.id, version: dataset.version, status: dataset.dataset_status, language: dataset.language, expert_reviewed: dataset.expert_reviewed === true },
    submission: { label: label.trim(), records: predictions.length, synthetic },
    automatic,
    human,
    categories,
    warnings: [
      ...(dataset.dataset_status === 'draft' || dataset.expert_reviewed !== true ? ['Draft dataset; language content and answer keys have not received expert review.'] : []),
      ...(synthetic ? ['Synthetic fixture results are software demonstrations, not model performance measurements.'] : []),
      'Missing automatic answers count as incorrect. Human-review tasks are excluded from automatic accuracy.',
      'This small public task set is not a comprehensive measure of Uyghur language ability.'
    ],
    items,
  };
}

function incorrectFixtureResponse(task) {
  const accepted = new Set(task.accepted.map((answer) => normalizeAnswer(answer, task.normalization)));
  if (task.kind === 'multiple_choice') {
    const label = Object.keys(task.choices).find((key) => !accepted.has(normalizeAnswer(key, task.normalization)));
    if (label !== undefined) return label;
  }
  // A valid custom task can accept every choice or even the usual marker.
  // Always return text that remains incorrect under that task's own rules.
  let response = '[deliberately incorrect fixture]';
  while (accepted.has(normalizeAnswer(response, task.normalization))) response += '!';
  return response;
}

export function createSyntheticPredictions(dataset) {
  const check = validateDataset(dataset);
  if (!check.valid) throw new EvaluationError('Dataset validation failed.', 'INVALID_DATASET', check.errors);
  return dataset.tasks.map((task, index) => ({
    id: task.id,
    response: task.kind === 'human' ? 'بۇ سىناق ئۈچۈن ياسالغان ئۈلگە جاۋاب.' : index % 4 === 1 ? incorrectFixtureResponse(task) : task.accepted[0],
    source: 'synthetic-fixture',
  }));
}

export function exportPrompts(dataset) {
  const check = validateDataset(dataset);
  if (!check.valid) throw new EvaluationError('Dataset validation failed.', 'INVALID_DATASET', check.errors);
  return dataset.tasks.map(({ id, category, kind, prompt, choices, rubric }) => ({ id, category, kind, prompt, ...(choices ? { choices } : {}), ...(rubric ? { rubric } : {}) }));
}

const cell = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function formatMarkdown(report) {
  const percent = report.automatic.accuracy === null ? 'N/A' : `${(report.automatic.accuracy * 100).toFixed(1)}%`;
  const lines = [
    '# Uyghur AI Eval report', '',
    `Submission: ${cell(report.submission.label)}`, '',
    `Dataset: ${cell(report.dataset.id)} v${cell(report.dataset.version)} (${cell(report.dataset.status)})`, '',
    `Automatic accuracy: **${percent}** — ${report.automatic.correct}/${report.automatic.total} correct; ${report.automatic.missing} missing.`, '',
    `Human review: **${report.human.pending} pending**; ${report.human.missing} missing. Human tasks are outside the automatic score.`, '',
    ...report.warnings.map((warning) => `- ${warning}`), '',
    '## Categories', '',
    '| Category | Correct / automatic | Missing automatic | Pending human |',
    '| --- | ---: | ---: | ---: |',
    ...Object.entries(report.categories).map(([name, row]) => `| ${cell(name)} | ${row.correct} / ${row.automatic} | ${row.missing} | ${row.pendingHuman} |`), '',
    '## Task results', '',
    '| ID | Status | Response | Expected automatic answer |',
    '| --- | --- | --- | --- |',
    ...report.items.map((item) => `| ${cell(item.id)} | ${item.status} | ${cell(item.response === null ? '[missing]' : item.response)} | ${cell(item.accepted?.join(' / ') ?? '[human review]')} |`), '',
    '## Human review queue', '',
  ];
  const pending = report.items.filter((item) => item.status === 'pending_review');
  if (!pending.length) lines.push('No submitted human-review responses.', '');
  pending.forEach((item) => {
    lines.push(`### ${cell(item.id)}`, '', cell(item.prompt), '', 'Response:', '', ...item.response.split('\n').map((line) => `    ${line}`), '', 'Draft reference:', '', ...item.reference.split('\n').map((line) => `    ${line}`), '', 'Review criteria:', '', ...item.rubric.map((criterion) => `- ${cell(criterion)}`), '');
  });
  return lines.join('\n');
}
