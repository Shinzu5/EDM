/**
 * @medidata/worker — background job runner (BullMQ + node-cron).
 *
 * Owns: ETL pipeline runs (staging → app → warehouse), DQ rule evaluation,
 * MDM golden-record runs, warehouse loads, freshness SLA checks, outbound
 * webhooks.
 *
 * STUB: owned by the Worker agent. Boots nothing yet — placeholder so the
 * workspace typechecks and builds. Run with `npm run dev -w @medidata/worker`.
 */
export {};
