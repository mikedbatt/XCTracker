// ── useResponsiveLayout ──────────────────────────────────────────────────────
// Returns a coarse viewport-size category. Use this to opt into desktop-class
// layouts on web; on native it always returns 'mobile' (phones don't grow into
// tablets at runtime in practice).

import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';

const TABLET_MIN  = 700;
const DESKTOP_MIN = 1024;

function categorize(width) {
  if (width >= DESKTOP_MIN) return 'desktop';
  if (width >= TABLET_MIN)  return 'tablet';
  return 'mobile';
}

export function useResponsiveLayout() {
  const [layout, setLayout] = useState(() => {
    if (Platform.OS !== 'web') return 'mobile';
    return categorize(Dimensions.get('window').width);
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setLayout(categorize(window.width));
    });
    return () => sub.remove();
  }, []);

  return layout;
}

// Convenience boolean helpers — common patterns.
export function useIsDesktop() { return useResponsiveLayout() === 'desktop'; }
