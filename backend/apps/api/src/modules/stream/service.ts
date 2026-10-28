/**
 * SSE event feed — GET /api/stream/events.
 *
 * Per-role feed of:
 *   `result` — new RELEASED lab results (POLICY-filtered per role)
 *   `cdc`    — change-data-capture projections polled from app.OutboxEvent
 *              every 3s
 * Heartbeat comment every 15s; intervals cleared on connection close.
 * Auth via header/cookie, or `?token=` (EventSource cannot set headers).
 */
import type { Request, Response } from 'express';
import { prisma } from '@medidata/db';
import type { Role } from '@medidata/shared';
import { resolvePatientForUser } from '../../lib/patientScope.js';
import { toJsonSafe } from '../../lib/serialize.js';
import { maskPatientForRole, shouldMask } from '../../middleware/masking.js';

const POLL_MS = 3000;
const HEARTBEAT_MS = 15_000;

export async function streamEvents(req: Request, res: Response): Promise<void> {
  const role: Role = req.auth!.role;

  // PATIENT scope: own patient id only.
  let ownPatientId: string | null = null;
  if (role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    ownPatientId = own?.id ?? null;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ role, scopes: ownPatientId ? [ownPatientId] : 'all' })}\n\n`);

  const now = Date.now();
  let resultCursor = new Date(now - POLL_MS); // only results updated after connect
  let outboxCursor = new Date(now);

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(toJsonSafe(data))}\n\n`);
  };

  const poll = async (): Promise<void> => {
    try {
      // CDC projections from the transactional outbox.
      const outbox = await prisma.outboxEvent.findMany({
        where: { createdAt: { gt: outboxCursor } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const e of outbox) {
        outboxCursor = e.createdAt > outboxCursor ? e.createdAt : outboxCursor;
        // Per-role filtering: patients only see their own CDC rows.
        const payload = e.payload as { patientId?: string } | null;
        if (role === 'PATIENT' && payload?.patientId && payload.patientId !== ownPatientId) continue;
        send('cdc', { id: e.id, aggregateType: e.aggregateType, aggregateId: e.aggregateId, eventType: e.eventType, payload: e.payload, createdAt: e.createdAt });
      }

      // Newly released results ("result" events).
      const released = await prisma.labResult.findMany({
        where: {
          status: 'RELEASED',
          updatedAt: { gt: resultCursor },
          ...(ownPatientId ? { patientId: ownPatientId } : {}),
        },
        orderBy: { updatedAt: 'asc' },
        take: 50,
        include: { patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } } },
      });
      for (const r of released) {
        if (r.updatedAt > resultCursor) resultCursor = r.updatedAt;
        const { patient, ...rest } = r;
        send('result', {
          ...rest,
          patient: shouldMask(role) ? maskPatientForRole(patient, role) : { id: patient.id, mrn: patient.mrn },
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'stream poll failed');
      send('error', { message: 'poll failed; retrying' });
    }
  };

  const pollTimer = setInterval(() => void poll(), POLL_MS);
  const heartbeat = setInterval(() => {
    res.write(`: hb ${new Date().toISOString()}\n\n`);
  }, HEARTBEAT_MS);

  void poll();

  const cleanup = (): void => {
    clearInterval(pollTimer);
    clearInterval(heartbeat);
    res.end();
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
}
