# Uyghur AI Eval · ئۇيغۇرچە ئوچۇق باھالاش

An offline scoring toolkit and an **original draft task set**, maintained by [UyghurCommunity](https://github.com/UyghurCommunity).

[Browser playground](https://uyghurcommunity.github.io/uyghur-ai-eval/) · [Task dataset](dataset/tasks.json) · [Contributing](CONTRIBUTING.md)

**Status:** v0.1.0 draft. The 40 tasks, references, and rubrics were created with AI assistance and **have not received expert Uyghur-language review**. This project has no model leaderboard. Synthetic examples demonstrate the software; they do not measure model performance.

## ئۇيغۇرچە

بۇ قورال ئۇيغۇرچە AI جاۋابلىرىنى ھېسابات بىلەن تەكشۈرۈش ئۈچۈن تەييارلاندى. 40 لايىھە سوئال بار: 32 سى ئاپتوماتىك تەكشۈرۈلىدۇ، 8 سى ئادەم تەكشۈرۈشىگە قالدۇرۇلىدۇ. تەرجىمە ۋە يېزىش جاۋابلىرى ئاپتوماتىك توغرىلىق نىسبىتىگە قوشۇلمايدۇ.

- مەخپىي ئاچقۇچ، ھېسابات ياكى ھەقلىق مودېل چاقىرىش تەلەپ قىلمايدۇ.
- JSONL جاۋاب ھۆججىتىنى يەرلىك باھالايدۇ؛ JSON ۋە Markdown ھېساباتى چىقىرىدۇ.
- تەكرار ID، ناتونۇش ID ۋە شەكىل خاتالىقلىرىنى كۆرسىتىدۇ.
- ھەمزە، ئۇيغۇرچە ھەرپلەر، بەلگىلەر ۋە باغلاش بەلگىلىرىنى ئۆچۈرمەيدۇ.
- توركۆرگۈچتىكى ھۆججەتلەر ئۈسكۈنىڭىزدىن سىرتقا ئەۋەتىلمەيدۇ.

مۇھىم: بۇ توپلام مۇتەخەسسىس تەكشۈرۈشىدىن تېخى ئۆتمىگەن. سوئال، جاۋاب ۋە باھالاش ئۆلچەملىرىنى مۇستەقىل تەكشۈرۈپ تۆھپە قوشۇڭ.

## Run from source

Requires Node.js 18 or newer. There are no runtime or development dependencies to install.

```bash
git clone https://github.com/UyghurCommunity/uyghur-ai-eval.git
cd uyghur-ai-eval
node bin/ug-eval.js validate
node bin/ug-eval.js tasks --out prompts.jsonl
```

Use `prompts.jsonl` with your own model or human workflow. The exported prompts contain IDs, instructions, choices, and review criteria, without automatic answer keys or reference translations. This toolkit does not call a model or send prompts anywhere.

Create a UTF-8 predictions file with one JSON object per line:

```jsonl
{"id":"copy-01","response":"ئۇيغۇر"}
{"id":"choice-01","response":"A"}
```

Score it:

```bash
node bin/ug-eval.js score predictions.jsonl \
  --label "My submission" --out reports/run
```

This writes `reports/run.json` and `reports/run.md`. Without `--out`, the Markdown report is printed to stdout. Missing automatic responses count as incorrect, so a partial submission never receives an inflated score.

To exercise the full software workflow with **synthetic responses**:

```bash
node bin/ug-eval.js sample --out sample.jsonl
node bin/ug-eval.js score sample.jsonl \
  --label "Synthetic software demonstration" --out reports/demo
```

The fixture deliberately includes incorrect automatic answers. Its 75% score is a software test result, not a result from any AI model.

## Command reference

```text
ug-eval validate [--dataset path]
ug-eval tasks [--dataset path] [--out prompts.jsonl]
ug-eval sample [--dataset path] [--out predictions.jsonl]
ug-eval score predictions.jsonl [--dataset path] [--label name] [--out report-prefix]
```

When working from this checkout, use `node bin/ug-eval.js` in place of `ug-eval`. Exit code `0` means the command completed, `1` means an input file was not found, and `2` means validation, arguments, or another operation failed. A low score is a valid result and does not itself cause a nonzero exit code.

## Package API

The npm-ready package is named **`@uyghurcommunity/ai-eval`** and exposes an ESM API with TypeScript declarations. npm registry publication is pending. Once the GitHub v0.1.0 release is available, install directly from its source archive:

```bash
npm install https://github.com/UyghurCommunity/uyghur-ai-eval/archive/refs/tags/v0.1.0.tar.gz
npx ug-eval validate
```

No claim of npm registry availability is made by this repository.

```js
import {
  evaluate,
  parseJSONL,
  validateDataset,
  formatMarkdown,
} from '@uyghurcommunity/ai-eval';

// dataset is a parsed dataset JSON object; predictionText is UTF-8 JSONL.
const check = validateDataset(dataset);
if (!check.valid) throw new Error(check.errors.join('\n'));
const report = evaluate(dataset, parseJSONL(predictionText), {
  label: 'My submission',
});
console.log(report.automatic);
console.log(formatMarkdown(report));
```

The bundled JSON is exported as `@uyghurcommunity/ai-eval/dataset`; load it with your environment's JSON loader. The scorer works in Node.js and modern browsers. It has no provider-specific API dependency.

Exports: `EvaluationError`, `normalizeAnswer`, `parseJSONL`, `validateDataset`, `validatePredictions`, `evaluate`, `createSyntheticPredictions`, `exportPrompts`, and `formatMarkdown`.

## Scoring contract

| Task kind | Scoring | Included in automatic denominator? |
| --- | --- | --- |
| `exact` | One point when the answer matches an accepted string after its explicit normalization rules | Yes |
| `multiple_choice` | One point for an accepted choice label; case-insensitive in the bundled set | Yes |
| `human` | Response, draft reference, and review criteria are shown for manual assessment | No |

The denominator always includes every automatic task in the selected dataset. Missing automatic answers score zero. Missing human tasks and submitted human tasks waiting for review are reported separately. This version **does not assign numerical human-review scores**.

Normalization applies Unicode NFC, normalizes CRLF/CR line endings, and trims surrounding whitespace by default. It does **not** remove hamza, Uyghur letters, diacritics, ZWNJ/ZWJ, or punctuation. Case folding occurs only when a task opts into it. Wrong Uyghur letters remain wrong.

Duplicate IDs, unknown IDs, non-string responses, malformed JSONL, and individual responses longer than 100,000 characters fail validation before scoring. Empty response strings are allowed and normally score as incorrect. Blank JSONL lines are ignored. Each record may include an optional `source` string; `source: "synthetic-fixture"` adds a synthetic-result warning.

## Dataset scope and provenance

The dataset contains 24 exact-response tasks, eight multiple-choice tasks, and eight human-review tasks. Categories cover copying and Unicode fidelity, simple text extraction, mixed scripts, reading, translation, writing, and summarization.

Prompts, draft references, and rubrics are original material created for this project with AI assistance. No external dictionary or benchmark was copied. This is a small public starter set with visible keys. It is unsuitable for claims of comprehensive language ability, a contamination-free benchmark, or verified model rankings. Language experts should review each item before it is used to support public performance claims.

Dataset status and provenance are embedded in [`dataset/tasks.json`](dataset/tasks.json). Reports record the dataset version and review status. They deliberately have no changing timestamp so the same inputs produce reproducible outputs.

## Browser playground

From the project root:

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173/>. The page fetches the bundled dataset and scores pasted or uploaded JSONL locally. It does not upload predictions, store submissions, call model providers, or show fabricated rankings. JSON and Markdown reports can be downloaded. Each task can be inspected and filtered by result status. The playground accepts files up to 5 MB; use the CLI for larger files.

Serve over HTTP rather than opening `index.html` as a `file://` URL, since browser module and dataset loading require an HTTP origin.

Uyghur interface text and Uyghur answers use **ALKATIP Basma**, loaded from external WOFF2/WOFF/TTF URLs at `db.onlinewebfonts.com`, with system font fallbacks. English remains in system typography, and JSONL input, task IDs, and code retain their monospace formatting and directions. The `.alkatip-basma` helper provides RTL direction, embedded bidi handling, and a 2.2 line height. No font binary is bundled; unavailable fonts fall back without affecting offline scoring.

The hero's animated inspection instrument is a **synthetic illustration**, not a model run or performance result. Its Uyghur pause/play button controls the decorative motion and section reveals. System reduced-motion settings take priority from the first paint; animation also pauses while the page is hidden or the instrument is outside the viewport. There are no animation timers or JavaScript frame loops, and user-submitted text is never animated. With JavaScript unavailable, the illustration and explanatory content remain visible as a static page.

## Verify and package

```bash
npm test
npm run validate
npm pack --dry-run
```

The package ships source, types, CLI, dataset, a clearly marked synthetic fixture, and license files. The static playground is served directly from the repository root with GitHub Pages; `.nojekyll` is included.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). Useful first contributions include independent review of one task, finding an exact-match edge case, improving accessible Uyghur UI wording, and proposing a new original task with a precise review rubric.

## Licenses

Code and documentation: [MIT](LICENSE). Original task data and synthetic examples: [CC0-1.0](LICENSE-DATA). User-supplied model responses retain their existing ownership and terms.
