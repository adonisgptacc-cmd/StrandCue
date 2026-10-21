import { describe, expect, it } from 'vitest';

import type { GuidanceGap, GuidanceGapReason } from '../../packages/domain/src/index';
import {
  contentPendingItem,
  failedSourceItems,
  gapRenderKey,
  resolverItemFor,
  resolverItems,
  unknownSourceFailureItem,
  type GuidanceResolverInput,
} from '../../apps/mobile/src/guidance/guidance-gap-state';
import {
  CHECK_IN_SUMMARY_TIME,
  statusTitle,
  zoneLabel,
} from '../../apps/mobile/src/guidance/guidance-copy';

/**
 * Task 3.2: the guidance gap resolver state.
 *
 * Pure functions only: the resolver's routing, ordering, keys and copy are
 * decided here, so they can be proven without a screen. Every fixture is
 * synthetic; no owner data is used.
 */

const PASSPORT_GAP: GuidanceGap = {
  kind: 'hair_profile',
  detail: 'Add your strand thickness in My Hair so your plan can use it.',
  subject: 'strandDiameter',
  state: 'missing',
  destination: 'my_hair',
  reason: 'passport_fact_missing',
  subjectLabel: 'your strand thickness',
};

const PASSPORT_UNKNOWN_GAP: GuidanceGap = {
  kind: 'hair_profile',
  detail: 'You recorded your hair density as not sure. Add it when you know, or choose a different goal.',
  subject: 'density',
  state: 'unknown',
  destination: 'my_hair',
  reason: 'passport_fact_unknown',
  subjectLabel: 'your hair density',
};

const SERVICE_GAP: GuidanceGap = {
  kind: 'service_presence',
  detail: 'We cannot tell whether the bleach or lightener service you recorded is still affecting your hair. Update it in My Hair under Services.',
  subject: 'service-1',
  state: 'unknown',
  destination: 'my_hair_services',
  reason: 'service_presence_unknown',
  subjectLabel: 'the bleach or lightener service you recorded',
};

const SECOND_SERVICE_GAP: GuidanceGap = {
  kind: 'service_presence',
  detail: 'We cannot tell whether the highlights service you recorded is still affecting your hair. Update it in My Hair under Services.',
  subject: 'service-2',
  state: 'unknown',
  destination: 'my_hair_services',
  reason: 'service_presence_unknown',
  subjectLabel: 'the highlights service you recorded',
};

const SHELF_GAP: GuidanceGap = {
  kind: 'product_capability',
  detail: 'Your saved shampoo is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Shelf.',
  subject: 'owner-item-1',
  state: 'unknown',
  destination: 'my_shelf',
  reason: 'product_manual_unmatched',
  subjectLabel: 'your saved shampoo',
};

const TOOL_GAP: GuidanceGap = {
  kind: 'tool_capability',
  detail: 'StrandCue cannot read the exact temperature you use with your dryer. Add it in My Tools.',
  subject: 'owner-item-2',
  state: 'unknown',
  destination: 'my_tools',
  reason: 'tool_temperature_unknown',
  subjectLabel: 'your dryer',
};

const CHECK_IN_GAP: GuidanceGap = {
  kind: 'current_condition',
  detail: 'Your answers about what you notice today do not agree. Change them in today\'s check-in.',
  subject: 'current.concerns',
  state: 'contradictory',
  destination: 'today_check_in',
  reason: 'check_in_contradictory',
  subjectLabel: null,
};

function input(overrides: Partial<GuidanceResolverInput> = {}): GuidanceResolverInput {
  return { gaps: [], failedSources: [], contentPending: false, ...overrides };
}

