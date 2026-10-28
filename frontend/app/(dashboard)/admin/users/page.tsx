'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { UserPlus, Users } from 'lucide-react';
import { ENDPOINTS, ROLES, type Role, type User } from '@medidata/shared';
import { ApiError, apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { AuthGuard } from '@/components/AuthGuard';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

const ROLE_VARIANT: Record<Role, 'danger' | 'info' | 'purple' | 'warning' | 'success' | 'default'> = {
  ADMIN: 'danger',
  PHYSICIAN: 'info',
  LAB_TECH: 'purple',
  BILLER: 'warning',
  ANALYST: 'success',
  AUDITOR: 'default',
  PATIENT: 'info',
};

function AdminContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useApiQuery<User[]>(['admin', 'users'], ENDPOINTS.adminUsers.path);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'ANALYST' as Role, password: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<User>(ENDPOINTS.adminUsers.path, {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password,
        },
      }),
    onSuccess: (user) => {
      toast({ title: 'User created', description: `${user.email} · ${user.role}`, variant: 'success' });
      setOpen(false);
      setForm({ fullName: '', email: '', role: 'ANALYST', password: '' });
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: ApiError) => {
      setFormError(`${error.code}: ${error.message}`);
    },
  });

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Name',
        cell: ({ getValue }) => <span className="font-medium text-slate-900">{getValue<string>()}</span>,
      },
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => <span className="font-mono text-[11px]">{getValue<string>()}</span> },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ getValue }) => <Badge variant={ROLE_VARIANT[getValue<Role>()] ?? 'default'}>{getValue<Role>()}</Badge>,
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ getValue }) =>
          getValue<boolean>() ? <Badge variant="success" dot>Active</Badge> : <Badge variant="danger" dot>Disabled</Badge>,
      },
      { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => formatDateTime(getValue()) },
    ],
    [],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Administration"
        description="Accounts and role assignments across the platform."
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Create user
          </Button>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          isLoading={query.isLoading}
          emptyState={<EmptyState icon={Users} title="No users" description="Seeded accounts will appear here." />}
        />
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create user"
        description="POST /api/admin/users — the API validates uniqueness and hashes the password."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="create-user-form" type="submit" loading={createMutation.isPending}>
              Create user
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Full name</span>
            <Input
              required
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="Grace Hopper"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
            <Input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="grace@medidata.local"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Role</span>
              <Select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="min. 8 characters"
              />
            </label>
          </div>
          {formError ? (
            <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
              {formError}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}

/** ADMIN-only route — the API enforces the same rule server-side. */
export default function AdminUsersPage() {
  return (
    <AuthGuard action="read" subject="admin">
      <AdminContent />
    </AuthGuard>
  );
}
