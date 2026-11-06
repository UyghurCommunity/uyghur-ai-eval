export interface NormalizationOptions { trim?: boolean; caseInsensitive?: boolean; }
export interface TaskBase { id: string; category: string; prompt: string; normalization?: NormalizationOptions; }
export interface AutomaticTask extends TaskBase { kind: 'exact' | 'multiple_choice'; accepted: string[]; choices?: Record<string, string>; }
export interface HumanTask extends TaskBase { kind: 'human'; reference_answer: string; rubric: string[]; }
export type Task = AutomaticTask | HumanTask;
export interface Dataset { id: string; version: string; dataset_status: string; language: string; license: string; expert_reviewed?: boolean; tasks: Task[]; [key: string]: unknown; }
export interface Prediction { id: string; response: string; source?: string; }
export interface ValidationResult { valid: boolean; errors: string[]; }
export interface DatasetValidation extends ValidationResult { counts: { tasks: number; automatic: number; human: number }; }
export type ItemStatus = 'correct' | 'incorrect' | 'missing' | 'pending_review';
export interface ReportItem { id: string; category: string; kind: Task['kind']; prompt: string; response: string | null; status: ItemStatus; accepted?: string[]; reference?: string; rubric?: string[]; }
export interface CategoryResult { correct: number; automatic: number; answered: number; missing: number; human: number; pendingHuman: number; }
export interface EvaluationReport {
  report_version: string;
  dataset: { id: string; version: string; status: string; language: string; expert_reviewed: boolean };
  submission: { label: string; records: number; synthetic: boolean };
  automatic: { correct: number; total: number; answered: number; missing: number; accuracy: number | null };
  human: { total: number; submitted: number; missing: number; pending: number };
  categories: Record<string, CategoryResult>;
  warnings: string[];
  items: ReportItem[];
}
export class EvaluationError extends Error { code: string; issues: string[]; constructor(message: string, code: string, issues?: string[]); }
export function normalizeAnswer(value: string, options?: NormalizationOptions): string;
export function parseJSONL(text: string): unknown[];
export function validateDataset(dataset: unknown): DatasetValidation;
export function validatePredictions(dataset: Dataset, predictions: unknown): ValidationResult;
export function evaluate(dataset: Dataset, predictions: unknown[], options?: { label?: string }): EvaluationReport;
export function createSyntheticPredictions(dataset: Dataset): Prediction[];
export function exportPrompts(dataset: Dataset): Array<Pick<TaskBase, 'id' | 'category' | 'prompt'> & { kind: Task['kind']; choices?: Record<string, string>; rubric?: string[] }>;
export function formatMarkdown(report: EvaluationReport): string;
