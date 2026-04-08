// ─── XCTracker Design System ─────────────────────────────────────────────────
// Single source of truth for all visual tokens.
// Import from here instead of hardcoding colors, sizes, or spacing.

// ─── Brand Palette ───────────────────────────────────────────────────────────
export const BRAND         = '#213f96';   // primary — buttons, nav, active states
export const BRAND_ACCENT  = '#3067de';   // light accent — secondary actions, progress fills, links
export const BRAND_LIGHT   = '#e8edf8';   // tinted bg — soft cards, subtle CTAs (blue-tinted)
export const BRAND_DARK    = '#111827';   // dark text — headings, primary text

// ─── Neutrals ────────────────────────────────────────────────────────────────
export const NEUTRAL = {
  bg:     '#F5F6FA',   // page background (subtle blue tint)
  card:   '#FFFFFF',   // card / surface background
  border: '#E5E7EB',   // borders, dividers
  input:  '#D1D5DB',   // input borders, inactive controls
  muted:  '#6B7280',   // placeholder text, tertiary labels (darkened from #9CA3AF)
  body:   '#4B5563',   // body / secondary text (darkened from #6B7280)
  label:  '#374151',   // labels, captions (darkened from #4B5563)
  text:   '#1F2937',   // standard text (when brand-dark is too strong)
};

// ─── Status Colors ───────────────────────────────────────────────────────────
export const STATUS = {
  success:   '#16a34a',
  successBg: '#f0fdf4',
  warning:   '#d97706',
  warningBg: '#fffbeb',
  error:     '#dc2626',
  errorBg:   '#fef2f2',
  info:      '#2563eb',
  infoBg:    '#eff6ff',
};

// ─── Zone Colors (HR zones — keep existing, well-chosen) ────────────────────
export const ZONE_COLORS = {
  z1: '#64b5f6',   // Recovery — blue
  z2: '#4caf50',   // Aerobic Base — green
  z3: '#ff9800',   // Aerobic Power — orange
  z4: '#f44336',   // Threshold — red
  z5: '#9c27b0',   // Anaerobic — purple
};

// ─── Effort Colors (1-10 scale, green → red) ────────────────────────────────
export const EFFORT_COLORS = [
  '', '#4caf50', '#4caf50', '#8bc34a', '#8bc34a', '#ffeb3b',
  '#ffc107', '#ff9800', '#ff5722', '#f44336', '#b71c1c',
];

export const EFFORT_LABELS = [
  '', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out',
];

// ─── Strava Brand ────────────────────────────────────────────────────────────
export const STRAVA_ORANGE = '#fc4c02';

// ─── Avatar Color Options ────────────────────────────────────────────────────
// Athletes can pick their own avatar color. Default is BRAND.
export const AVATAR_COLORS = [
  '#213f96',   // brand blue (default)
  '#1e6f5c',   // teal
  '#7c3aed',   // purple
  '#dc2626',   // red
  '#ea580c',   // orange
  '#0891b2',   // cyan
  '#4f46e5',   // indigo
  '#059669',   // emerald
  '#d946ef',   // fuchsia
  '#78716c',   // stone
];

// ─── Typography ──────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  xs:   11,   // captions, badges, timestamps
  sm:   13,   // secondary text, descriptions
  base: 15,   // body text, list items
  md:   16,   // inputs, button text
  lg:   18,   // section titles, modal titles
  xl:   22,   // screen titles, greetings
  '2xl': 28,  // hero numbers
  '3xl': 36,  // display numbers (weekly miles)
  '4xl': 42,  // detail hero
};

export const FONT_WEIGHT = {
  normal:   '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
};

// ─── Spacing (4px base) ─────────────────────────────────────────────────────
export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,   // safe area top padding
};

// ─── Border Radii ────────────────────────────────────────────────────────────
export const RADIUS = {
  sm:   6,      // badges, small chips
  md:   10,     // inputs, buttons, small cards
  lg:   14,     // cards, sections
  full: 9999,   // pills, avatars, circles
};

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
};

// ─── Two-Color System Helper ─────────────────────────────────────────────────
// Team color is for decorative accents ONLY — never for functional UI.
// Use BRAND for buttons, headers, nav, active states, key text.
export function getTeamAccent(teamColor) {
  return {
    badge:        teamColor,                // small colored badges
    avatarBg:     teamColor,                // avatar background circles
    accentBorder: teamColor,                // thin card accent borders
    tintedBg:     teamColor + '15',         // 15% opacity tinted card bg
    dot:          teamColor,                // small indicator dots
  };
}
