import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface WebsiteConfiguration {
  readonly name: string;
  readonly compatibility_date: string;
  readonly workers_dev: boolean;
  readonly preview_urls: boolean;
  readonly assets: {
    readonly directory: string;
    readonly html_handling: string;
    readonly not_found_handling: string;
  };
  readonly routes?: readonly unknown[];
  readonly route?: unknown;
  readonly main?: string;
  readonly triggers?: unknown;
}

function readConfiguration(): WebsiteConfiguration {
  return JSON.parse(readFileSync('website/wrangler.jsonc', 'utf8')) as WebsiteConfiguration;
}

describe('public website Worker boundary', () => {
  it('keeps the website on a separate worker', () => {
    const configuration = readConfiguration();
    expect(configuration.name).toBe('strandcue-website');
    expect(configuration.compatibility_date).toBe('2026-10-08');
    expect(configuration.workers_dev).toBe(true);
    expect(configuration.preview_urls).toBe(false);
    expect(configuration.main, 'static site must not execute the existing Worker').toBeUndefined();
    expect(configuration.triggers, 'static site must not schedule deletion jobs').toBeUndefined();
  });

  it('uses extensionless static HTML routing', () => {
    expect(readConfiguration().assets).toEqual({
      directory: './public',
      html_handling: 'auto-trailing-slash',
      not_found_handling: '404-page',
    });
  });

  it('does not claim the existing worker host', () => {
    const configuration = readConfiguration();
    const routing = JSON.stringify({ route: configuration.route, routes: configuration.routes });
    expect(routing).not.toContain('strandcue.adonisgptacc.workers.dev');
    expect(routing).not.toContain('strandcue-account-deletion');
    expect(routing).not.toContain('*.workers.dev');
  });
});
