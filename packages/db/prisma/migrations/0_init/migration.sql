-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "gov";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "staging";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "warehouse";

-- CreateEnum
CREATE TYPE "app"."UserRole" AS ENUM ('ADMIN', 'PHYSICIAN', 'LAB_TECH', 'BILLER', 'ANALYST', 'AUDITOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "app"."Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "app"."EncounterType" AS ENUM ('INPATIENT', 'OUTPATIENT', 'EMERGENCY', 'TELEHEALTH');

-- CreateEnum
CREATE TYPE "app"."ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING', 'PAID', 'DENIED', 'APPEALED');

-- CreateEnum
CREATE TYPE "app"."ResultStatus" AS ENUM ('COLLECTED', 'IN_PROGRESS', 'REVIEWED', 'RELEASED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "app"."SourceSystem" AS ENUM ('EMR', 'LIS', 'BILLING', 'INSURANCE', 'LEGACY');

-- CreateEnum
CREATE TYPE "app"."JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."Severity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "gov"."Classification" AS ENUM ('PUBLIC', 'INTERNAL', 'PII', 'PHI');

-- CreateTable
CREATE TABLE "app"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "app"."UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Patient" (
    "id" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullNameNormalized" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" "app"."Sex" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "ssnEncrypted" TEXT,
    "sourceSystem" "app"."SourceSystem" NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Provider" (
    "id" TEXT NOT NULL,
    "npi" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Encounter" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "app"."EncounterType" NOT NULL,
    "status" TEXT NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL,
    "dischargedAt" TIMESTAMP(3),
    "diagnosisCode" TEXT NOT NULL,
    "diagnosisText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."LabOrder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "orderingProviderId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."LabResult" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "valueNumeric" DOUBLE PRECISION,
    "valueText" TEXT,
    "unit" TEXT NOT NULL,
    "referenceRange" TEXT NOT NULL,
    "abnormalFlag" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "resultedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "status" "app"."ResultStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Payer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Claim" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "status" "app"."ClaimStatus" NOT NULL,
    "billedAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2),
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Consent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."DocumentControl" (
    "id" TEXT NOT NULL,
    "docCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging"."RawSourceRecord" (
    "id" TEXT NOT NULL,
    "sourceSystem" "app"."SourceSystem" NOT NULL,
    "recordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."DimPatient" (
    "id" TEXT NOT NULL,
    "goldenId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "sex" TEXT NOT NULL,
    "city" TEXT,
    "isGolden" BOOLEAN NOT NULL DEFAULT true,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DimPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."DimProvider" (
    "id" TEXT NOT NULL,
    "npi" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "department" TEXT NOT NULL,

    CONSTRAINT "DimProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."DimLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "DimLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."DimPayer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "DimPayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."DimDate" (
    "dateKey" INTEGER NOT NULL,
    "fullDate" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isWeekend" BOOLEAN NOT NULL,

    CONSTRAINT "DimDate_pkey" PRIMARY KEY ("dateKey")
);

-- CreateTable
CREATE TABLE "warehouse"."DimTestCatalog" (
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "loincCode" TEXT,
    "unit" TEXT NOT NULL,
    "department" TEXT NOT NULL,

    CONSTRAINT "DimTestCatalog_pkey" PRIMARY KEY ("testCode")
);

-- CreateTable
CREATE TABLE "warehouse"."FactEncounter" (
    "id" TEXT NOT NULL,
    "patientKey" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "dateKey" INTEGER NOT NULL,
    "encounterType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "losDays" DOUBLE PRECISION,
    "chargeAmount" DECIMAL(12,2),
    "diagnosisCode" TEXT NOT NULL,

    CONSTRAINT "FactEncounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."FactLabResult" (
    "id" TEXT NOT NULL,
    "patientKey" TEXT NOT NULL,
    "testKey" TEXT NOT NULL,
    "dateKey" INTEGER NOT NULL,
    "valueNumeric" DOUBLE PRECISION,
    "abnormalFlag" TEXT,
    "tatHours" DOUBLE PRECISION,

    CONSTRAINT "FactLabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."FactClaim" (
    "id" TEXT NOT NULL,
    "patientKey" TEXT NOT NULL,
    "payerKey" TEXT NOT NULL,
    "dateKey" INTEGER NOT NULL,
    "claimStatus" TEXT NOT NULL,
    "billedAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2),
    "daysToPayment" INTEGER,

    CONSTRAINT "FactClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."DataCatalog" (
    "id" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stewardUserId" TEXT,
    "classification" "gov"."Classification" NOT NULL,
    "containsPhi" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."Glossary" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Glossary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."PipelineRun" (
    "id" TEXT NOT NULL,
    "pipelineName" TEXT NOT NULL,
    "status" "app"."JobStatus" NOT NULL,
    "rowsIn" INTEGER,
    "rowsOut" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMsg" TEXT,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."DqRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "severity" "app"."Severity" NOT NULL,
    "targetSchema" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "sqlAssertion" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DqRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."DqResult" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "runId" TEXT,
    "passed" BOOLEAN NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "sampleKeys" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DqResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."MdmMaster" (
    "id" TEXT NOT NULL,
    "goldenId" TEXT NOT NULL,
    "sourceSystem" "app"."SourceSystem" NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "isGolden" BOOLEAN NOT NULL DEFAULT false,
    "survivorshipRule" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdmMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."FreshnessSla" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "maxStalenessMinutes" INTEGER NOT NULL,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreshnessSla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gov"."AlertLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "severity" "app"."Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "app"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_mrn_key" ON "app"."Patient"("mrn");

-- CreateIndex
CREATE INDEX "Patient_fullNameNormalized_idx" ON "app"."Patient"("fullNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_npi_key" ON "app"."Provider"("npi");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "app"."Location"("code");

-- CreateIndex
CREATE INDEX "Encounter_patientId_idx" ON "app"."Encounter"("patientId");

-- CreateIndex
CREATE INDEX "Encounter_admittedAt_idx" ON "app"."Encounter"("admittedAt");

-- CreateIndex
CREATE INDEX "LabOrder_patientId_idx" ON "app"."LabOrder"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "LabResult_orderId_key" ON "app"."LabResult"("orderId");

-- CreateIndex
CREATE INDEX "LabResult_patientId_idx" ON "app"."LabResult"("patientId");

-- CreateIndex
CREATE INDEX "LabResult_testCode_idx" ON "app"."LabResult"("testCode");

-- CreateIndex
CREATE UNIQUE INDEX "Payer_code_key" ON "app"."Payer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimNumber_key" ON "app"."Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_patientId_idx" ON "app"."Claim"("patientId");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "app"."Claim"("status");

-- CreateIndex
CREATE INDEX "Consent_patientId_idx" ON "app"."Consent"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "app"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "app"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_idx" ON "app"."OutboxEvent"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentControl_docCode_key" ON "app"."DocumentControl"("docCode");

-- CreateIndex
CREATE INDEX "RawSourceRecord_sourceSystem_isProcessed_idx" ON "staging"."RawSourceRecord"("sourceSystem", "isProcessed");

-- CreateIndex
CREATE UNIQUE INDEX "RawSourceRecord_sourceSystem_recordType_sourceRecordId_chec_key" ON "staging"."RawSourceRecord"("sourceSystem", "recordType", "sourceRecordId", "checksum");

-- CreateIndex
CREATE INDEX "DimPatient_goldenId_idx" ON "warehouse"."DimPatient"("goldenId");

-- CreateIndex
CREATE INDEX "FactEncounter_patientKey_idx" ON "warehouse"."FactEncounter"("patientKey");

-- CreateIndex
CREATE INDEX "FactEncounter_dateKey_idx" ON "warehouse"."FactEncounter"("dateKey");

-- CreateIndex
CREATE INDEX "FactLabResult_patientKey_idx" ON "warehouse"."FactLabResult"("patientKey");

-- CreateIndex
CREATE INDEX "FactLabResult_dateKey_idx" ON "warehouse"."FactLabResult"("dateKey");

-- CreateIndex
CREATE INDEX "FactClaim_patientKey_idx" ON "warehouse"."FactClaim"("patientKey");

-- CreateIndex
CREATE INDEX "FactClaim_dateKey_idx" ON "warehouse"."FactClaim"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "DataCatalog_schemaName_tableName_key" ON "gov"."DataCatalog"("schemaName", "tableName");

-- CreateIndex
CREATE UNIQUE INDEX "Glossary_term_key" ON "gov"."Glossary"("term");

-- CreateIndex
CREATE INDEX "PipelineRun_pipelineName_startedAt_idx" ON "gov"."PipelineRun"("pipelineName", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DqRule_code_key" ON "gov"."DqRule"("code");

-- CreateIndex
CREATE INDEX "DqResult_ruleId_checkedAt_idx" ON "gov"."DqResult"("ruleId", "checkedAt");

-- CreateIndex
CREATE INDEX "MdmMaster_goldenId_idx" ON "gov"."MdmMaster"("goldenId");

-- CreateIndex
CREATE INDEX "MdmMaster_patientId_idx" ON "gov"."MdmMaster"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "FreshnessSla_tableName_key" ON "gov"."FreshnessSla"("tableName");

-- AddForeignKey
ALTER TABLE "app"."Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "app"."Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Encounter" ADD CONSTRAINT "Encounter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "app"."Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Encounter" ADD CONSTRAINT "Encounter_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "app"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "app"."Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."LabOrder" ADD CONSTRAINT "LabOrder_orderingProviderId_fkey" FOREIGN KEY ("orderingProviderId") REFERENCES "app"."Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."LabResult" ADD CONSTRAINT "LabResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "app"."LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."LabResult" ADD CONSTRAINT "LabResult_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "app"."Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."LabResult" ADD CONSTRAINT "LabResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Claim" ADD CONSTRAINT "Claim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "app"."Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Claim" ADD CONSTRAINT "Claim_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "app"."Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Claim" ADD CONSTRAINT "Claim_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "app"."Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Consent" ADD CONSTRAINT "Consent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "app"."Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."DocumentControl" ADD CONSTRAINT "DocumentControl_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactEncounter" ADD CONSTRAINT "FactEncounter_patientKey_fkey" FOREIGN KEY ("patientKey") REFERENCES "warehouse"."DimPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactEncounter" ADD CONSTRAINT "FactEncounter_providerKey_fkey" FOREIGN KEY ("providerKey") REFERENCES "warehouse"."DimProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactEncounter" ADD CONSTRAINT "FactEncounter_locationKey_fkey" FOREIGN KEY ("locationKey") REFERENCES "warehouse"."DimLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactLabResult" ADD CONSTRAINT "FactLabResult_patientKey_fkey" FOREIGN KEY ("patientKey") REFERENCES "warehouse"."DimPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactLabResult" ADD CONSTRAINT "FactLabResult_testKey_fkey" FOREIGN KEY ("testKey") REFERENCES "warehouse"."DimTestCatalog"("testCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactClaim" ADD CONSTRAINT "FactClaim_patientKey_fkey" FOREIGN KEY ("patientKey") REFERENCES "warehouse"."DimPatient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."FactClaim" ADD CONSTRAINT "FactClaim_payerKey_fkey" FOREIGN KEY ("payerKey") REFERENCES "warehouse"."DimPayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."DataCatalog" ADD CONSTRAINT "DataCatalog_stewardUserId_fkey" FOREIGN KEY ("stewardUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."Glossary" ADD CONSTRAINT "Glossary_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."DqResult" ADD CONSTRAINT "DqResult_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "gov"."DqRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."DqResult" ADD CONSTRAINT "DqResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "gov"."PipelineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."FreshnessSla" ADD CONSTRAINT "FreshnessSla_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gov"."AlertLog" ADD CONSTRAINT "AlertLog_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "app"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

