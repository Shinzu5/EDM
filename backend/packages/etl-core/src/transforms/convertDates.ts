/**
 * Transform 3 — convertDates: all date formats → ISO.
 *
 * Handles ISO dates, ISO datetimes, MM/DD/YYYY and DD/MM/YYYY (auto-detected).
 * Date-only fields stay 'YYYY-MM-DD'; datetime fields become full ISO-8601 UTC
 * strings. Unparseable values become null and are flagged DATE_UNPARSED.
 */
import type { RawRow, RowTransform } from '../types.js';
import { flag } from '../types.js';
import { DATE_ONLY_FIELDS, DATETIME_FIELDS, parseLooseDate } from './helpers.js';

export const convertDates: RowTransform = (rows: RawRow[]): RawRow[] =>
  rows.map((row) => {
    let out: RawRow = row;
    const dateOnly = DATE_ONLY_FIELDS[row.recordType] ?? [];
    const datetime = DATETIME_FIELDS[row.recordType] ?? [];
    for (const key of dateOnly) {
      if (!(key in row.payload)) continue;
      const parsed = parseLooseDate(row.payload[key]);
      if (row.payload[key] !== null && row.payload[key] !== '' && parsed.value === null) {
        out = flag(out, `DATE_UNPARSED:${key}`);
      }
      // Preserve date-only semantics: 'YYYY-MM-DD' (or null).
      const value = parsed.value === null ? null : parsed.value.slice(0, 10);
      out = { ...out, payload: { ...out.payload, [key]: value } };
    }
    for (const key of datetime) {
      if (!(key in row.payload)) continue;
      const parsed = parseLooseDate(row.payload[key]);
      if (row.payload[key] !== null && row.payload[key] !== '' && parsed.value === null) {
        out = flag(out, `DATE_UNPARSED:${key}`);
      }
      out = { ...out, payload: { ...out.payload, [key]: parsed.value } };
    }
    return out;
  });
