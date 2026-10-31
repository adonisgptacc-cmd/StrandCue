import { describe, expect, it } from 'vitest';

import { normalizeLineEndings } from '../helpers/normalize-line-endings';

describe('line-ending normalization', () => {
  it('treats LF and CRLF input as the same semantic text', () => {
    const lf = 'User-agent: *\nAllow: /\nSitemap: https://strandcue.co.za/sitemap.xml\n';
    const crlf = 'User-agent: *\r\nAllow: /\r\nSitemap: https://strandcue.co.za/sitemap.xml\r\n';
    expect(normalizeLineEndings(crlf)).toBe(lf);
    expect(normalizeLineEndings(lf)).toBe(lf);
  });

  it('normalizes the exact comparison shapes used by the website and CI tests', () => {
    const headersLf = '/*\n  X-Frame-Options: DENY\n\nhttps://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex\n';
    const headersCrlf = headersLf.replaceAll('\n', '\r\n');
    for (const headers of [headersLf, headersCrlf]) {
      const normalized = normalizeLineEndings(headers);
      expect(normalized.startsWith('/*\n')).toBe(true);
      expect(normalized).toContain('https://:version.:subdomain.workers.dev/*\n  X-Robots-Tag: noindex');
      expect(normalized.split('\n\n')[0]).not.toMatch(/X-Robots-Tag/i);
    }

    const workflowLf = 'on:\n  workflow_dispatch:\n';
    const workflowCrlf = workflowLf.replaceAll('\n', '\r\n');
    expect(normalizeLineEndings(workflowCrlf)).toMatch(/on:\n  workflow_dispatch:/);
    expect(normalizeLineEndings(workflowLf)).toMatch(/on:\n  workflow_dispatch:/);
  });
});
