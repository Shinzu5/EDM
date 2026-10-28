/**
 * @medidata/etl-core — ETL/ELT engine.
 *
 * Extract (5 siloed connectors) → transform (7 named steps) → load
 * (idempotent staging upsert + warehouse dims/facts), plus the ELT contrast
 * path that applies in-DB SQL assets (materialized views + the gov.patient_360
 * federated view).
 */
export * from './types.js';
export * from './checksum.js';
export * from './extractors/index.js';
export * from './transforms/index.js';
export * from './loader.js';
export * from './warehouse-loader.js';
export * from './pipeline.js';
export * from './elt.js';
export { defaultFixturesDir, defaultSqlDir } from './paths.js';
