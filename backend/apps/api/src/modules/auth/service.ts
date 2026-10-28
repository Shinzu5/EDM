/**
 * Auth service — login/logout/me. Passwords are bcrypt-verified and never
 * logged; the JWT is issued by middleware/auth.issueToken (HS256, 8h).
 */
import bcrypt from 'bcryptjs';
import { prisma } from '@medidata/db';
import type { Role } from '@medidata/shared';
import { ApiError } from '../../lib/envelope.js';
import { issueToken } from '../../middleware/auth.js';
import { abilityMapFor } from '../../middleware/rbac.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

export function publicUser(u: {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}): PublicUser {
  return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
}

export async function login(email: string, password: string): Promise<{ user: PublicUser; token: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !user.isActive || !valid) {
    // Constant message — never reveal whether the email exists.
    throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }
  const token = await issueToken(user);
  return { user: publicUser(user), token };
}

export async function me(auth: { userId: string; role: Role; email: string; fullName: string }): Promise<{
  user: PublicUser;
  abilities: string[];
}> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) {
    // Token is valid but the user was deleted — still surface the claims.
    return {
      user: {
        id: auth.userId,
        email: auth.email,
        fullName: auth.fullName,
        role: auth.role,
        isActive: false,
        createdAt: new Date(0),
      },
      abilities: abilityMapFor(auth.role),
    };
  }
  return { user: publicUser(user), abilities: abilityMapFor(user.role) };
}
