import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { TYPE_COLORS } from './CalendarScreen';

export default function WorkoutDetailModal({ item, visible, onClose, primaryColor = '#2e7d32' }) {
  if (!item) return null;

  const color = TYPE_COLORS[item.type] || primaryColor;
  const date = item.date?.toDate?.() || new Date();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: color }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
          <View style={styles.badgeRow}>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>
                {item.category?.toUpperCase()} · {item.type?.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.date}>
            {date.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </Text>
        </View>

        <ScrollView style={styles.scroll}>
          {item.location && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LOCATION</Text>
              <Text style={styles.sectionValue}>📍 {item.location}</Text>
            </View>
          )}
          {item.description && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {item.category === 'Training' ? 'WORKOUT DETAILS' : 'DESCRIPTION'}
              </Text>
              <Text style={styles.sectionValue}>{item.description}</Text>
            </View>
          )}
          {item.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              <Text style={styles.sectionValue}>{item.notes}</Text>
            </View>
          )}
          {item.postedByName && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>POSTED BY</Text>
              <Text style={styles.sectionValue}>Coach {item.postedByName}</Text>
            </View>
          )}
          {!item.location && !item.description && !item.notes && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No additional details for this item.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24 },
  closeBtn: { marginBottom: 16 },
  closeText: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  badgeRow: { marginBottom: 10 },
  catBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  catBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  date: { fontSize: 15, color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1, padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.5, marginBottom: 8 },
  sectionValue: { fontSize: 16, color: '#333', lineHeight: 22 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, margin: 4, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },
});