describe('guidance gap routing', () => {
  it('routes a missing Passport fact to My Hair', () => {
    const items = resolverItems(input({ gaps: [PASSPORT_GAP] }));
    expect(items).toHaveLength(1);
    expect(items[0].route).toBe('my_hair');
    expect(items[0].primaryAction?.label).toBe('Add your strand thickness in My Hair');
    expect(items[0].state).toBe('missing');
  });

  it('routes a required Passport fact recorded as unknown to My Hair', () => {
    const items = resolverItems(input({ gaps: [PASSPORT_UNKNOWN_GAP] }));
    expect(items[0].route).toBe('my_hair');
    expect(items[0].state).toBe('unknown');
    expect(items[0].title).toContain('not sure');
  });

  it('routes a chemical-service gap to Services without an arrow', () => {
    const items = resolverItems(input({ gaps: [SERVICE_GAP] }));
    expect(items[0].route).toBe('my_hair_services');
    expect(items[0].primaryAction?.label).toBe('Review your chemical services');
    // The spoken label names the destination in words. An arrow is read out
    // as punctuation and says nothing the label does not already say.
    expect(items[0].primaryAction?.accessibilityLabel).toBe('Review your chemical services in My Hair');
    expect(items[0].primaryAction?.accessibilityLabel).not.toContain('→');
    expect(items[0].title).not.toContain('→');
  });

  it('routes a missing product setup to My Shelf and offers a matching action', () => {
    const items = resolverItems(input({ gaps: [SHELF_GAP] }));
    expect(items[0].route).toBe('my_shelf');
    expect(items[0].primaryAction?.label).toBe('Review My Shelf');
    expect(items[0].secondaryAction?.label).toBe('Match your saved shampoo');
  });

  it('routes a missing tool setup to My Tools and names the missing fact', () => {
    const items = resolverItems(input({ gaps: [TOOL_GAP] }));
    expect(items[0].route).toBe('my_tools');
    expect(items[0].primaryAction?.label).toBe('Review My Tools');
    expect(items[0].secondaryAction?.label).toBe('Add the exact temperature for your dryer');
  });

  it('routes a contradictory check-in back to the check-in', () => {
    const items = resolverItems(input({ gaps: [CHECK_IN_GAP] }));
    expect(items[0].route).toBe('today_check_in');
    expect(items[0].primaryAction?.label).toBe('Review check-in answers');
    expect(items[0].internalSubject).toBe('current.concerns');
  });
});

