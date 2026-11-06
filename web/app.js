import { createSyntheticPredictions, evaluate, formatMarkdown, parseJSONL, validateDataset } from '../src/index.js';
const $ = (id) => document.getElementById(id);
let dataset, report;
const labels = { correct: 'توغرا', incorrect: 'خاتا', missing: 'كەم قالغان', pending_review: 'ئادەم تەكشۈرىدۇ' };
const categoryLabels = { 'script-fidelity': 'ھەرپنى ساقلاش', 'text-handling': 'تېكىست بىر تەرەپ قىلىش', 'mixed-script': 'ئارىلاش يېزىق', 'unicode-fidelity': 'Unicode', reading: 'ئوقۇپ چۈشىنىش', 'script-awareness': 'يېزىقنى تونۇش', translation: 'تەرجىمە', writing: 'يېزىش', summarization: 'خۇلاسىلەش' };
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function showError(error) {
  $('error-message').hidden = false;
  $('error-message').textContent = [error.message, ...(error.issues || [])].join('\n');
  $('status-message').textContent = 'باھالىغىلى بولمىدى. خاتالىقلارنى تۈزىتىپ قايتا سىناڭ.';
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = node('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderTasks() {
  if (!report) return;
  const filter = $('result-filter').value;
  const rows = report.items.filter((item) => filter === 'all' || item.status === filter);
  const fragment = document.createDocumentFragment();
  rows.forEach((item) => {
    const detail = node('details', undefined, 'task');
    const summary = node('summary');
    summary.append(node('bdi', item.id, 'task-id'), node('span', categoryLabels[item.category] || item.category, 'task-category'), node('span', labels[item.status], `task-state ${item.status}`));
    detail.append(summary, node('p', item.prompt, 'task-prompt'));
    detail.append(node('h4', 'جاۋاب'), node('pre', item.response === null ? 'جاۋاب كىرگۈزۈلمىگەن.' : item.response || '[قۇرۇق جاۋاب]'));
    detail.lastChild.dir = 'auto';
    if (item.accepted) {
      detail.append(node('h4', 'كۈتۈلگەن جاۋاب'), node('pre', item.accepted.join(' / ')));
      detail.lastChild.dir = 'auto';
    } else {
      detail.append(node('h4', 'لايىھە ئۈلگە جاۋاب'), node('p', item.reference, 'reference'));
      const list = node('ul', undefined, 'rubric');
      item.rubric.forEach((criterion) => list.append(node('li', criterion)));
      detail.append(node('h4', 'ئادەم تەكشۈرۈش ئۆلچىمى'), list);
    }
    fragment.append(detail);
  });
  $('task-results').replaceChildren(fragment);
  $('filter-empty').hidden = rows.length > 0;
}
function renderReport() {
  $('empty-state').hidden = true;
  $('report').hidden = false;
  $('task-section').hidden = false;
  $('report-label').textContent = report.submission.label;
  $('report-source').textContent = report.submission.synthetic ? 'ياسالما ئۈلگە / SYNTHETIC' : 'كىرگۈزۈلگەن جاۋابلار';
  $('report-source').classList.toggle('synthetic', report.submission.synthetic);
  $('automatic-score').textContent = report.automatic.accuracy === null ? '—' : `${(report.automatic.accuracy * 100).toFixed(1)}%`;
  $('automatic-fraction').textContent = `${report.automatic.correct} / ${report.automatic.total} توغرا`;
  $('human-pending').textContent = report.human.pending;
  $('missing-count').textContent = `${report.automatic.missing} ئاپتوماتىك، ${report.human.missing} ئادەم سوئالى كەم`;
  const warning = report.submission.synthetic ? 'بۇ ياسالما ئۈلگە يۇمشاق دېتالنىڭ ئىشلىشىنى كۆرسىتىدۇ؛ ھەقىقىي مودېل نەتىجىسى ئەمەس.' : 'بۇ لايىھە توپلام مۇتەخەسسىس تەكشۈرۈشىدىن ئۆتمىگەن. نەتىجە ئومۇمىي تىل ئىقتىدارىنى ئىسپاتلىمايدۇ.';
  $('report-warnings').textContent = warning;
  $('category-rows').replaceChildren(...Object.entries(report.categories).map(([category, result]) => {
    const row = node('tr');
    row.append(node('th', categoryLabels[category] || category), node('td', `${result.correct} / ${result.automatic}`), node('td', result.pendingHuman));
    row.firstChild.scope = 'row';
    return row;
  }));
  renderTasks();
  $('status-message').textContent = `باھالاش تاماملاندى. ${report.automatic.correct} ئاپتوماتىك جاۋاب توغرا، ${report.human.pending} جاۋاب ئادەم تەكشۈرۈشىنى كۈتىدۇ.`;
}
$('score-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!dataset) return;
  $('error-message').hidden = true;
  try {
    const text = $('prediction-input').value;
    if (text.length > 5000000) throw new Error('Input exceeds the 5 MB playground limit. Use the local CLI for larger files.');
    report = evaluate(dataset, parseJSONL(text), { label: $('submission-label').value });
    renderReport();
  } catch (error) {
    report = undefined;
    $('report').hidden = true;
    $('task-section').hidden = true;
    $('empty-state').hidden = false;
    showError(error);
  }
});
$('load-sample').addEventListener('click', () => {
  if (!dataset) return;
  $('prediction-input').value = createSyntheticPredictions(dataset).map((row) => JSON.stringify(row)).join('\n');
  $('submission-label').value = 'Synthetic software demonstration';
  $('error-message').hidden = true;
  $('status-message').textContent = 'ياسالما ئۈلگە يۈكلەندى. بۇ ھەقىقىي مودېل جاۋابى ئەمەس.';
});
$('prediction-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5000000) { showError(new Error('File exceeds the 5 MB playground limit.')); return; }
  try {
    $('prediction-input').value = await file.text();
    $('submission-label').value = file.name.slice(0, 200);
    $('error-message').hidden = true;
    $('status-message').textContent = 'ھۆججەت يەرلىك يۈكلەندى؛ ھېچقانداق مۇلازىمېتىرغا ئەۋەتىلمىدى.';
  } catch (error) { showError(error); }
});
$('result-filter').addEventListener('change', renderTasks);
$('download-json').addEventListener('click', () => { if (report) download('uyghur-eval-report.json', JSON.stringify(report, null, 2) + '\n', 'application/json;charset=utf-8'); });
$('download-markdown').addEventListener('click', () => { if (report) download('uyghur-eval-report.md', formatMarkdown(report), 'text/markdown;charset=utf-8'); });
async function start() {
  try {
    const response = await fetch(new URL('../dataset/tasks.json', import.meta.url));
    if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
    dataset = await response.json();
    const check = validateDataset(dataset);
    if (!check.valid) throw Object.assign(new Error('Dataset validation failed.'), { issues: check.errors });
    $('score-button').disabled = false;
    $('status-message').textContent = `${check.counts.tasks} لايىھە سوئال تەييار. ئۆز جاۋابىڭىزنى كىرگۈزۈڭ ياكى ئۈلگىنى سىناڭ.`;
  } catch (error) { showError(error); }
}
start();
