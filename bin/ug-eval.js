#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyntheticPredictions, evaluate, exportPrompts, formatMarkdown, parseJSONL, validateDataset } from '../src/index.js';

const bundledDataset = fileURLToPath(new URL('../dataset/tasks.json', import.meta.url));
const help = `Uyghur AI Eval — offline scoring for a transparent draft task set

Usage:
  ug-eval validate [--dataset path]
  ug-eval tasks [--dataset path] [--out prompts.jsonl]
  ug-eval sample [--dataset path] [--out predictions.jsonl]
  ug-eval score predictions.jsonl [--dataset path] [--label name] [--out reports/run]

Score writes <prefix>.json and <prefix>.md with --out; otherwise Markdown goes to stdout.
Tasks exports prompts without reference answers. Sample emits synthetic fixtures, never model results.
No model, account, API key, or network connection is required. Dataset v0.1.0 is not expert-reviewed.
`;

function argumentsFor(args) {
  const options = {}, positionals = [];
  const valid = new Set(['--dataset', '--out', '--label']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (!valid.has(arg)) throw new Error(`Unknown option ${arg}.`);
      if (Object.hasOwn(options, arg.slice(2))) throw new Error(`Repeated option ${arg}.`);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = args[++i];
    } else positionals.push(arg);
  }
  return { options, positionals };
}
async function save(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') { process.stdout.write(help); return; }
  if (!['validate', 'tasks', 'sample', 'score'].includes(command)) throw new Error(`Unknown command ${command}. Run ug-eval --help.`);
  const { options, positionals } = argumentsFor(args);
  if (command !== 'score' && positionals.length) throw new Error(`${command} accepts no positional file; use --dataset or --out.`);
  if (command === 'score' && positionals.length !== 1) throw new Error('score requires exactly one predictions.jsonl file.');
  if (command !== 'score' && options.label) throw new Error('--label is available only with score.');
  if (command === 'validate' && options.out) throw new Error('validate does not accept --out.');
  const dataset = JSON.parse(await readFile(options.dataset || bundledDataset, 'utf8'));
  const check = validateDataset(dataset);
  if (!check.valid) throw Object.assign(new Error('Dataset validation failed.'), { issues: check.errors });
  if (command === 'validate') {
    process.stdout.write(`Valid ${dataset.dataset_status} dataset: ${check.counts.tasks} tasks; ${check.counts.automatic} automatic, ${check.counts.human} human-review.\nExpert reviewed: ${dataset.expert_reviewed === true ? 'yes' : 'no'}.\n`);
    return;
  }
  if (command === 'tasks' || command === 'sample') {
    const rows = command === 'tasks' ? exportPrompts(dataset) : createSyntheticPredictions(dataset);
    const text = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
    if (options.out) { await save(options.out, text); process.stdout.write(`Wrote ${rows.length} ${command === 'tasks' ? 'prompts' : 'synthetic responses'} to ${options.out}.\n`); }
    else process.stdout.write(text);
    return;
  }
  const predictions = parseJSONL(await readFile(positionals[0], 'utf8'));
  const report = evaluate(dataset, predictions, { label: options.label || 'Unnamed submission' });
  const markdown = formatMarkdown(report);
  if (options.out) {
    await save(`${options.out}.json`, JSON.stringify(report, null, 2) + '\n');
    await save(`${options.out}.md`, markdown);
    process.stdout.write(`Wrote ${options.out}.json and ${options.out}.md.\nAutomatic: ${report.automatic.correct}/${report.automatic.total}; missing: ${report.automatic.missing}; pending human review: ${report.human.pending}.\n`);
    if (report.submission.synthetic) process.stdout.write('Synthetic fixture: these are not model performance results.\n');
  } else process.stdout.write(markdown);
}
main().catch((error) => {
  process.stderr.write(`ug-eval: ${error.message}\n`);
  if (error.issues) for (const issue of error.issues) process.stderr.write(`  - ${issue}\n`);
  process.exitCode = error.code === 'ENOENT' ? 1 : 2;
});
