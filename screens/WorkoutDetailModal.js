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
import { BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT, NEUTRAL, SIGNAL } from '../constants/design';
import { TYPE_COLORS, SIGNAL_TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import { formatPace } from '../utils/vdotUtils';

export default function WorkoutDetailModal({ item, visible, onClose, primaryColor = '#213f96', athleteMiles = null, groupName = null, trainingPaces = null, onEdit = null, onDelete = null, groups = null }) {
  if (!item) return null;

  const typeColor = SIGNAL_TYPE_COLORS[item.type] || TYPE_COLORS[item.type] || SIGNAL.color.indigo;
  const date = item.date?.toDate?.() || new Date();
  const chipBg = `${typeColor}${SIGNAL.tint.chip}`;
  const tintBorder = `${typeColor}22`;
  const tintWash = `${typeColor}0D`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
          <View style={styles.badgeRow}>
            <View style={[styles.catChip, { backgroundColor: chipBg }]}>
              <View style={[styles.chipDot, { backgroundColor: typeColor }]} />
              <Text style={[styles.catChipText, { color: typeColor }]}>
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

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {athleteMiles != null && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>
                DISTANCE{groupName ? ` — ${groupName.toUpperCase()}` : ''}
              </Text>
              <Text style={styles.mileageValue}>{athleteMiles} miles</Text>
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
              <View style={[styles.paceCard, { backgroundColor: tintWash, borderColor: tintBorder }]}>
                <Text style={[styles.eyebrow, { color: typeColor }]}>{paceLabel}</Text>
                <Text style={[styles.paceValue, { color: typeColor }]}>{paceValue}</Text>
              </View>
            ) : null;
          })()}

          {item.location && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>LOCATION</Text>
              <Text style={styles.sectionValue}>{item.location}</Text>
            </View>
          )}

          {item.description && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>
                {item.category === 'Training' ? 'WORKOUT DETAILS' : 'DESCRIPTION'}
              </Text>
              <Text style={styles.sectionBody}>{item.description}</Text>
            </View>
          )}

          {item.notes && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>NOTES</Text>
              <Text style={styles.sectionBody}>{item.notes}</Text>
            </View>
          )}

          {item.postedByName && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>POSTED BY</Text>
              <Text style={styles.sectionValue}>Coach {item.postedByName}</Text>
            </View>
          )}

          {groups && groups.length > 0 && (item.groupMiles || item.baseMiles) && (
            <View style={styles.card}>
              <Text style={styles.eyebrow}>MILEAGE BY GROUP</Text>
              {groups.map(g => {
                const mi = item.groupMiles?.[g.id] ?? item.baseMiles ?? '—';
                return (
                  <View key={g.id} style={styles.groupRow}>
                    <Text style={styles.sectionValue}>{g.name}</Text>
                    <Text style={styles.groupMi}>{mi} mi</Text>
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
                  <Text style={styles.editBtnText}>Edit</Text>
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 22,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  closeText: {
    color: SIGNAL.color.inkSoft,
    fontSize: 15,
    fontWeight: '600',
  },
  badgeRow: {
    marginBottom: 12,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
    marginBottom: 6,
    lineHeight: 28,
  },
  date: {
    fontSize: 14,
    color: SIGNAL.color.mute,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SIGNAL.space.screen,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: 12,
  },
  paceCard: {
    borderRadius: SIGNAL.radius.card,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 8,
  },
  sectionValue: {
    fontSize: 15,
    color: SIGNAL.color.ink,
    lineHeight: 22,
  },
  sectionBody: {
    fontSize: 15,
    color: SIGNAL.color.inkSoft,
    lineHeight: 22,
  },
  mileageValue: {
    fontSize: 24,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: -0.5,
  },
  paceValue: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: SIGNAL.font.mono,
    letterSpacing: -0.5,
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  groupMi: {
    fontSize: 15,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    fontFamily: SIGNAL.font.mono,
  },
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: {
    color: SIGNAL.color.mute2,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 24,
  },
  editBtn: {
    flex: 1,
    backgroundColor: SIGNAL.color.ink,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: SIGNAL.color.white,
  },
  deleteBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fef2f2',
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: SIGNAL.color.coral,
  },
});
