/**
 * Admin — user management (ADMIN only). Create hashes the password with
 * bcryptjs (cost 10) and never returns the hash.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { paged, type Paged } from '../../lib/envelope.js';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'PHYSICIAN', 'LAB_TECH', 'BILLER', 'ANALYST', 'AUDITOR', 'PATIENT']),
});

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  role: z.enum(['ADMIN', 'PHYSICIAN', 'LAB_TECH', 'BILLER', 'ANALYST', 'AUDITOR', 'PATIENT']).optional(),
});

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listUsers(query: z.infer<typeof ListQuerySchema>): Promise<Paged<unknown>> {
  const where = query.role ? { role: query.role } : undefined;
  const { page, pageSize } = query;
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { email: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, select: SAFE_SELECT }),
  ]);
  return paged(items, page, pageSize, total);
}

export async function createUser(body: z.infer<typeof CreateUserSchema>): Promise<unknown> {
  const passwordHash = await bcrypt.hash(body.password, 10);
  return prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      fullName: body.fullName,
      role: body.role,
      passwordHash,
    },
    select: SAFE_SELECT,
  });
}

/** Convenience for tests/demos: is this request from an ADMIN? */
export function isAdmin(req: Request): boolean {
  return req.auth?.role === 'ADMIN';
}
