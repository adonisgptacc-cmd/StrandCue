import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';

import { Button, Choice, Field, MultiChoice, styles } from '../../apps/mobile/src/ui';

function render(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('|');
  const element = node as ReactElement<any>;
  if (typeof element.type === 'function') return render((element.type as Function)(element.props));
  const label = element.props['aria-label'] ? `label="${element.props['aria-label']}"` : 'NO-LABEL';
  const role = element.props.role ? `role=${element.props.role}` : 'NO-ROLE';
  const disabled = element.props.disabled ? 'disabled' : '';
  return `[${label} ${role}${disabled ? ` ${disabled}` : ''}]${render(element.props.children)}`;
}

vi.mock('react-native', () => {
  const host = (tag: string) => ({ children, accessibilityLabel, accessibilityRole, accessibilityState, onPress, onChangeText, ...props }: any) => createElement(tag, {
    'aria-label': accessibilityLabel, role: accessibilityRole,
    disabled: accessibilityState?.disabled || props.disabled || props.editable === false,
    value: props.value, onChange: () => undefined,
  }, children);
  return { Text: host('span'), View: host('div'), Pressable: host('button'), TextInput: host('input'), ScrollView: host('div'), StyleSheet: { create: (value: unknown) => value } };
});

describe('accessibility contracts', () => {
  it('exposes labels and roles on every interactive primitive', () => {
    expect(render(createElement(Button, { title: 'Save activity', onPress: () => undefined }))).toContain('label="Save activity"');
    expect(render(createElement(Button, { title: 'Save activity', onPress: () => undefined }))).toContain('role=button');
    expect(render(createElement(Field, { label: 'Product name', value: '', onChangeText: () => undefined }))).toContain('label="Product name"');
  });

  it('keeps touch targets at or above 48dp', () => {
    const targets = [styles.button.minHeight, styles.input.minHeight, styles.pill.minHeight];
    for (const minHeight of targets) {
      expect(minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('labels every choice option with its group and exposes selection state', () => {
    const html = render(createElement(Choice, {
      label: 'Activity kind', value: 'wash', options: ['wash', 'styling'] as const, onChange: () => undefined,
    }));
    expect(html).toContain('label="Activity kind: wash"');
    expect(html).toContain('label="Activity kind: styling"');
    expect(html).toContain('role=radio');
    const multi = render(createElement(MultiChoice, {
      label: 'Concerns', value: ['dryness'], options: ['dryness', 'frizz'] as const, onChange: () => undefined,
    }));
    expect(multi).toContain('role=checkbox');
    expect(multi).toContain('choose all that apply');
  });

  it('reflects disabled state to assistive technology', () => {
    expect(render(createElement(Button, { title: 'Saving', disabled: true, onPress: () => undefined }))).toContain('disabled');
  });
});
