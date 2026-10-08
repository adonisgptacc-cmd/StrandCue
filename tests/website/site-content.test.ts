import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDirectory = resolve('website/public');
const pages = [
  { route: '/', file: 'index.html' },
  { route: '/privacy', file: 'privacy/index.html' },
  { route: '/delete-account', file: 'delete-account/index.html' },
  { route: '/support', file: 'support/index.html' },
  { route: '/terms', file: 'terms/index.html' },
] as const;

function readPage(file: string): string {
  return readFileSync(resolve(publicDirectory, file), 'utf8');
}

describe('public website content', () => {
  it('defines every canonical route', () => {
    for (const page of pages) {
      expect(existsSync(resolve(publicDirectory, page.file)), page.route).toBe(true);
    }
    expect(existsSync(resolve(publicDirectory, '404.html')), 'branded 404 route').toBe(true);
  });

  it('provides the shared public assets', () => {
    for (const asset of ['styles.css', 'favicon.svg', 'robots.txt', 'sitemap.xml', '_headers']) {
      expect(existsSync(resolve(publicDirectory, asset)), `missing public asset: ${asset}`).toBe(true);
    }
  });

  it('renders the factual product overview', () => {
    const home = readPage('index.html');
    for (const area of ['Hair Passport', 'chemical services', 'activities', 'shelf', 'tools', 'history', 'export', 'deletion']) {
      expect(home.toLowerCase(), `missing product area: ${area}`).toContain(area.toLowerCase());
    }
    expect(home.toLowerCase(), 'missing factual-record boundary').toMatch(/does not diagnose/);
  });

  it('identifies the operator and contact consistently', () => {
    for (const page of pages) {
      const html = readPage(page.file);
      expect(html, `missing operator on ${page.route}`).toContain('Common Sense Inc.');
      expect(html, `missing support contact on ${page.route}`).toContain('support@strandcue.co.za');
    }
  });

  it('provides a safe deletion request path', () => {
    const deletion = readPage('delete-account/index.html');
    expect(deletion, 'missing in-app deletion instructions').toContain('Settings → Account → Delete account');
    expect(deletion, 'missing email fallback').toContain('mailto:support@strandcue.co.za?subject=');
    expect(deletion.toLowerCase(), 'missing credential warning').toContain('password');
  });

  it('supplies canonical page metadata', () => {
    for (const page of pages) {
      const html = readPage(page.file);
      const canonical = `https://strandcue.co.za${page.route === '/' ? '/' : page.route}`;
      expect(html, `missing canonical URL for ${page.route}`).toMatch(
        new RegExp(`<link\\b[^>]*rel=["']canonical["'][^>]*href=["']${canonical.replaceAll('.', '\\.')}["']`, 'i'),
      );
      expect(html, `missing description on ${page.route}`).toMatch(/<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i);
    }
  });
});
