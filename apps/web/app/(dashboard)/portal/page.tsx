'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, HeartPulse, LogOut, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS } from '@medidata/shared';
import { ApiError, apiDownload, apiFetch, saveBlob } from '@/lib/api';
import { useApiQuery } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { AuthGuard } from '@/components/AuthGuard';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

/**
 * Portal payload has no fixed schema — parse the recognized shape
 * defensively and render only what the API actually sent.
 */
type PortalResult = {
  id: string;
  testName: string;
  testCode?: string;
  value?: string;
  unit?: string;
  status?: string;
  releasedAt?: unknown;
};

type PortalRecords = {
  profile: { fullName?: string; mrn?: string; dateOfBirth?: unknown } | null;
  results: PortalResult[];
  raw: unknown;
};

function normalizeRecords(raw: unknown): PortalRecords {
  if (typeof raw !== 'object' || raw === null) {
    return { profile: null, results: [], raw };
  }
  const record = raw as Record<string, unknown>;
  const candidateProfile =
    (record.patient as Record<string, unknown> | undefined) ??
    (record.profile as Record<string, unknown> | undefined) ??
    (record.demographics as Record<string, unknown> | undefined);
  const profile =
    candidateProfile && typeof candidateProfile === 'object'
      ? {
          fullName: typeof candidateProfile.fullName === 'string'
            ? candidateProfile.fullName
            : typeof candidateProfile.firstName === 'string'
              ? `${candidateProfile.firstName} ${candidateProfile.lastName ?? ''}`.trim()
              : undefined,
          mrn: typeof candidateProfile.mrn === 'string' ? candidateProfile.mrn : undefined,
          dateOfBirth: candidateProfile.dateOfBirth,
        }
      : null;

  const resultSource =
    [record.results, record.releasedResults, record.labResults, record.records].find(Array.isArray) ?? [];

  const results = resultSource
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => {
      const value = item.valueNumeric ?? item.valueText ?? item.value;
      return {
        id: typeof item.id === 'string' ? item.id : `row-${index}`,
        testName: typeof item.testName === 'string' ? item.testName : typeof item.name === 'string' ? item.name : `Result ${index + 1}`,
        testCode: typeof item.testCode === 'string' ? item.testCode : undefined,
        value: value === null || value === undefined ? undefined : String(value),
        unit: typeof item.unit === 'string' ? item.unit : undefined,
        status: typeof item.status === 'string' ? item.status : undefined,
        releasedAt: item.releasedAt ?? item.resultedAt ?? null,
      };
    });

  return { profile, results, raw };
}

type ConsentRow = { id: string; consentType: string; granted: boolean };

function normalizeConsents(raw: unknown): ConsentRow[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as Record<string, unknown>).consents)
      ? ((raw as Record<string, unknown>).consents as unknown[])
      : [];
  return list
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `consent-${index}`,
      consentType: String(item.consentType ?? item.type ?? `consent-${index}`),
      granted: Boolean(item.granted),
    }));
}

