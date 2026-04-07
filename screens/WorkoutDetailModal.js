import { Ionicons } from '@expo/vector-icons';
import {
    Platform,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { BRAND, BRAND_DARK } from '../constants/design';
import { TYPE_COLORS } from '../constants/training';

export default function WorkoutDetailModal({ item, visible, onClose, primaryColor = '#213f96', athleteMiles = null, groupName = null }) {
  if (!item) return null;

  const color = TYPE_COLORS[item.type] || primaryColor;
  const date = item.date?.toDate?.() || new Date();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
          <View style={styles.badgeRow}>
            <View style={[styles.catBadge, { backgroundColor: color }]}>
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
          {athleteMiles != null && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DISTANCE{groupName ? ` — ${groupName.toUpperCase()}` : ''}</Text>
              <Text style={[styles.mileageValue, { color: BRAND }]}>{athleteMiles} miles</Text>
            </View>
          )}
          {item.location && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LOCATION</Text>
              <Text style={styles.sectionValue}>{item.location}</Text>
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
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 24, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, marginBottom: 16 },
  closeText: { color: '#111827', fontSize: 15, fontWeight: '600' },
  badgeRow: { marginBottom: 10 },
  catBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  catBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  date: { fontSize: 15, color: '#6B7280' },
  scroll: { flex: 1, padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 8 },
  sectionValue: { fontSize: 16, color: '#111827', lineHeight: 22 },
  mileageValue: { fontSize: 24, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, margin: 4, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
});
