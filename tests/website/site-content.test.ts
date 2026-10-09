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
    expect(css, 'line token must match the app palette').toMatch(/--line:\s*#DCE2D8\s*;/i);
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
      if (page.route !== '/') {
        expect(html).toContain('8 October 2026');
        expect(html).toContain(`href="${page.route}" aria-current="page"`);
        expect(html).toContain('aria-label="On this page"');
        expect(html).toContain('href="#main-content"');
      }
    }
  });

  it('provides a safe deletion request path', () => {
    const deletion = readPage('delete-account/index.html');
    expect(deletion, 'missing in-app deletion instructions').toContain('Settings → Account → Delete account');
    expect(deletion, 'missing email fallback').toContain('mailto:support@strandcue.co.za?subject=');
    expect(deletion.toLowerCase(), 'missing credential warning').toContain('password');
    for (const category of ['Hair Passport', 'services', 'activities', 'shelf', 'tools', 'history', 'Auth identity']) {
      expect(deletion).toContain(category);
    }
    expect(deletion).toContain('Non-personal catalogue facts remain');
    expect(deletion).toContain('email address associated with your account');
    expect(deletion).toContain('verify that the account belongs to you');
    expect(deletion).toContain('This website does not delete accounts');
    for (const credential of ['recovery code', 'access token', 'exported record']) expect(deletion).toContain(credential);
    const emailLinks = [...deletion.matchAll(/href="(mailto:[^"]+)"/g)].map(match => match[1]);
    expect(emailLinks).toContain('mailto:support@strandcue.co.za?subject=StrandCue%20account%20deletion%20request');
    expect(emailLinks.every(link => link === 'mailto:support@strandcue.co.za'
      || link === 'mailto:support@strandcue.co.za?subject=StrandCue%20account%20deletion%20request')).toBe(true);
  });

  it('describes only verified privacy behavior', () => {
    const privacy = readPage('privacy/index.html');
    for (const fact of ['Account details', 'Hair records', 'Operational and security records', 'Support correspondence',
      'Supabase', 'authentication and database', 'Cloudflare', 'website', 'account deletion',
      'JSON', 'CSV', '24 hours', '7 days', 'correction', 'username', 'deletion reason']) {
      expect(privacy, `missing privacy fact: ${fact}`).toContain(fact);
    }
    expect(privacy).toContain('no analytics, advertising, cookies, or contact forms');
    expect(privacy).not.toMatch(/GDPR.compliant|POPIA.compliant|end.to.end encrypt|stored only in|delete.{0,20}within \d+|guarantee/i);
  });

  it('covers the support journeys', () => {
    const support = readPage('support/index.html');
    for (const topic of ['Sign-in', 'Email confirmation', 'Password recovery', 'Export', 'Account deletion', 'Security or privacy']) {
      expect(support).toContain(topic);
    }
    expect(support).toContain('href="/delete-account"');
    expect(support).toContain('href="/privacy"');
    expect(support).toContain('Never send your password');
    expect(support).toContain('If the confirmation email is missing or its link cannot be used, contact support');
  });

  it('states the cosmetic-record terms boundary', () => {
    const terms = readPage('terms/index.html');
    for (const boundary of ['adults', 'lawful', 'does not diagnose', 'does not prescribe',
      'other users', 'disrupt', 'responsible', 'intellectual property', 'unavailable']) {
      expect(terms).toContain(boundary);
    }
    expect(terms).not.toMatch(/governing law|liability.{0,20}(cap|limit)|registered (office|number)|warrant/i);
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

  it('uses unique canonical metadata', () => {
    const titles: string[] = [];
    const descriptions: string[] = [];
    for (const page of pages) {
      const html = readPage(page.file);
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
      const canonical = `https://strandcue.co.za${page.route}`;
      expect(title).toBeTruthy();
      expect(description).toBeTruthy();
      expect(html).toContain(`<meta property="og:title" content="${title}"`);
      expect(html).toContain(`<meta property="og:description" content="${description}"`);
      expect(html).toContain(`<meta property="og:url" content="${canonical}"`);
      expect(html).toContain(`<link rel="canonical" href="${canonical}"`);
      expect(html).toContain('href="/styles.css"');
      expect(html).toContain('href="/favicon.svg"');
      expect(html).not.toMatch(/og:image/i);
      titles.push(title!);
      descriptions.push(description!);
    }
    expect(new Set(titles).size).toBe(5);
    expect(new Set(descriptions).size).toBe(5);
  });

  it('includes the visible brand caption in each accessible home link', () => {
    for (const file of [...pages.map(page => page.file), '404.html']) {
      const links = [...readPage(file).matchAll(/<a class="brand-lockup"[^>]+>/g)].map(match => match[0]);
      expect(links).toHaveLength(2);
      expect(links.every(link => link.includes('aria-label="StrandCue — Your hair record — home"'))).toBe(true);
    }
  });

  it('publishes only canonical sitemap routes', () => {
    expect(existsSync(resolve(publicDirectory, 'sitemap.xml'))).toBe(true);
    const sitemap = readPage('sitemap.xml');
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])).toEqual([
      'https://strandcue.co.za/', 'https://strandcue.co.za/privacy',
      'https://strandcue.co.za/delete-account', 'https://strandcue.co.za/support',
      'https://strandcue.co.za/terms',
    ]);
    expect(readPage('robots.txt')).toBe('User-agent: *\nAllow: /\nSitemap: https://strandcue.co.za/sitemap.xml\n');
  });
});
