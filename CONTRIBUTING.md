# Contributing · تۆھپە قوشۇش

Thank you for helping make Uyghur evaluation more inspectable and useful.

## Review one task

Open `dataset/tasks.json`, choose a task, and check:

1. Is the Uyghur prompt natural and unambiguous?
2. Is every automatic accepted answer correct and sufficiently complete?
3. Does the task actually support exact matching? If several valid answers exist, add them or use `kind: "human"`.
4. For human tasks, are the draft reference and rubric helpful without claiming one definitive translation?
5. Are the prompt and reference original, or is clear reuse permission recorded?

Describe the review in an issue or pull request. Include the task ID, your proposed change, and the reason. Do not mark the entire dataset as expert-reviewed after reviewing one item. An independent review process and a recorded review log are required before changing dataset-level status.

## Add a task

Use a stable unique ID, a category, a clear prompt, and a supported kind. Exact tasks need an `accepted` string array. Multiple-choice tasks also need a `choices` object. Human tasks need a `reference_answer` and explicit `rubric` criteria. Preserve Uyghur letters; avoid destructive normalization.

New original task data and synthetic fixtures are contributed under CC0-1.0. Code and documentation contributions use MIT. Do not submit private prompts, personal data, copied dictionaries, or model responses you cannot share.

## Test

```bash
npm test
npm run validate
```

A scoring change should include a test for an observable failure or boundary: a missing response, ambiguous answer, duplicate ID, Unicode difference, or scoring-denominator error. Preserve the human/automatic separation.

## Reporting results

Always name the dataset version, its draft/review status, the full automatic denominator, and missing answers. Keep human review separate. Label synthetic fixtures. A result on this small task set does not establish comprehensive Uyghur language quality.
