/**
 * The seven named ETL transforms (deck order) + the default per-connector
 * chain. `combineSources` is cross-connector, so the default chain applies it
 * last over the merged dataset (see run-etl in the worker); per-connector runs
 * stop at businessRules.
 */
import type { NamedTransform, RawRow, RowTransform } from '../types.js';
import { deduplicate } from './deduplicate.js';
import { correctInvalid } from './correctInvalid.js';
import { convertDates } from './convertDates.js';
import { standardizeCodes } from './standardizeCodes.js';
import { calculateValues } from './calculateValues.js';
import { combineSources } from './combineSources.js';
import { businessRules } from './businessRules.js';

export { deduplicate, correctInvalid, convertDates, standardizeCodes, calculateValues, combineSources, businessRules };
export { dedupeKey } from './deduplicate.js';
export { correctSex, splitFullName } from './correctInvalid.js';
export { calculateLosDays, deriveAbnormalFlag } from './calculateValues.js';
export { violationsOf } from './businessRules.js';
export { patientGroupKey } from './combineSources.js';
export { parseLooseDate, looseName, looseDobKey, nameTokens } from './helpers.js';

/** Steps applied to each connector's rows before staging-derived loads. */
export const DEFAULT_TRANSFORMS: NamedTransform[] = [
  { name: 'deduplicate', apply: deduplicate },
  { name: 'correctInvalid', apply: correctInvalid },
  { name: 'convertDates', apply: convertDates },
  { name: 'standardizeCodes', apply: standardizeCodes },
  { name: 'calculateValues', apply: calculateValues },
  { name: 'businessRules', apply: businessRules },
];

/** Run a chain of transforms left-to-right. */
export function applyTransforms(rows: RawRow[], transforms: RowTransform[]): RawRow[] {
  return transforms.reduce((acc, t) => t(acc), rows);
}

/** Full chain incl. the cross-silo combine step. */
export function applyAllTransforms(rows: RawRow[]): RawRow[] {
  return combineSources(applyTransforms(rows, DEFAULT_TRANSFORMS.map((t) => t.apply)));
}
