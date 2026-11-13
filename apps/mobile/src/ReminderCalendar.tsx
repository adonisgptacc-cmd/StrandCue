import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { planReminderSchedules, localDateTime, type CalendarStatus } from '@strandcue/domain';
import { loadCalendarHistoryPage, type CalendarHistoryCursor, type CalendarHistoryItem } from './calendar-history';
import { secureStorage } from './client';
import { createReminderStore, emptyReminderState, ReminderCategorySchema, type ReminderState } from './reminder-store';
import { reconcileDeviceReminders, requestReminderPermissionAfterExplanation } from './reminder-notifications';

const store = createReminderStore(secureStorage);
const categories = ReminderCategorySchema.options;
const categoryLabels: Record<(typeof categories)[number], string> = {
  planned_routine: 'Planned routine',
  delayed_cue_check: 'Delayed check-in',
  product_review: 'Product review',
};

type CalendarPlanItem = { id: string; date: string; dateKey: string; sortAt: number; status: CalendarStatus; kind: 'plan' };
type CalendarItem = CalendarPlanItem | CalendarHistoryItem;

function currentCalendarMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isCalendarMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function ReminderCalendar({ owner }: { owner: string }) {
  const [state, setState] = useState<ReminderState>(() => emptyReminderState(owner));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [cursor, setCursor] = useState<CalendarHistoryCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('09:00');
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number]>('planned_routine');
  const [pendingCategory, setPendingCategory] = useState<(typeof categories)[number] | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => currentCalendarMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const ownerEpoch = useRef(0);

  useEffect(() => {
    const epoch = ownerEpoch.current + 1;
    ownerEpoch.current = epoch;
    return () => {
      if (ownerEpoch.current === epoch) ownerEpoch.current += 1;
    };
  }, [owner]);

  useEffect(() => {
    let active = true;
    void (async () => {
      let saved: ReminderState | null = null;
      let revision = -1;
      try {
        const snapshot = await store.loadVersioned(owner);
        saved = snapshot.state;
        revision = snapshot.revision;
        if (!active || !store.isCurrent(owner, revision)) return;
        setState(saved);
        setSettingsReady(true);
        setQuietStart(saved.preferences.quietHours?.start ?? '');
        setQuietEnd(saved.preferences.quietHours?.end ?? '');
        const planItems = saved.plans.filter(plan => !plan.dismissed).map(plan => ({
          id: plan.id,
          date: plan.localDate,
          dateKey: plan.localDate,
          sortAt: localDateTime(plan.localDate, plan.localTime)?.getTime() ?? 0,
          status: 'planned' as const,
          kind: 'plan' as const,
        }));
        setItems(planItems);
        await reconcileDeviceReminders(
          owner,
          planReminderSchedules(owner, saved.plans, saved.preferences, new Date()).map(schedule => ({ id: schedule.reminderId, scheduledFor: schedule.scheduledFor })),
          () => active && store.isCurrent(owner, revision),
        );
      } catch {
        if (active) setMessage('Reminder settings could not be loaded on this device.');
      }
      try {
        const history = await loadCalendarHistoryPage(null);
        if (!active) return;
        setCursor(history.nextCursor);
        setItems(current => [...current.filter(item => item.kind !== 'history'), ...history.items]);
      } catch {
        if (active) setHistoryError('Calendar history could not be loaded. Check your connection and try again.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [owner]);

  const save = async (next: ReminderState, expectedEpoch = ownerEpoch.current): Promise<boolean> => {
    if (expectedEpoch !== ownerEpoch.current) return false;
    const snapshot = await store.saveVersioned(owner, next);
    const saved = snapshot.state;
    if (expectedEpoch !== ownerEpoch.current || !store.isCurrent(owner, snapshot.revision)) return false;
    setState(saved);
    const schedules = planReminderSchedules(owner, saved.plans, saved.preferences, new Date());
    await reconcileDeviceReminders(
      owner,
      schedules.map(schedule => ({ id: schedule.reminderId, scheduledFor: schedule.scheduledFor })),
      () => expectedEpoch === ownerEpoch.current && store.isCurrent(owner, snapshot.revision),
    );
    setItems(current => [
      ...current.filter(item => item.kind !== 'plan'),
      ...saved.plans.filter(plan => !plan.dismissed).map(plan => ({
        id: plan.id,
        date: plan.localDate,
        dateKey: plan.localDate,
        sortAt: localDateTime(plan.localDate, plan.localTime)?.getTime() ?? 0,
        status: 'planned' as const,
        kind: 'plan' as const,
      })),
    ]);
    return true;
  };

  const beginMutation = (): boolean => {
    if (loading || !settingsReady || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };

  const endMutation = (): void => {
    busyRef.current = false;
    setBusy(false);
  };

  const beginHistoryMutation = (): boolean => {
    if (loading || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };

  const toggleCategory = async (category: (typeof categories)[number]) => {
    if (!beginMutation()) return;
    setMessage('');
    try {
      const enabling = !state.preferences.enabled[category];
      if (enabling) {
        setPendingCategory(category);
        setMessage('Notifications use a generic message and may arrive later than scheduled on Android. Calendar history works without notification permission.');
        return;
      }
      await save({ ...state, preferences: { ...state.preferences, enabled: { ...state.preferences.enabled, [category]: !state.preferences.enabled[category] } } });
      setMessage('Reminder preferences saved on this device.');
    } catch {
      setMessage('Reminder settings could not be saved.');
    } finally { endMutation(); }
  };

  const confirmEnable = async () => {
    if (!pendingCategory || !beginMutation()) return;
    const requestEpoch = ownerEpoch.current;
    try {
      const permitted = await requestReminderPermissionAfterExplanation();
      if (requestEpoch !== ownerEpoch.current) return;
      if (!permitted) {
        setMessage('Notifications are off. You can still use calendar history and planned reminders in the app.');
        return;
      }
      await save({ ...state, preferences: { ...state.preferences, enabled: { ...state.preferences.enabled, [pendingCategory]: true } } }, requestEpoch);
      setMessage('Reminder preference saved on this device.');
    } catch { setMessage('Notification permission or reminder settings could not be updated.'); }
    finally { setPendingCategory(null); endMutation(); }
  };

  const loadMoreHistory = async () => {
    if (cursor === null || !beginHistoryMutation()) return;
    try {
      const history = await loadCalendarHistoryPage(cursor);
      setItems(current => {
        const known = new Set(current.filter(item => item.kind === 'history').map(item => item.id));
        return [...current, ...history.items.filter(item => !known.has(item.id))];
      });
      setCursor(history.nextCursor);
      setHistoryError('');
    } catch { setHistoryError('More calendar history could not be loaded. Check your connection and retry.'); }
    finally { endMutation(); }
  };

  const retryHistory = async () => {
    if (!beginHistoryMutation()) return;
    const retryCursor = cursor;
    try {
      const history = await loadCalendarHistoryPage(retryCursor);
      setItems(current => {
        const retained = retryCursor === null ? current.filter(item => item.kind === 'plan') : current;
        const known = new Set(retained.filter(item => item.kind === 'history').map(item => item.id));
        return [...retained, ...history.items.filter(item => !known.has(item.id))];
      });
      setCursor(history.nextCursor);
      setHistoryError('');
    } catch {
      setHistoryError(retryCursor === null
        ? 'Calendar history could not be loaded. Check your connection and retry.'
        : 'More calendar history could not be loaded. Check your connection and retry.');
    } finally { endMutation(); }
  };

  const addReminder = async () => {
    if (!beginMutation()) return;
    setMessage('');
    try {
      const next = {
        ...state,
        plans: [...state.plans, { id: Crypto.randomUUID(), ownerKey: owner, category: selectedCategory, localDate, localTime, dismissed: false }],
      };
      if (!await save(next)) return;
      setMessage(state.preferences.enabled[selectedCategory] ? 'Reminder saved.' : `Plan saved in your calendar. Turn on ${categoryLabels[selectedCategory]} above to schedule a notification.`);
    } catch {
      setMessage('Enter a valid future date (YYYY-MM-DD) and local time (HH:mm).');
    } finally { endMutation(); }
  };

  const dismissPlan = async (id: string) => {
    if (!beginMutation()) return;
    try {
      await save({ ...state, plans: state.plans.map(plan => plan.id === id ? { ...plan, dismissed: true } : plan) });
      setMessage('Planned reminder dismissed.');
    } catch { setMessage('That reminder could not be dismissed.'); }
    finally { endMutation(); }
  };

  const saveQuietHours = async () => {
    if (!beginMutation()) return;
    setMessage('');
    try {
      const quietHours = quietStart === '' && quietEnd === '' ? null : { start: quietStart, end: quietEnd };
      await save({ ...state, preferences: { ...state.preferences, quietHours } });
      setMessage(quietHours ? 'Quiet hours saved for this device.' : 'Quiet hours are off.');
    } catch { setMessage('Use valid local times in HH:mm format for both quiet-hour fields.'); }
    finally { endMutation(); }
  };

  const orderedItems = useMemo(() => items.slice().sort((a, b) => {
    if (a.dateKey === null) return b.dateKey === null ? a.id.localeCompare(b.id) : 1;
    if (b.dateKey === null) return -1;
    return a.sortAt - b.sortAt || a.id.localeCompare(b.id);
  }), [items]);
  const validCalendarMonth = isCalendarMonth(calendarMonth);
  const visibleCalendarItems = validCalendarMonth
    ? orderedItems.filter(item => item.dateKey === null || item.dateKey.startsWith(calendarMonth))
    : [];
  const dayGroups = new Map<string, CalendarItem[]>();
  for (const item of visibleCalendarItems) {
    if (item.dateKey === null) continue;
    dayGroups.set(item.dateKey, [...(dayGroups.get(item.dateKey) ?? []), item]);
  }
  const dayItems = selectedDay === null ? [] : visibleCalendarItems.filter(item => item.dateKey === selectedDay);
  const unknownDateItems = selectedDay === null ? visibleCalendarItems.filter(item => item.dateKey === null) : [];
  const renderCalendarItem = (item: CalendarItem) => <View key={`${item.kind}:${item.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, gap: 4 }}>
    <Text style={{ fontWeight: '600', color: '#332532' }}>{item.date} · {item.status}</Text>
    <Text style={{ color: '#514851' }}>{item.kind === 'plan' ? categoryLabels[state.plans.find(plan => plan.id === item.id)?.category ?? 'planned_routine'] : item.title}</Text>
    {item.kind === 'plan' && <Text accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => void dismissPlan(item.id)} style={{ color: loading || !settingsReady || busy ? '#777' : '#63295E', paddingVertical: 4 }}>Dismiss plan</Text>}
  </View>;

  return <ScrollView contentContainerStyle={{ gap: 14 }}>
    <View style={{ padding: 16, gap: 10, borderRadius: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#332532' }}>Reminders</Text>
      <Text style={{ color: '#514851' }}>Choose each reminder separately. Messages on your lock screen stay generic. Preferences are stored on this device.</Text>
      {categories.map(category => <Text key={category} accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => void toggleCategory(category)} style={{ paddingVertical: 8, color: loading || !settingsReady || busy ? '#777' : '#63295E' }}>
        {state.preferences.enabled[category] ? '●' : '○'} {categoryLabels[category]} — {state.preferences.enabled[category] ? 'on' : 'off'}
      </Text>)}
      {pendingCategory && <View style={{ gap: 8 }}>
        <Text style={{ color: '#514851' }}>Turn on {categoryLabels[pendingCategory]} reminders? StrandCue will request notification permission after you confirm.</Text>
        <Text accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => void confirmEnable()} style={{ color: '#63295E', fontWeight: '700' }}>Continue to notification permission</Text>
        <Text accessibilityRole="button" accessibilityState={{ disabled: busy }} onPress={() => { if (!busyRef.current) { setPendingCategory(null); setMessage(''); } }} style={{ color: '#63295E' }}>Not now</Text>
      </View>}
      <Text style={{ color: '#514851' }}>Android may delay local notification delivery. Exact-alarm access is not requested.</Text>
      <Text style={{ fontWeight: '600', color: '#332532' }}>Quiet hours (local time)</Text>
      <TextInput accessibilityLabel="Quiet hours start (HH:mm)" placeholder="Start (HH:mm)" editable={!loading && settingsReady && !busy} value={quietStart} onChangeText={setQuietStart} style={{ borderWidth: 1, borderColor: '#b9aeb8', borderRadius: 8, padding: 10 }} />
      <TextInput accessibilityLabel="Quiet hours end (HH:mm)" placeholder="End (HH:mm)" editable={!loading && settingsReady && !busy} value={quietEnd} onChangeText={setQuietEnd} style={{ borderWidth: 1, borderColor: '#b9aeb8', borderRadius: 8, padding: 10 }} />
      <Text accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => void saveQuietHours()} style={{ color: loading || !settingsReady || busy ? '#777' : '#63295E', fontWeight: '700' }}>Save quiet hours</Text>
    </View>
    <View style={{ padding: 16, gap: 10, borderRadius: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#332532' }}>Add a planned reminder</Text>
      <Text style={{ color: '#514851' }}>Choose the type and enter the date yourself. StrandCue will not infer a treatment, product or eligibility date.</Text>
      {categories.map(category => <Text key={category} accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => { if (!loading && settingsReady && !busyRef.current) setSelectedCategory(category); }} style={{ color: loading || !settingsReady || busy ? '#777' : '#63295E', paddingVertical: 5 }}>
        {selectedCategory === category ? '●' : '○'} {categoryLabels[category]}
      </Text>)}
      <TextInput accessibilityLabel="Date (YYYY-MM-DD)" placeholder="Date (YYYY-MM-DD)" editable={!loading && settingsReady && !busy} value={localDate} onChangeText={setLocalDate} style={{ borderWidth: 1, borderColor: '#b9aeb8', borderRadius: 8, padding: 10 }} />
      <TextInput accessibilityLabel="Local time (HH:mm)" placeholder="Local time (HH:mm)" editable={!loading && settingsReady && !busy} value={localTime} onChangeText={setLocalTime} style={{ borderWidth: 1, borderColor: '#b9aeb8', borderRadius: 8, padding: 10 }} />
      <Text accessibilityRole="button" accessibilityState={{ disabled: loading || !settingsReady || busy }} onPress={() => void addReminder()} style={{ color: loading || !settingsReady || busy ? '#777' : '#63295E', fontWeight: '700', paddingVertical: 8 }}>Save planned routine</Text>
    </View>
    <View style={{ padding: 16, gap: 10, borderRadius: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#332532' }}>Calendar and routine history</Text>
      <Text style={{ color: '#514851' }}>View saved activities, check-ins, programmes, services, Passport changes, routine executions and plans. Outcomes without an explicit supported status remain unknown.</Text>
      <TextInput accessibilityLabel="Calendar month (YYYY-MM)" placeholder="Month (YYYY-MM)" editable={!loading} value={calendarMonth} onChangeText={value => { setCalendarMonth(value); setSelectedDay(null); }} style={{ borderWidth: 1, borderColor: '#b9aeb8', borderRadius: 8, padding: 10 }} />
      {!validCalendarMonth && <Text accessibilityRole="alert" style={{ color: '#514851' }}>Enter the month as YYYY-MM.</Text>}
      <Text style={{ color: '#514851' }}>Entries with an unknown date stay visible in every month until their source record provides one.</Text>
      {!!historyError && <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={{ color: '#8b3030' }}>{historyError}</Text><Text accessibilityRole="button" accessibilityState={{ disabled: busy || loading }} onPress={() => void retryHistory()} style={{ color: busy || loading ? '#777' : '#63295E', fontWeight: '700' }}>Retry calendar history</Text></View>}
      {loading ? <ActivityIndicator accessibilityLabel="Loading calendar history" /> : visibleCalendarItems.length === 0 ? <Text style={{ color: '#514851' }}>No planned routines or saved history for this month.</Text> : selectedDay === null ? <>
        {[...dayGroups.entries()].map(([day, dayItemsForDate]) => <Text key={day} accessibilityRole="button" accessibilityLabel={`${day}: ${dayItemsForDate.length} calendar entries`} onPress={() => setSelectedDay(day)} style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, color: '#63295E', fontWeight: '700' }}>{day} · {dayItemsForDate.length} {dayItemsForDate.length === 1 ? 'entry' : 'entries'}</Text>)}
        {unknownDateItems.length > 0 && <View style={{ gap: 4 }}><Text style={{ fontWeight: '600', color: '#332532' }}>Date unknown</Text>{unknownDateItems.map(renderCalendarItem)}</View>}
      </> : <>
        <Text accessibilityRole="header" style={{ fontWeight: '700', color: '#332532' }}>Entries for {selectedDay}</Text>
        <Text accessibilityRole="button" onPress={() => setSelectedDay(null)} style={{ color: '#63295E' }}>Back to {calendarMonth}</Text>
        {dayItems.map(renderCalendarItem)}
      </>}
      {cursor !== null && <Text accessibilityRole="button" accessibilityState={{ disabled: loading || busy }} onPress={() => void loadMoreHistory()} style={{ color: loading || busy ? '#777' : '#63295E' }}>Load more history</Text>}
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: '#514851', paddingHorizontal: 8 }}>{message}</Text>}
  </ScrollView>;
}
