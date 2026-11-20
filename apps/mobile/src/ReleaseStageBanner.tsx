import { Text, View } from 'react-native';
import {
  CURRENT_RELEASE_STAGE,
  describeReleaseStage,
} from './release-stage';
import { styles } from './ui';

function titleCase(label: string): string {
  return label
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ReleaseStageBanner() {
  const descriptor = describeReleaseStage(CURRENT_RELEASE_STAGE);
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${titleCase(descriptor.label)}: ${descriptor.description}`}
      style={styles.notice}
    >
      <Text style={styles.label}>{descriptor.label}</Text>
      <Text style={styles.body}>{descriptor.description}</Text>
    </View>
  );
}
