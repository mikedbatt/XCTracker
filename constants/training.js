// ─── Unified category/type system ────────────────────────────────────────────
// Extracted from CalendarScreen to break the CalendarScreen ↔ WeeklyPlanner cycle.

import { BRAND } from './design';

export const CATEGORIES = {
  Training: {
    label: 'Training',
    color: BRAND,
    types: ['Easy', 'Tempo', 'Long Run', 'Intervals', 'Speed', 'Cross Train', 'Weights', 'Recovery', 'Time Trial'],
  },
  Event: {
    label: 'Event',
    color: '#dc2626',
    types: ['Race', 'Team Meeting', 'Team Party'],
  },
};

// Color per type
export const TYPE_COLORS = {
  Easy: '#4caf50', Tempo: '#ff9800', 'Long Run': '#2196f3',
  Intervals: '#9c27b0', Speed: '#e91e63', 'Cross Train': '#00bcd4',
  Weights: '#795548', Recovery: '#607d8b', 'Time Trial': '#ff5722',
  Race: '#dc2626', 'Team Meeting': '#0284c7', 'Team Party': '#f59e0b',
};

// Workout intensity classification for 80/20 planning
export const WORKOUT_INTENSITY = {
  Easy: 'easy', Recovery: 'easy', 'Long Run': 'easy', 'Cross Train': 'easy',
  Tempo: 'hard', Intervals: 'hard', Speed: 'hard', 'Time Trial': 'hard',
  Weights: 'neutral', Race: 'hard',
};

// Map workout type to VDOT pace zone for athlete-facing pace targets
export const WORKOUT_PACE_ZONE = {
  Easy: 'easy', Recovery: 'easy', 'Long Run': 'easy',
  Tempo: 'threshold', Intervals: 'interval', Speed: 'repetition',
  'Time Trial': 'threshold',
};
