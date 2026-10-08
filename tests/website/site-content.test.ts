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
    expect(home).toContain('strandcue');
    expect(home).toContain('Your hair record');
    for (const area of ['Hair Passport', 'chemical services', 'activities', 'shelf', 'tools', 'history', 'export', 'deletion']) {
      expect(home.toLowerCase(), `missing product area: ${area}`).toContain(area.toLowerCase());
    }
    expect(home.toLowerCase(), 'missing factual-record boundary').toMatch(/does not diagnose/);
    expect(home.toLowerCase()).toContain('does not prescribe');
    expect(home.toLowerCase()).toContain('privacy controls');
  });

  it('uses the app visual tokens', () => {
    const cssPath = resolve(publicDirectory, 'styles.css');
    expect(existsSync(cssPath), 'missing shared stylesheet').toBe(true);
    const css = readFileSync(cssPath, 'utf8');
    for (const colour of ['#F7F5EF', '#253A30', '#E8EDDF', '#667D49', '#8C3B30']) {
      expect(css.toUpperCase()).toContain(colour);
    }
    expect(readPage('index.html')).toMatch(/<link\b[^>]*href="\/styles\.css"/);
    expect(existsSync(resolve(publicDirectory, 'favicon.svg'))).toBe(true);
    expect(readPage('index.html')).toMatch(/<link\b[^>]*rel="icon"[^>]*href="\/favicon\.svg"/);
  });

  it('provides complete navigation without JavaScript', () => {
    for (const file of ['index.html', '404.html']) {
      const html = readPage(file);
      const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
      const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? '';
      for (const route of ['/', '/privacy', '/delete-account', '/support', '/terms']) {
        expect(header, `missing header link ${route} on ${file}`).toContain(`href="${route}"`);
        expect(footer, `missing footer link ${route} on ${file}`).toContain(`href="${route}"`);
      }
      expect(html).not.toMatch(/<script\b/i);
    }
    expect(readPage('index.html')).toMatch(/<a\b[^>]*href="\/"[^>]*aria-current="page"/);
  });

  it('marks Play availability honestly', () => {
    const home = readPage('index.html');
    expect(home).toContain('Google Play');
    expect(home).toMatch(/not yet available/i);
    expect(home).not.toMatch(/href="[^"\s]*play\.google\.com/i);
    expect(home).not.toMatch(/<button\b/i);
  });

  it('supports keyboard and reduced-motion users', () => {
    for (const file of ['index.html', '404.html']) {
      const html = readPage(file);
      expect(html).toMatch(/<a\b[^>]*class="skip-link"[^>]*href="#main-content"/);
      expect(html).toMatch(/<main\b[^>]*id="main-content"/);
    }
    const cssPath = resolve(publicDirectory, 'styles.css');
    expect(existsSync(cssPath), 'missing keyboard and motion styles').toBe(true);
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/min-width:\s*44px/);
  });

  it('renders a useful 404', () => {
    const html = readPage('404.html');
    expect(html).toContain('strandcue');
    expect(html).toContain('Page not found');
    const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] ?? '';
    expect(main).toMatch(/href="\/"[^>]*>[^<]*Home/i);
    expect(main).toMatch(/href="\/support"[^>]*>[^<]*Support/i);
    expect(html).toMatch(/<meta\b[^>]*name="robots"[^>]*content="noindex"/);
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
