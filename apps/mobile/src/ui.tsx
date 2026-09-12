import type { PropsWithChildren } from 'react';
import { toggleSelection } from './contracts';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

export const colors = { paper: '#F7F5EF', white: '#FFFFFF', ink: '#253A30', quiet: '#627268', line: '#DCE2D8', sage: '#E8EDDF', accent: '#667D49', error: '#8C3B30' };
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24, paddingBottom: 40, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  logo: { fontSize: 24, fontWeight: '700', letterSpacing: -1, color: colors.ink },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700', color: colors.quiet },
  title: { fontSize: 36, lineHeight: 41, letterSpacing: -1.3, color: colors.ink, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.quiet },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.line, gap: 14 },
  heading: { fontSize: 20, fontWeight: '600', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 48, color: colors.ink, backgroundColor: colors.paper },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  secondary: { backgroundColor: colors.sage },
  pill: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  notice: { borderRadius: 12, padding: 14, backgroundColor: colors.sage },
  error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.line },
});
export function Page({ children }: PropsWithChildren) {
  return <ScrollView style={styles.page} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.brand}><Text style={styles.logo}>strandcue<Text style={{color: colors.accent}}>•</Text></Text><Text style={styles.kicker}>YOUR HAIR RECORD</Text></View>
    {children}
  </ScrollView>;
}
export function Button({title, onPress, secondary = false, disabled = false}: {title: string; onPress: () => void; secondary?: boolean; disabled?: boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.secondary, disabled && {opacity: 0.5}]}>
    <Text style={[styles.buttonText, secondary && {color: colors.ink}]}>{title}</Text>
  </Pressable>;
}
export function Field({label, ...props}: TextInputProps & {label: string}) {
  return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.quiet} style={styles.input} {...props}/></View>;
}
export function Choice({label, value, options, onChange, disabled = false}: {label: string; value: string; options: readonly string[]; onChange: (value: string) => void; disabled?: boolean}) {
  return <View><Text style={styles.label}>{label}</Text><View style={styles.row}>{options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${label}: ${option.replaceAll('-', ' ')}`} accessibilityState={{selected: value === option, disabled}} disabled={disabled} onPress={() => onChange(option)} style={[styles.pill, value === option && styles.selected]}>
    <Text style={[styles.body, value === option && {color: colors.white}]}>{option.replaceAll('-', ' ')}</Text>
  </Pressable>)}</View></View>;
}
export function MultiChoice({label, value, options, onChange}: {label: string; value: string[]; options: readonly string[]; onChange: (value: string[]) => void}) {
  return <View><Text style={styles.label}>{label} (choose all that apply)</Text><View style={styles.row}>{options.map(option => <Pressable key={option} accessibilityRole="checkbox" accessibilityLabel={`${label}: ${option.replaceAll('-', ' ')}`} accessibilityState={{checked: value.includes(option)}} onPress={() => onChange(toggleSelection(value, option))} style={[styles.pill, value.includes(option) && styles.selected]}>
    <Text style={[styles.body, value.includes(option) && {color: colors.white}]}>{option.replaceAll('-', ' ')}</Text>
  </Pressable>)}</View></View>;
}
