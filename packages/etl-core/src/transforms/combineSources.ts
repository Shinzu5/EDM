/**
 * Transform 6 — combineSources: merge EMR + LIS + Billing + Insurance (+ Legacy)
 * rows describing the same patient into a single `patient_360` combined row.
 *
 * Patients are matched by MRN when present, otherwise by normalized name+DOB
 * (legacy rows carry no MRN). The combined payload carries per-source counts
 * and the surviving member references so downstream loads / APIs can build a
 * federated patient view without re-joining five silos.
 */
import type { RawRow, RowTransform } from '../types.js';
import { checksumOf } from '../checksum.js';
import { looseDobKey, looseName, pick } from './helpers.js';

export function patientGroupKey(row: RawRow): string | null {
  const p = row.payload;
  const mrn = pick(p, 'mrn', 'emr_mrn');
  if (typeof mrn === 'string' && mrn.trim()) return `mrn:${mrn.trim().toUpperCase()}`;
  const name =
    pick(p, 'full_name', 'fullName') ??
    [pick(p, 'first_name'), pick(p, 'last_name')].filter(Boolean).join(' ');
  const dob = looseDobKey(pick(p, 'dob', 'dateOfBirth'));
  const norm = looseName(name);
  if (norm || dob) return `name:${norm}|${dob}`;
  return null;
}

interface Group {
  key: string;
  mrn: string | null;
  name: string | null;
  dob: string | null;
  city: string | null;
  sex: string | null;
  phone: string | null;
  sources: Set<string>;
  patientIds: string[];
  labResultIds: string[];
  claimIds: string[];
  policyIds: string[];
  encounterCount: number;
}

function upsertGroup(groups: Map<string, Group>, key: string): Group {
  let g = groups.get(key);
  if (!g) {
    g = {
      key,
      mrn: null,
      name: null,
      dob: null,
      city: null,
      sex: null,
      phone: null,
      sources: new Set(),
      patientIds: [],
      labResultIds: [],
      claimIds: [],
      policyIds: [],
      encounterCount: 0,
    };
    groups.set(key, g);
  }
  return g;
}

/** Merge rows across silos into one combined `patient_360` row per patient. */
export const combineSources: RowTransform = (rows: RawRow[]): RawRow[] => {
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const p = row.payload;
    switch (row.recordType) {
      case 'patient': {
        const g = upsertGroup(groups, patientGroupKey(row) ?? `id:${row.sourceRecordId}`);
        g.sources.add(row.sourceSystem);
        g.patientIds.push(row.sourceRecordId);
        const mrn = pick(p, 'mrn');
        if (!g.mrn && typeof mrn === 'string') g.mrn = mrn;
        const name =
          pick(p, 'full_name') ??
          [pick(p, 'first_name'), pick(p, 'last_name')].filter(Boolean).join(' ');
        if (!g.name && name) g.name = String(name);
        if (!g.dob) g.dob = (pick(p, 'dob') as string | null) ?? null;
        if (!g.city) g.city = (pick(p, 'city') as string | null) ?? null;
        if (!g.sex) g.sex = (pick(p, 'sex') as string | null) ?? null;
        if (!g.phone) g.phone = (pick(p, 'phone') as string | null) ?? null;
        break;
      }
      case 'lab_result': {
        const g = upsertGroup(groups, patientGroupKey(row) ?? `id:${row.sourceRecordId}`);
        g.sources.add(row.sourceSystem);
        g.labResultIds.push(row.sourceRecordId);
        break;
      }
      case 'claim': {
        const g = upsertGroup(groups, patientGroupKey(row) ?? `id:${row.sourceRecordId}`);
        g.sources.add(row.sourceSystem);
        g.claimIds.push(row.sourceRecordId);
        break;
      }
      case 'insurance_policy': {
        const g = upsertGroup(groups, patientGroupKey(row) ?? `id:${row.sourceRecordId}`);
        g.sources.add(row.sourceSystem);
        g.policyIds.push(row.sourceRecordId);
        break;
      }
      case 'encounter': {
        // Encounters carry patientId — group under it so counts are complete.
        const g = upsertGroup(groups, patientGroupKey(row) ?? `id:${row.sourceRecordId}`);
        g.sources.add(row.sourceSystem);
        g.encounterCount += 1;
        break;
      }
      default:
        break;
    }
  }

  const combined: RawRow[] = [];
  for (const [key, g] of groups) {
    combined.push({
      sourceSystem: (g.sources.values().next().value ?? 'EMR') as RawRow['sourceSystem'],
      recordType: 'patient_360',
      sourceRecordId: g.mrn ?? key,
      payload: {
        patientKey: key,
        mrn: g.mrn,
        name: g.name,
        dob: g.dob,
        city: g.city,
        sex: g.sex,
        phone: g.phone,
        sources: [...g.sources].sort(),
        patientIds: g.patientIds,
        labResultIds: g.labResultIds,
        claimIds: g.claimIds,
        policyIds: g.policyIds,
        encounterCount: g.encounterCount,
        combinedChecksum: checksumOf({
          sources: [...g.sources].sort(),
          patientIds: [...g.patientIds].sort(),
          labResultIds: [...g.labResultIds].sort(),
          claimIds: [...g.claimIds].sort(),
          policyIds: [...g.policyIds].sort(),
        }),
      },
    });
  }
  return combined;
};
