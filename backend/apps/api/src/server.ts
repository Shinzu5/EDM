/**
 * @medidata/api — REST + FHIR API server (Express 4).
 *
 * FOUNDATION STUB: only GET /health is implemented so the platform boots and
 * is verifiable end-to-end. The API agent owns everything else listed in
 * ENDPOINTS (@medidata/shared): auth (JWT via jose + CASL), patients/360,
 * labs, billing, insurance, portal, governance, KPIs, ML risk, SSE stream,
 * FHIR resources, HL7 ingestion, webhooks and the OpenAPI document.
 */
import express from 'express';
import { API_PORT } from '@medidata/shared';

const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { ok: true } });
});

const port = Number(process.env.API_PORT ?? process.env.PORT ?? API_PORT);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port} (health: GET /health)`);
});
