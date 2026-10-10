import { Text, View } from 'react-native';
import { styles } from './ui';

export function TodayTechnicalAlpha() {
  return (
    <View>
      <Text style={styles.kicker}>TODAY</Text>
      <Text style={styles.title}>Today is getting ready.</Text>
      <Text style={styles.body}>
        Today will eventually combine your hair profile, shelf, tools,
        history, environment, and reviewed rules into one practical plan.
      </Text>
      <View style={styles.card}>
        <Text style={styles.heading}>Personalized guidance is not available in this release.</Text>
        <Text style={styles.body}>
          This Technical Alpha does not generate advice. You can continue
          testing your records, exports, and deletion controls while the
          guidance slice is built and reviewed.
        </Text>
      </View>
    </View>
  );
}
