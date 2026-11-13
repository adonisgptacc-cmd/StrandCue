import type { RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';

/** Move the screen reader to a node, so a control that disappears does not drop focus to the top of the screen. */
export function focusOn(ref: RefObject<unknown>): void {
  try {
    if (ref.current === null) return;
    const tag = findNodeHandle(ref.current as never);
    if (tag !== null && tag !== undefined) AccessibilityInfo.setAccessibilityFocus(tag);
  } catch { /* the platform has no focus control: the announcement still carries the change */ }
}
