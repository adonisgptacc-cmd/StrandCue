import { Text } from 'react-native';

import {
  EXECUTION_SHELF_EMPTY,
  EXECUTION_SHELF_ITEM_HELP,
  EXECUTION_SHELF_LOADING,
  EXECUTION_SHELF_PICKER_LABEL,
  selectedShelfItemLabel,
  shelfItemOptionLabel,
  shelfItemVersionLabel,
} from './guidance/guidance-copy';
import { Button, styles } from './ui';
import type { ShelfDetail, ShelfItem } from './shelf-api';

export interface ExecutionSubstitutionPickerProps {
  readonly shelfItems: ShelfItem[] | null;
  readonly shelfError: string | null;
  readonly shelfItemId: string;
  readonly shelfDetail: ShelfDetail | null;
  readonly busy: boolean;
  readonly onSelect: (item: ShelfItem) => void;
}

export function ExecutionSubstitutionPicker({
  shelfItems,
  shelfError,
  shelfItemId,
  shelfDetail,
  busy,
  onSelect,
}: ExecutionSubstitutionPickerProps) {
  return <>
    <Text style={styles.body}>{EXECUTION_SHELF_ITEM_HELP}</Text>
    <Text style={styles.label}>{EXECUTION_SHELF_PICKER_LABEL}</Text>
    {shelfError !== null
      ? <Text accessibilityRole="alert" style={styles.error}>{shelfError}</Text>
      : shelfItems === null
        ? <Text style={styles.body}>{EXECUTION_SHELF_LOADING}</Text>
        : shelfItems.length === 0
          ? <Text style={styles.body}>{EXECUTION_SHELF_EMPTY}</Text>
          : shelfItems.map(item => (
            <Button
              key={item.id}
              title={`${item.manualName ?? 'Unnamed shelf item'} (${item.availability})`}
              accessibilityLabel={shelfItemOptionLabel(item.id)}
              secondary
              disabled={busy}
              onPress={() => onSelect(item)}
            />
          ))}
    {shelfItemId !== '' && (
      <Text style={styles.body}>{selectedShelfItemLabel(shelfItemId)}</Text>
    )}
    {shelfDetail !== null && shelfDetail.id === shelfItemId && shelfDetail.versionId !== null && (
      <Text style={styles.body}>{shelfItemVersionLabel(shelfDetail.versionId)}</Text>
    )}
  </>;
}
