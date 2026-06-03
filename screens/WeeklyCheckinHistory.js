import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SIGNAL } from '../constants/design';
import { getWeeklyCheckinHistory } from '../utils/weeklyCheckinUtils';

// Format a YYYY-MM-DD weekStartISO as "Week of May 23"
function formatWeekLabel(weekStartISO) {
  if (!weekStartISO) return '';
  const [y, m, d] = weekStartISO.split('-').map(n => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

function formatReplyDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WeeklyCheckinHistory({
  visible,
  athleteId,
  athleteName,        // displayed in the header — e.g. "Sam's check-ins" or "Your check-ins"
  onClose,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !athleteId) return;
    let cancelled = false;
    setLoading(true);
    getWeeklyCheckinHistory(athleteId)
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch(e => { console.warn('History load failed:', e); if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, athleteId]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Past weekly check-ins</Text>
            <Text style={styles.title}>{athleteName || 'Check-in history'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={SIGNAL.color.indigo} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="chatbubbles-outline" size={28} color={SIGNAL.color.mute2} />
            <Text style={styles.emptyText}>No past check-ins yet.</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {items.map(item => (
              <View key={item.id} style={styles.weekBlock}>
                <Text style={styles.weekLabel}>{formatWeekLabel(item.weekStartISO)}</Text>

                <View style={styles.msgBlock}>
                  <Text style={styles.msgText}>{item.message || '(no message)'}</Text>
                </View>

                {item.coachReply && (
                  <>
                    <View style={styles.replyHeader}>
                      <Ionicons name="chatbubble-ellipses" size={12} color={SIGNAL.color.indigo} />
                      <Text style={styles.replyHeaderText}>
                        {item.coachReply.repliedByName || 'Coach'}
                        {item.coachReply.repliedAt ? ` · ${formatReplyDate(item.coachReply.repliedAt)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.replyBlock}>
                      <Text style={styles.replyText}>{item.coachReply.text}</Text>
                    </View>
                  </>
                )}
              </View>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SIGNAL.color.paper2 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 18,
    paddingHorizontal: 22,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: { ...SIGNAL.style.eyebrow, marginBottom: 6 },
  title: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  closeBtn: { padding: 4, marginTop: 2 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  scrollBody: { flex: 1 },
  scrollContent: { padding: 18 },

  weekBlock: {
    marginBottom: 22,
  },
  weekLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 10.5,
    letterSpacing: 1.36,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    marginBottom: 8,
  },
  msgBlock: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  msgText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14.5,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 21,
  },

  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 6,
    paddingLeft: 4,
  },
  replyHeaderText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  replyBlock: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: `${SIGNAL.color.indigo}10`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}30`,
  },
  replyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 20,
  },
});