describe('failed reads', () => {
  it('names the area of every failed read and offers one retry', () => {
    const items = failedSourceItems([
      { source: 'passport', state: 'failed' },
      { source: 'products', state: 'truncated' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].state).toBe('failed_source');
    expect(items[0].title).toContain('My Hair');
    expect(items[1].title).toContain('My Shelf');
    for (const item of items) {
      expect(item.route).toBe('retry_sources');
      expect(item.primaryAction?.label).toBe('Try again');
      expect(item.secondaryAction).toBeNull();
    }
  });

  it('names the correct area for a Shelf, a Tool, an activity and a service read', () => {
    const items = failedSourceItems([
      { source: 'products', state: 'failed' },
      { source: 'tools', state: 'failed' },
      { source: 'activities', state: 'failed' },
      { source: 'services', state: 'failed' },
    ]);
    expect(items.map(item => item.title)).toEqual([
      'We could not read your recorded activity. Nothing was changed, and nothing was guessed.',
      'We could not read My Shelf. Nothing was changed, and nothing was guessed.',
      'We could not read your chemical services. Nothing was changed, and nothing was guessed.',
      'We could not read My Tools. Nothing was changed, and nothing was guessed.',
    ]);
  });

  it('says a read failed without naming an area it does not know', () => {
    const item = unknownSourceFailureItem();
    expect(item.title).toContain('We could not read your records');
    expect(item.title).not.toContain('My Shelf');
    expect(item.title).not.toContain('My Tools');
    expect(item.route).toBe('retry_sources');
  });
});

describe('content that is not published', () => {
  it('asks nothing of the owner and offers no way to change their records', () => {
    const item = contentPendingItem();
    expect(item.state).toBe('content_pending');
    expect(item.route).toBe('content_pending');
    expect(item.primaryAction).toBeNull();
    expect(item.secondaryAction).toBeNull();
    expect(item.title).toContain('Reviewed guidance for this situation is not available yet.');
    expect(item.title).toContain('We read your information');
    expect(item.title).toContain('did not guess');
  });

  it('never routes a content gap to a records destination', () => {
    const items = resolverItems(input({ contentPending: true }));
    expect(items).toHaveLength(1);
    expect(items[0].route).toBe('content_pending');
    expect(items[0].route).not.toBe('my_hair');
    expect(items[0].route).not.toBe('my_shelf');
    expect(items[0].route).not.toBe('my_tools');
  });
});

describe('ordering and keys', () => {
  it('orders failed reads, then the check-in, then the facts, services, shelf and tools', () => {
    const items = resolverItems(input({
      gaps: [TOOL_GAP, SHELF_GAP, SERVICE_GAP, PASSPORT_GAP, CHECK_IN_GAP],
      failedSources: [{ source: 'passport', state: 'failed' }],
    }));
    expect(items.map(item => item.route)).toEqual([
      'retry_sources',
      'today_check_in',
      'my_hair',
      'my_hair_services',
      'my_shelf',
      'my_tools',
    ]);
  });

  it('produces the same order whatever order the gaps arrived in', () => {
    const gaps = [TOOL_GAP, SHELF_GAP, SERVICE_GAP, PASSPORT_GAP, CHECK_IN_GAP];
    const first = resolverItems(input({ gaps }));
    const second = resolverItems(input({ gaps: [...gaps].reverse() }));
    expect(second.map(item => item.key)).toEqual(first.map(item => item.key));
    expect(second.map(item => item.route)).toEqual(first.map(item => item.route));
  });

  it('gives two similar service gaps distinct keys and distinct labels', () => {
    const items = resolverItems(input({ gaps: [SERVICE_GAP, SECOND_SERVICE_GAP] }));
    expect(items).toHaveLength(2);
    expect(items[0].key).not.toBe(items[1].key);
    expect(items[0].title).not.toBe(items[1].title);
    expect(items[0].title).toContain('bleach or lightener');
    expect(items[1].title).toContain('highlights');
  });

  it('never collides the keys of two issues about the same field', () => {
    const other: GuidanceGap = { ...PASSPORT_GAP, reason: 'passport_fact_unknown', state: 'unknown' };
    const items = resolverItems(input({ gaps: [PASSPORT_GAP, other] }));
    expect(items).toHaveLength(2);
    expect(items[0].key).not.toBe(items[1].key);
  });

  it('never uses the same key twice, even for two identical gaps', () => {
    const items = resolverItems(input({ gaps: [PASSPORT_GAP, PASSPORT_GAP] }));
    expect(items).toHaveLength(2);
    expect(items[0].key).not.toBe(items[1].key);
  });

  it('builds a key that carries no record id and no owner wording', () => {
    const key = gapRenderKey(SERVICE_GAP);
    expect(key).not.toContain('service-1');
    expect(key).not.toContain('bleach');
    expect(key).toMatch(/^gap:service_presence:service_presence_unknown:[0-9a-f]{16}$/);
  });
});

describe('plain language and privacy', () => {
  it('never shows a record id, a field path or database wording', () => {
    const items = resolverItems(input({
      gaps: [PASSPORT_GAP, SERVICE_GAP, SHELF_GAP, TOOL_GAP, CHECK_IN_GAP],
      failedSources: [{ source: 'passport', state: 'failed' }],
    }));
    // Only the owner-facing words are checked: the internal subject stays
    // internal and is never rendered.
    const ownerFacing = items.flatMap(item => [
      item.title,
      item.primaryAction?.label ?? '',
      item.primaryAction?.accessibilityLabel ?? '',
      item.secondaryAction?.label ?? '',
      item.secondaryAction?.accessibilityLabel ?? '',
    ]);
    for (const words of ownerFacing) {
      expect(words).not.toMatch(/strandDiameter|current\.concerns|owner-item-|service-1/);
      expect(words).not.toMatch(/select |invalid|schema|field|source_incomplete|unsupported capability|rule conflict/i);
      expect(words).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    }
  });

  it('says a manual product cannot be verified yet, and never calls it unsafe', () => {
    const items = resolverItems(input({ gaps: [SHELF_GAP] }));
    expect(items[0].title).toContain('cannot check the exact version yet');
    expect(items[0].title).not.toMatch(/unsafe|dangerous|harmful/i);
  });
});

describe('every gap shape the resolver can meet', () => {
  it('sends a gap with no destination to the content state, and offers nothing', () => {
    const orphan: GuidanceGap = {
      kind: 'reviewed_content',
      detail: 'Reviewed guidance for this situation is not available yet.',
      subject: null,
      state: 'unsupported',
      destination: null,
      reason: 'content_not_published',
    };
    const items = resolverItems(input({ gaps: [orphan] }));
    expect(items[0].route).toBe('content_pending');
    expect(items[0].primaryAction).toBeNull();
  });

  it('offers the one second action each kind of setup item deserves', () => {
    const reasons: GuidanceGapReason[] = [
      'product_unavailable',
      'product_manual_unmatched',
      'product_capability_unpublished',
      'product_no_candidate',
      'tool_unavailable',
      'tool_not_recorded',
      'tool_manual_unmatched',
      'tool_temperature_unknown',
      'tool_heat_method_unknown',
    ];
    for (const reason of reasons) {
      const gap: GuidanceGap = {
        kind: reason.startsWith('product') ? 'product_capability' : 'tool_capability',
        detail: 'A setup item.',
        subject: 'item-1',
        state: 'missing',
        destination: reason.startsWith('product') ? 'my_shelf' : 'my_tools',
        reason,
        subjectLabel: 'an item',
      };
      const item = resolverItemFor(gap);
      expect(item.secondaryAction).not.toBeNull();
    }
  });

  it('orders two items of the same kind by their reason, subject and wording', () => {
    const first: GuidanceGap = { ...PASSPORT_GAP, subject: 'a', reason: 'passport_fact_missing' };
    const second: GuidanceGap = { ...PASSPORT_GAP, subject: 'b', reason: 'passport_fact_unknown' };
    const third: GuidanceGap = { ...PASSPORT_GAP, subject: 'b', reason: 'passport_fact_unknown', detail: 'Another wording.' };
    const items = resolverItems(input({ gaps: [third, second, first] }));
    expect(items.map(item => item.key)).toHaveLength(3);
    expect(new Set(items.map(item => item.key)).size).toBe(3);
  });

});

describe('the wording the resolver uses', () => {
  it('names every state the screen can be in', () => {
    expect(statusTitle({ status: 'ready' } as never)).toBe('Your plan is ready');
    expect(statusTitle({ status: 'needs_setup' } as never)).toBe('A few things are needed first');
    expect(statusTitle({ status: 'content_pending' } as never)).toContain('still being prepared');
    expect(statusTitle({ status: 'needs_input' } as never)).toContain('needs a little more');
    expect(statusTitle({ status: 'rule_conflict' } as never)).toContain('Two reviewed rules disagree');
    expect(statusTitle({ status: 'unsupported' } as never)).toContain('Nothing reviewed covers');
    expect(statusTitle({ status: 'source_error' } as never)).toContain('could not be read');
    expect(statusTitle({ status: 'unknown_status' } as never)).toContain('could not be read');
  });



  it('names a zone in plain words, even when the taxonomy has no name for it', () => {
    expect(zoneLabel({ region: 'crown', segment: 'roots' })).toBe('Crown, Roots');
    expect(zoneLabel({ region: 'nowhere', segment: 'nowhere' })).toBe('Another area, Another part');
  });

  it('says one minute in the singular', () => {
    expect(CHECK_IN_SUMMARY_TIME(1)).toBe('1 minute available');
    expect(CHECK_IN_SUMMARY_TIME(20)).toBe('20 minutes available');
  });
});
