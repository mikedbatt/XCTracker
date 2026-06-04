// ─── TeamBase Design System ──────────────────────────────────────────────────
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

// ═════════════════════════════════════════════════════════════════════════════
// ─── SIGNAL Redesign Tokens ─────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
// White-first surfaces. Color is signal, not decoration — every hue maps to a
// meaning (sport, workout type, effort zone, or status). Additive to the
// existing exports above so screens can migrate one-at-a-time without breaking
// any unmigrated screens.
//
// Migration plan: Athlete Dashboard + Stats first (most reused patterns),
// then Coach Dashboard + Analytics, then the rest. See
// design_handoff_teambase_signal/README.md for the full spec.

export const SIGNAL = {
  // ── Color ──────────────────────────────────────────────────────────────────
  color: {
    // Neutrals / surface
    white:   '#FFFFFF',   // cards, sheets
    paper:   '#FAFBFC',   // inset fields, secondary surfaces
    paper2:  '#F4F5F7',   // screen background (behind cards), device bg
    line:    '#E6E8EC',   // hairline borders, dividers
    ink:     '#0B0D12',   // primary text, dark buttons
    inkSoft: '#2A2E38',   // body text
    mute:    '#6B7280',   // secondary text, eyebrows
    mute2:   '#9AA0AB',   // tertiary text, inactive tab labels

    // Signal palette — every hue carries meaning
    indigo:  '#4F46E5',   // PRIMARY — actions, active states, links
    violet:  '#7C3AED',   // intervals; gradient partner with indigo
    pink:    '#EC4899',   // PRs / celebration / race accents
    coral:   '#FB7185',   // alerts / errors / "too hard" / flags
    amber:   '#F59E0B',   // warnings / tempo / "caution" / build phase
    lime:    '#84CC16',   // easy runs
    emerald: '#10B981',   // success / "on track" / XC sport / good readiness
    cyan:    '#06B6D4',   // long runs / swim sport / info

    // Effort ramp gets its own crimson scale at the top (replaces EFFORT_COLORS
    // for Signal screens; existing EFFORT_COLORS stays for non-migrated ones)
    effort9:  '#EF4444',
    effort10: '#DC2626',
  },

  // ── Tint convention ────────────────────────────────────────────────────────
  // Append these hex suffixes to a color string for low-alpha backgrounds.
  // Example: `${SIGNAL.color.lime}${SIGNAL.tint.chip}` → '#84CC1618' = lime @ ~9% bg
  tint: {
    wash: '0A',   // ~4%  — very subtle screen-bg wash
    fill: '1A',   // ~10% — chip/badge fills
    chip: '18',   // ~9.4% — chip bg per spec
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  // Font families match the strings registered by @expo-google-fonts packages.
  // Until expo-font wiring lands, RN silently falls back to the platform
  // default — layout is metric-tolerant per the design spec.
  font: {
    displayItalic: 'InstrumentSerif_400Regular_Italic',  // serif italic — accented words in titles
    display:       'InstrumentSerif_400Regular',         // serif — headlines
    body:          'InterTight_400Regular',
    bodyMedium:    'InterTight_500Medium',
    bodySemi:      'InterTight_600SemiBold',
    bodyBold:      'InterTight_700Bold',
    mono:          'JetBrainsMono_400Regular',           // paces, timestamps, codes
  },

  size: {
    eyebrow:   11,   // small uppercase labels
    label:     12,   // form labels, captions
    body:      14,   // standard body / list rows
    bodyLg:    16,   // emphasis body
    heading:   18,   // section headings
    title:     22,   // screen titles
    display:   28,
    displayLg: 36,
    displayXl: 48,   // mileage hero number
  },

  // RN letterSpacing is absolute px (not em). Values precomputed from the CSS
  // em spec at each common size — adjust manually if you use a different size.
  letter: {
    eyebrow:   1.43,    // 0.13em × 11px — uppercase labels
    bodyTight: -0.14,   // -0.01em × 14px — body / UI
    titleTight: -0.44,  // -0.02em × 22px — display / titles
    numTight:  -1.08,   // -0.03em × 36px — large tabular numbers
  },

  // ── Spacing (4px base) ─────────────────────────────────────────────────────
  // Common values from the spec: 4 / 8 / 10 / 12 / 14 / 16 / 18 / 22.
  space: {
    1: 4,    2: 8,   3: 10,  4: 12,
    5: 14,   6: 16,  7: 18,  8: 22,
    screen: 16,   // horizontal screen padding (spec: 14–18, picked middle)
    card:   14,   // card inner padding (spec: 14–16)
  },

  // ── Radius ─────────────────────────────────────────────────────────────────
  radius: {
    chip:    999,   // pills, avatars
    control: 10,    // small controls, inputs
    button:  12,
    card:    16,
    sheet:   18,    // bottom sheets, modals
  },

  // ── Borders over shadows ───────────────────────────────────────────────────
  // Cards in Signal use a 1px hairline border on white — no drop shadow.
  // Shadows reserved for floating elements only (tab bar, sheets).
  border: {
    hairline: { borderWidth: 1, borderColor: '#E6E8EC' },
  },

  // ── Sport accent ───────────────────────────────────────────────────────────
  // App is XC-focused today; sport tabs intentionally off. Mapping is here
  // so multisport can light up without re-deriving colors.
  sport: {
    xc:    '#10B981',
    track: '#FB7185',
    swim:  '#06B6D4',
    mtb:   '#F59E0B',
  },

  // ── Effort 1–10 ramp (Signal version of EFFORT_COLORS) ─────────────────────
  // Index 0 is unused; effort[1]..effort[10] are the ten effort values, parallel
  // to the existing EFFORT_COLORS shape for drop-in replacement on migrated screens.
  effort: [
    '',
    '#10B981', '#10B981',   // 1-2 emerald
    '#84CC16', '#84CC16',   // 3-4 lime
    '#F59E0B', '#F59E0B',   // 5-6 amber
    '#FB7185', '#FB7185',   // 7-8 coral
    '#EF4444',              // 9
    '#DC2626',              // 10
  ],

  // ── Common style presets ───────────────────────────────────────────────────
  // Spread these into StyleSheet entries to apply a complete spec'd pattern
  // (font + size + letter-spacing + color all at once).
  style: {
    eyebrow: {
      fontSize:      11,
      letterSpacing: 1.43,
      textTransform: 'uppercase',
      color:         '#6B7280',
      fontWeight:    '500',
    },
  },
};
