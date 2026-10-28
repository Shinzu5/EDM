/**
 * Minimal synthetic PDF generator for portal result downloads when S3 is not
 * configured. Produces a single-page PDF 1.4 document (Helvetica) with the
 * result summary — clearly marked SYNTHETIC. Byte offsets are computed while
 * assembling so the xref table is valid.
 */

interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
}

function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
}

/** Build a valid single-page PDF; returns the raw bytes (latin1-safe ASCII). */
export function buildPdf(title: string, lines: PdfLine[]): Buffer {
  const contentParts: string[] = ['BT', '/F2 16 Tf', '72 740 Td', `(${escapePdfText(title)}) Tj`, 'ET', 'BT', '/F1 10 Tf'];
  let y = 710;
  for (const line of lines) {
    const font = line.bold ? '/F2' : '/F1';
    contentParts.push(`${font} ${line.size ?? 10} Tf`, `72 ${y} Td`, `(${escapePdfText(line.text)}) Tj`, `0 -${(line.size ?? 10) + 4} Td`);
    y -= (line.size ?? 10) + 4;
  }
  contentParts.push('ET');
  const contentStream = contentParts.join('\n');

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** `data:application/pdf;base64,...` URL for direct browser download. */
export function pdfDataUrl(title: string, lines: PdfLine[]): string {
  return `data:application/pdf;base64,${buildPdf(title, lines).toString('base64')}`;
}
