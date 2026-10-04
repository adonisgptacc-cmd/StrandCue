import { describe, expect, it } from 'vitest';

import { createAnalytics, documentedEvents } from '../../apps/mobile/src/analytics';

describe('consent-gated analytics allowlist', () => {
  it('documents every event with its allowed properties', () => {
    expect(documentedEvents.length).toBeGreaterThan(0);
    for (const event of documentedEvents) {
      expect(event.name).toMatch(/^[a-z_]+$/);
      expect(typeof event.description).toBe('string');
    }
  });

  it('is disabled by default and emits nothing without consent', () => {
    const seen: unknown[] = [];
    const analytics = createAnalytics({ sink: event => { seen.push(event); } });
    analytics.track('session_start', {});
    expect(seen).toEqual([]);
  });

  it('emits documented events after consent and stops on withdrawal', () => {
    const seen: unknown[] = [];
    const analytics = createAnalytics({ sink: event => { seen.push(event); } });
    analytics.setConsent(true);
    analytics.track('session_start', {});
    analytics.track('product_added', { category: 'shampoo' });
    expect(seen).toHaveLength(2);
    analytics.setConsent(false);
    analytics.track('session_start', {});
    expect(seen).toHaveLength(2);
  });

  it('rejects undocumented events and properties', () => {
    const analytics = createAnalytics({ sink: () => undefined });
    analytics.setConsent(true);
    expect(() => analytics.track('user_did_a_secret_thing' as never, {})).toThrow();
    expect(() => analytics.track('product_added', { productName: 'K18' } as never)).toThrow();
    expect(() => analytics.track('product_added', { category: 'not-a-category' })).toThrow();
  });

  it('rejects PII-bearing payloads even when shaped like valid properties', () => {
    const analytics = createAnalytics({ sink: () => { throw new Error('must never send'); } });
    analytics.setConsent(true);
    const adversaries = [
      { category: 'user@example.test' },
      { category: '550e8400-e29b-41d4-a716-446655440000' },
      { category: 'my shedding notes here' },
      { category: 'a'.repeat(101) },
    ];
    for (const props of adversaries) {
      expect(() => analytics.track('product_added', props as never)).toThrow();
    }
  });

  it('never blocks core recordkeeping on telemetry failure', () => {
    const analytics = createAnalytics({
      sink: () => { throw new Error('network down'); },
    });
    analytics.setConsent(true);
    expect(() => analytics.track('session_start', {})).not.toThrow();
  });
});
