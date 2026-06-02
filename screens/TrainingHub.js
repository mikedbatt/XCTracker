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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE,
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
        <Text style={styles.eyebrow}>Coach</Text>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Training</Text>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText} numberOfLines={1}>{seasonSummary}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Manage your program</Text>

        {cards.map(card => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => onNavigate(card.key)}
          >
            <View style={styles.cardLeft}>
              <View style={styles.iconBadge}>
                <Ionicons name={card.icon} size={20} color={SIGNAL.color.indigo} />
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
            <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header: {
    backgroundColor: SIGNAL.color.paper2,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIGNAL.space[3],
  },
  headerTitle: {
    fontFamily: SIGNAL.font.display,
    fontSize: SIGNAL.size.title,
    letterSpacing: SIGNAL.letter.titleTight,
    color: SIGNAL.color.ink,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
    paddingHorizontal: SIGNAL.space[3],
    paddingVertical: 6,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    ...SIGNAL.border.hairline,
    flexShrink: 1,
    maxWidth: '65%',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SIGNAL.color.emerald,
  },
  statusText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingBottom: SIGNAL.space[8],
    gap: SIGNAL.space[3],
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginTop: SIGNAL.space[2],
    marginBottom: SIGNAL.space[2],
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SIGNAL.border.hairline,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SIGNAL.space[4],
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: SIGNAL.radius.control,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SIGNAL.color.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: SIGNAL.color.white,
  },
  cardBadgeText: {
    color: SIGNAL.color.white,
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 18,
  },
});
