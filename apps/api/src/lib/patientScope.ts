/**
 * Resolve the app.Patient that belongs to the logged-in PATIENT user.
 *
 * The schema has no user→patient link table, so we resolve in order:
 *   1. A patient whose `email` matches the user's email.
 *   2. Fallback: the first seeded patient (lowest MRN) so the demo portal
 *      account always lands on *a* record.
 * TODO(schema): a `User.patientId` FK (or Patient.userId) would make this
 * exact; see report.
 */
import { prisma, type Patient } from '@medidata/db';
import type { AuthContext } from '../middleware/auth.js';

export async function resolvePatientForUser(auth: AuthContext): Promise<Patient | null> {
  const byEmail = await prisma.patient.findFirst({ where: { email: auth.email } });
  if (byEmail) return byEmail;
  return prisma.patient.findFirst({ orderBy: { mrn: 'asc' } });
}
