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
import { BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT, NEUTRAL } from '../constants/design';
import { TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import { formatPace } from '../utils/vdotUtils';

export default function WorkoutDetailModal({ item, visible, onClose, primaryColor = '#213f96', athleteMiles = null, groupName = null, trainingPaces = null, onEdit = null, onDelete = null, groups = null }) {
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
          {trainingPaces && WORKOUT_PACE_ZONE[item.type] && (() => {
            const zone = WORKOUT_PACE_ZONE[item.type];
            const tp = trainingPaces;
            let paceLabel, paceValue;
            if (zone === 'easy') {
              paceLabel = 'EASY PACE RANGE';
              paceValue = `${formatPace(tp.eLow)} – ${formatPace(tp.eHigh)} /mi`;
            } else if (zone === 'threshold') {
              paceLabel = 'THRESHOLD PACE';
              paceValue = `${formatPace(tp.t)} /mi`;
            } else if (zone === 'interval') {
              paceLabel = 'INTERVAL PACE';
              paceValue = `${formatPace(tp.i)} /mi`;
            } else if (zone === 'repetition') {
              paceLabel = 'REPETITION PACE';
              paceValue = `${formatPace(tp.r)} /mi`;
            }
            return paceValue ? (
              <View style={[styles.section, { backgroundColor: BRAND_LIGHT }]}>
                <Text style={[styles.sectionLabel, { color: BRAND_ACCENT }]}>{paceLabel}</Text>
                <Text style={[styles.mileageValue, { color: BRAND, fontSize: 20 }]}>{paceValue}</Text>
              </View>
            ) : null;
          })()}
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
          {groups && groups.length > 0 && (item.groupMiles || item.baseMiles) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MILEAGE BY GROUP</Text>
              {groups.map(g => {
                const mi = item.groupMiles?.[g.id] ?? item.baseMiles ?? '—';
                return (
                  <View key={g.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={styles.sectionValue}>{g.name}</Text>
                    <Text style={[styles.sectionValue, { fontWeight: 'bold' }]}>{mi} mi</Text>
                  </View>
                );
              })}
            </View>
          )}
          {!item.location && !item.description && !item.notes && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No additional details for this item.</Text>
            </View>
          )}
          {(onEdit || onDelete) && (
            <View style={styles.actionRow}>
              {onEdit && (
                <TouchableOpacity style={styles.editBtn} onPress={() => { onClose(); onEdit(item); }}>
                  <Text style={[styles.editBtnText, { color: color }]}>Edit</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
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
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  editBtn: { flex: 1, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  editBtnText: { fontSize: 15, fontWeight: '600' },
  deleteBtn: { flex: 1, borderWidth: 1.5, borderColor: '#fecaca', borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fef2f2' },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});