function DownloadButton({ resultId }: { resultId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { blob, filename } = await apiDownload(
        ENDPOINTS.portalResultDownload.path.replace(':id', encodeURIComponent(resultId)),
      );
      saveBlob(blob, filename);
      toast({ title: 'Download started', description: filename, variant: 'success' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Download failed';
      toast({ title: 'Download failed', description: message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void download()}>
      <Download className="h-3.5 w-3.5" aria-hidden /> Download
    </Button>
  );
}

function PortalContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const recordsQuery = useApiQuery<unknown>(['portal', 'records'], ENDPOINTS.portalRecords.path);
  const consentQuery = useApiQuery<unknown>(['portal', 'consent'], ENDPOINTS.portalConsent.path);

  const records = useMemo(() => normalizeRecords(recordsQuery.data), [recordsQuery.data]);
  const consents = useMemo(() => normalizeConsents(consentQuery.data), [consentQuery.data]);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggleConsent(consent: ConsentRow) {
    setSavingId(consent.id);
    try {
      const updated = await apiFetch<unknown>(ENDPOINTS.portalConsent.path, {
        method: 'POST',
        body: { consentType: consent.consentType, granted: !consent.granted },
      });
      const rows = normalizeConsents(updated);
      queryClient.setQueryData(
        ['portal', 'consent'],
        rows.length > 0
          ? rows
          : consents.map((row) => (row.id === consent.id ? { ...row, granted: !consent.granted } : row)),
      );
      toast({
        title: 'Consent updated',
        description: `${consent.consentType}: ${!consent.granted ? 'granted' : 'revoked'}`,
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Update failed';
      toast({ title: 'Consent update failed', description: message, variant: 'error' });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Records"
        description={`Patient portal${records.profile?.mrn ? ` · MRN ${records.profile.mrn}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="info" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden /> {user?.role}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Patient</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-900">
              {records.profile?.fullName ?? user?.fullName ?? '—'}
            </p>
            <p className="text-xs text-slate-500">
              {records.profile?.mrn ? `MRN ${records.profile.mrn} · ` : ''}
              DOB {formatDate(records.profile?.dateOfBirth)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Released results</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{records.results.length}</p>
            <p className="text-xs text-slate-500">available for download</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Active consents</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {consents.filter((consent) => consent.granted).length}
              <span className="text-sm font-normal text-slate-400"> / {consents.length}</span>
            </p>
            <p className="text-xs text-slate-500">manage data-sharing choices</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Released results */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-brand-600" aria-hidden /> Released results
            </CardTitle>
            <CardDescription>GET {ENDPOINTS.portalRecords.path} — only physician-released data appears here</CardDescription>
          </CardHeader>
          <CardContent>
            {recordsQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : recordsQuery.isError ? (
              <ErrorState error={recordsQuery.error} onRetry={() => void recordsQuery.refetch()} />
            ) : records.results.length === 0 ? (
              <EmptyState
                icon={HeartPulse}
                title="No released results yet"
                description={
                  records.raw === null || records.raw === undefined
                    ? 'The API returned an empty payload — check that apps/api is seeded.'
                    : 'Your clinicians have not released any results to the portal.'
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.results.map((result) => (
                  <li key={result.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{result.testName}</p>
                      <p className="text-[11px] text-slate-500">
                        {result.testCode ? <span className="font-mono">{result.testCode} · </span> : null}
                        released {formatDateTime(result.releasedAt)}
                      </p>
                    </div>
                    <span className="tabular-nums text-sm text-slate-700">
                      {result.value ?? '—'}
                      {result.unit ? ` ${result.unit}` : ''}
                    </span>
                    {result.status ? <Badge variant="success">{result.status}</Badge> : null}
                    <DownloadButton resultId={result.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Consent toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden /> Consent preferences
            </CardTitle>
            <CardDescription>POST {ENDPOINTS.portalConsent.path}</CardDescription>
          </CardHeader>
          <CardContent>
            {consentQuery.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : consentQuery.isError ? (
              <ErrorState compact error={consentQuery.error} onRetry={() => void consentQuery.refetch()} />
            ) : consents.length === 0 ? (
              <EmptyState
                title="No consent records"
                description="Consent items will appear here once the API returns them."
              />
            ) : (
              <ul className="space-y-3">
                {consents.map((consent) => (
                  <li key={consent.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{consent.consentType}</p>
                      <p className="text-[11px] text-slate-400">
                        {consent.granted ? 'Data sharing enabled' : 'Data sharing disabled'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={consent.granted}
                      aria-label={`Toggle ${consent.consentType}`}
                      disabled={savingId === consent.id}
                      onClick={() => void toggleConsent(consent)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                        consent.granted ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          consent.granted ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** PATIENT-only route — other roles get the friendly 403. */
export default function PortalPage() {
  return (
    <AuthGuard action="read" subject="portal">
      <PortalContent />
    </AuthGuard>
  );
}
