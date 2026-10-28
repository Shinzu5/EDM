-- ============================================================================
-- MediData — warehouse SQL assets (the ELT / in-DB transform path).
--
-- Executed idempotently by packages/etl-core/src/elt.ts (`applySqlAssets`),
-- which splits this file into statements (no dollar-quoted bodies allowed) and
-- skips execution entirely when every asset already exists.
--
--  * 3 materialized views = pre-aggregated warehouse marts
--  * gov.patient_360      = FEDERATED VIEW over app + staging ("data
--                          virtualization": a single 360° query surface with
--                          NO data copy)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Patient rollup mart: golden patients x encounter/lab/claim aggregates.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS warehouse.mv_patient_rollup;

CREATE MATERIALIZED VIEW warehouse.mv_patient_rollup AS
SELECT
  dp."goldenId"                       AS golden_id,
  dp."mrn"                            AS mrn,
  dp."fullName"                       AS full_name,
  dp."dateOfBirth"                    AS date_of_birth,
  dp."sex"                            AS sex,
  dp."city"                           AS city,
  dp."sourceCount"                    AS source_count,
  COALESCE(e.encounter_count, 0)      AS encounter_count,
  COALESCE(l.lab_result_count, 0)     AS lab_result_count,
  COALESCE(c.claim_count, 0)          AS claim_count,
  COALESCE(c.total_billed, 0)         AS total_billed,
  COALESCE(c.total_paid, 0)           AS total_paid,
  l.avg_tat_hours                     AS avg_tat_hours,
  MAX(dp."updatedAt")                 AS last_updated_at
FROM warehouse.dim_patient dp
LEFT JOIN (
  SELECT "patientKey", COUNT(*) AS encounter_count
  FROM warehouse.fact_encounter GROUP BY "patientKey"
) e ON e."patientKey" = dp.id
LEFT JOIN (
  SELECT "patientKey", COUNT(*) AS lab_result_count,
         ROUND(AVG("tatHours")::numeric, 2) AS avg_tat_hours
  FROM warehouse.fact_lab_result GROUP BY "patientKey"
) l ON l."patientKey" = dp.id
LEFT JOIN (
  SELECT "patientKey", COUNT(*) AS claim_count,
         SUM("billedAmount")::numeric AS total_billed,
         SUM("paidAmount")::numeric AS total_paid
  FROM warehouse.fact_claim GROUP BY "patientKey"
) c ON c."patientKey" = dp.id
WHERE dp."isGolden" = TRUE
GROUP BY
  dp."goldenId", dp."mrn", dp."fullName", dp."dateOfBirth",
  dp."sex", dp."city", dp."sourceCount", dp."updatedAt",
  e.encounter_count, l.lab_result_count, l.avg_tat_hours,
  c.claim_count, c.total_billed, c.total_paid;

CREATE UNIQUE INDEX IF NOT EXISTS mv_patient_rollup_golden_id_idx
  ON warehouse.mv_patient_rollup (golden_id);

-- ---------------------------------------------------------------------------
-- 2. Lab turnaround-time mart: monthly TAT per test.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS warehouse.mv_lab_tat_monthly;

CREATE MATERIALIZED VIEW warehouse.mv_lab_tat_monthly AS
SELECT
  d."year"                             AS year,
  d."month"                            AS month,
  fl."testKey"                         AS test_code,
  tc."testName"                        AS test_name,
  COUNT(*)                             AS result_count,
  ROUND(AVG(fl."tatHours")::numeric, 2) AS avg_tat_hours,
  ROUND(MAX(fl."tatHours")::numeric, 2) AS max_tat_hours,
  SUM(CASE WHEN fl."abnormalFlag" IS NOT NULL THEN 1 ELSE 0 END) AS abnormal_count
FROM warehouse.fact_lab_result fl
JOIN warehouse.dim_date d ON d."dateKey" = fl."dateKey"
JOIN warehouse.dim_test_catalog tc ON tc."testCode" = fl."testKey"
GROUP BY d."year", d."month", fl."testKey", tc."testName";

CREATE UNIQUE INDEX IF NOT EXISTS mv_lab_tat_monthly_key_idx
  ON warehouse.mv_lab_tat_monthly (year, month, test_code);

-- ---------------------------------------------------------------------------
-- 3. Claim payment-lag mart: per payer per month.
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS warehouse.mv_claim_payment_lag;

CREATE MATERIALIZED VIEW warehouse.mv_claim_payment_lag AS
SELECT
  p."code"                             AS payer_code,
  p."name"                             AS payer_name,
  d."year"                             AS year,
  d."month"                            AS month,
  COUNT(*)                             AS claim_count,
  ROUND(AVG(fc."daysToPayment")::numeric, 2) AS avg_days_to_payment,
  SUM(CASE WHEN fc."claimStatus" = 'DENIED' THEN 1 ELSE 0 END) AS denied_count,
  ROUND(SUM(fc."billedAmount")::numeric, 2)  AS total_billed,
  ROUND(SUM(COALESCE(fc."paidAmount", 0))::numeric, 2) AS total_paid
FROM warehouse.fact_claim fc
JOIN warehouse.dim_payer p ON p.id = fc."payerKey"
JOIN warehouse.dim_date d ON d."dateKey" = fc."dateKey"
GROUP BY p."code", p."name", d."year", d."month";

CREATE UNIQUE INDEX IF NOT EXISTS mv_claim_payment_lag_key_idx
  ON warehouse.mv_claim_payment_lag (payer_code, year, month);

-- ---------------------------------------------------------------------------
-- 4. gov.patient_360 — FEDERATED VIEW (data virtualization).
--    A single query surface across the OLTP app schema and the raw staging
--    zone WITHOUT copying any data. Serves the dashboard's patient-360 view.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW gov.patient_360 AS
SELECT
  p.id                                                       AS patient_id,
  p.mrn                                                      AS mrn,
  p."firstName"                                              AS first_name,
  p."lastName"                                               AS last_name,
  p."fullNameNormalized"                                     AS full_name_normalized,
  p."dateOfBirth"                                            AS date_of_birth,
  p.sex                                                      AS sex,
  p.phone                                                    AS phone,
  p.email                                                    AS email,
  p.city                                                     AS city,
  p."sourceSystem"                                           AS source_system,
  (SELECT COUNT(*) FROM app.encounters e WHERE e."patientId" = p.id)  AS encounter_count,
  (SELECT COUNT(*) FROM app.lab_results lr WHERE lr."patientId" = p.id) AS lab_result_count,
  (SELECT COUNT(*) FROM app.claims c WHERE c."patientId" = p.id)       AS claim_count,
  (SELECT COUNT(*) FROM app.consents cs WHERE cs."patientId" = p.id)   AS consent_count,
  (SELECT COUNT(*)
     FROM staging.raw_source_record r
    WHERE r."recordType" = 'patient'
      AND r.payload->>'mrn' = p.mrn)                                    AS staging_record_count,
  (SELECT m."goldenId"
     FROM gov.mdm_master m
    WHERE m."patientId" = p.id AND m."isGolden" = TRUE
    LIMIT 1)                                                           AS golden_id
FROM app.patients p;
