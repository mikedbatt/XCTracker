import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

const EFFORT_COLORS = ['', '#4caf50', '#4caf50', '#8bc34a', '#8bc34a', '#ffeb3b',
  '#ffc107', '#ff9800', '#ff5722', '#f44336', '#b71c1c'];

export default function RunDetailModal({ run, visible, onClose, primaryColor = '#2e7d32' }) {
  if (!run) return null;

  const date = run.date?.toDate?.() || new Date();
  const effortColor = EFFORT_COLORS[run.effort] || primaryColor;

  // Calculate pace if we have miles and duration
  let pace = null;
  if (run.miles && run.duration) {
    const parts = run.duration.split(':');
    if (parts.length === 2) {
      const totalMinutes = parseInt(parts[0]) + parseInt(parts[1]) / 60;
      const paceMinutes = totalMinutes / run.miles;
      const paceMin = Math.floor(paceMinutes);
      const paceSec = Math.round((paceMinutes - paceMin) * 60);
      pace = `${paceMin}:${paceSec.toString().padStart(2, '0')} /mi`;
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: primaryColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerMiles}>{run.miles} miles</Text>
          <Text style={styles.headerDate}>
            {date.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            })}
          </Text>
          {run.duration && (
            <Text style={styles.headerDuration}>{run.duration}</Text>
          )}
        </View>

        <ScrollView style={styles.scroll}>

          {/* Effort section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Effort</Text>
            <View style={styles.effortContainer}>
              <View style={styles.effortCircle}>
                <Text style={[styles.effortNumber, { color: effortColor }]}>
                  {run.effort}
                </Text>
                <Text style={styles.effortDivider}>/10</Text>
              </View>
              <View style={styles.effortInfo}>
                <Text style={[styles.effortLabel, { color: effortColor }]}>
                  {EFFORT_LABELS[run.effort]}
                </Text>
                <View style={styles.effortBar}>
                  <View style={[
                    styles.effortFill,
                    { width: `${(run.effort / 10) * 100}%`, backgroundColor: effortColor }
                  ]} />
                </View>
              </View>
            </View>
          </View>

          {/* Stats grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Run stats</Text>
            <View style={styles.statsGrid}>

              <View style={styles.statBox}>
                <Text style={styles.statValue}>{run.miles}</Text>
                <Text style={styles.statLabel}>Miles</Text>
              </View>

              {run.duration && (
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{run.duration}</Text>
                  <Text style={styles.statLabel}>Duration</Text>
                </View>
              )}

              {pace && (
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{pace}</Text>
                  <Text style={styles.statLabel}>Avg pace</Text>
                </View>
              )}

              {run.heartRate && (
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{run.heartRate}</Text>
                  <Text style={styles.statLabel}>Avg HR (bpm)</Text>
                </View>
              )}

            </View>
          </View>

          {/* Source */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data source</Text>
            <View style={styles.sourceBox}>
              <Text style={styles.sourceText}>
                {run.source === 'manual' ? 'Manually entered' :
                 run.source === 'strava' ? 'Synced from Strava' :
                 run.source === 'garmin' ? 'Synced from Garmin' :
                 run.source || 'Manual entry'}
              </Text>
            </View>
          </View>

          {/* Notes */}
          {run.notes && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Athlete notes</Text>
              <View style={styles.notesBox}>
                <Text style={styles.notesText}>{run.notes}</Text>
              </View>
            </View>
          )}

          {/* Time logged */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Logged at {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>

        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24,
  },
  closeBtn: { marginBottom: 16 },
  closeText: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  headerMiles: { fontSize: 42, fontWeight: 'bold', color: '#fff' },
  headerDate: { fontSize: 16, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  headerDuration: { fontSize: 22, color: 'rgba(255,255,255,0.9)', marginTop: 6, fontWeight: '600' },
  scroll: { flex: 1 },
  section: {
    backgroundColor: '#fff', borderRadius: 14,
    margin: 16, marginBottom: 0, padding: 16,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },
  effortContainer: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  effortCircle: { flexDirection: 'row', alignItems: 'baseline' },
  effortNumber: { fontSize: 52, fontWeight: 'bold' },
  effortDivider: { fontSize: 20, color: '#ccc', marginLeft: 2 },
  effortInfo: { flex: 1 },
  effortLabel: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  effortBar: {
    height: 8, backgroundColor: '#eee',
    borderRadius: 4, overflow: 'hidden',
  },
  effortFill: { height: '100%', borderRadius: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox: {
    backgroundColor: '#f8f8f8', borderRadius: 10,
    padding: 14, minWidth: '45%', flex: 1,
  },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 4 },
  sourceBox: {
    backgroundColor: '#f8f8f8', borderRadius: 10,
    padding: 14,
  },
  sourceText: { fontSize: 15, color: '#555' },
  notesBox: {
    backgroundColor: '#f8f8f8', borderRadius: 10,
    padding: 14,
  },
  notesText: { fontSize: 15, color: '#444', lineHeight: 22 },
  footer: { padding: 24, alignItems: 'center' },
  footerText: { fontSize: 13, color: '#bbb' },
});