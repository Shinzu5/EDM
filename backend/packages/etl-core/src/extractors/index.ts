/** Connector registry — the five siloed source systems of the MediData demo. */
import type { Connector } from '../types.js';
import { emrConnector } from './emr.js';
import { lisConnector } from './lis.js';
import { billingConnector } from './billing.js';
import { insuranceConnector } from './insurance.js';
import { legacyConnector } from './legacy.js';

export { defaultFixturesDir } from '../paths.js';

export { emrConnector, lisConnector, billingConnector, insuranceConnector, legacyConnector };

export const CONNECTOR_NAMES = ['emr', 'lis', 'billing', 'insurance', 'legacy'] as const;
export type ConnectorName = (typeof CONNECTOR_NAMES)[number];

const FACTORIES: Record<ConnectorName, (fixturesDir?: string) => Connector> = {
  emr: emrConnector,
  lis: lisConnector,
  billing: billingConnector,
  insurance: insuranceConnector,
  legacy: legacyConnector,
};

export function getConnector(name: ConnectorName, fixturesDir?: string): Connector {
  const factory = FACTORIES[name];
  if (!factory) throw new Error(`Unknown connector: ${name}`);
  return factory(fixturesDir);
}

/** All five connectors, in deterministic order. */
export function allConnectors(fixturesDir?: string): Connector[] {
  return CONNECTOR_NAMES.map((n) => getConnector(n, fixturesDir));
}
