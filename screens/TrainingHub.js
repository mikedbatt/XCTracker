import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';
import { getActiveSeason, getPhaseForSeason, SPORTS } from './SeasonPlanner';

export default function TrainingHub({ school, athletes, pendingAthletes: pendingAthletesList = [], groups, trainingItems, nextMeet, onNavigate }) {
  // Groups summary
  const groupCount = groups.length;
  const athleteCount = athletes.filter(a => a.groupId).length;

  // Season summary
  const activeSeason = getActiveSeason(school);
  const phase = getPhaseForSeason(activeSeason);
  const sport = SPORTS[phase.sport];
  const seasonSummary = activeSeason && !phase.isPreSeason
    ? `${sport?.icon || ''} ${activeSeason.name} · ${phase.name}${phase.weekNum ? ` · Wk ${phase.weekNum}` : ''}`
    : activeSeason
      ? `${sport?.icon || ''} ${activeSeason.name} · Starts soon`
      : 'No seasons set up yet';

  // Weekly plans summary
  const now = new Date();
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const thisWeekCount = (trainingItems || []).filter(item => {
    const d = item.date?.toDate ? item.date.toDate() : new Date(item.date);
    return d >= weekStart && d < weekEnd;
  }).length;

  // Roster card summary — show pending count (if any) so the head coach
  // notices unapproved athletes without having to drill in. CoachDashboard
  // keeps pending athletes in a separate state from approved ones, so we
  // accept them as a dedicated prop rather than trying to derive from
  // `athletes` (which is approved-only).
  const pendingAthletes = pendingAthletesList.length;
  const totalAthletes   = (athletes || []).length + pendingAthletes;

  const cards = [
    {
      key: 'groups',
      icon: 'people-outline',
      title: 'Manage Groups',
      subtitle: groupCount > 0
        ? `${groupCount} group${groupCount !== 1 ? 's' : ''} · ${athleteCount} athlete${athleteCount !== 1 ? 's' : ''} assigned`
        : 'Create groups and assign athletes',
    },
    {
      key: 'roster',
      icon: 'person-add-outline',
      title: 'Roster',
      subtitle: totalAthletes > 0
        ? `${totalAthletes} athlete${totalAthletes !== 1 ? 's' : ''}${pendingAthletes > 0 ? `  ·  ${pendingAthletes} awaiting approval` : ''}`
        : 'Approve, view, or remove athletes',
      badge: pendingAthletes,
    },
    {
      key: 'seasons',
      icon: 'time-outline',
      title: 'Manage Seasons',
      subtitle: seasonSummary,
    },
    {
      key: 'weekly',
      icon: 'clipboard-outline',
      title: 'Weekly Plans',
      subtitle: thisWeekCount > 0
        ? `This week: ${thisWeekCount} workout${thisWeekCount !== 1 ? 's' : ''} planned`
        : 'Plan your weekly workouts',
    },
    {
      key: 'calendar',
      icon: 'calendar-outline',
      title: 'Calendar',
      subtitle: 'View scheduled workouts and events',
    },
    {
      key: 'races',
      icon: 'flag-outline',
      title: 'Races',
      subtitle: nextMeet
        ? `Next: ${nextMeet.name} · ${new Date(nextMeet.date?.toDate ? nextMeet.date.toDate() : nextMeet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Manage meets and race results',
    },
    {
      key: 'attendance',
      icon: 'checkmark-circle-outline',
      title: 'Attendance',
      subtitle: 'Take roll for today\'s practice',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Program</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {cards.map(card => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => onNavigate(card.key)}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name={card.icon} size={24} color={BRAND} />
                {card.badge > 0 && (
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{card.badge > 99 ? '99+' : card.badge}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={2}>{card.subtitle}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={NEUTRAL.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: NEUTRAL.bg },
  header:       { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: SPACE.lg, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerTitle:  { fontSize: 24, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, textAlign: 'center' },
  scroll:       { flex: 1 },
  scrollContent:{ padding: SPACE.lg, gap: SPACE.md },
  card:         { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...SHADOW.sm },
  cardLeft:     { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACE.md },
  iconCircle:   { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },
  cardBadge:    { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#fff' },
  cardBadgeText:{ color: '#fff', fontSize: 11, fontWeight: FONT_WEIGHT.bold },
  cardText:     { flex: 1 },
  cardTitle:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: 2 },
  cardSubtitle: { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, lineHeight: 18 },
});
