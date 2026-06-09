// ── Bottom safe-area inset ───────────────────────────────────────────────────
// Bottom-anchored bars (tab navs, action bars, the feed input) must clear the
// iOS home-indicator. Screens historically used `Platform.OS === 'ios' ? N : M`,
// but in the installed iOS PWA `Platform.OS` is **'web'**, not 'ios' — so the
// inset was never reserved and the bar's background stopped short of the screen
// edge, leaving a gray gap under it.
//
// On web we add the live CSS `env(safe-area-inset-bottom)` (with a 0px fallback
// so non-notch devices/browsers just get the base padding). On native we keep a
// fixed reserve. Returns a number on native (valid RN style) and a CSS string on
// web (react-native-web passes it through).
import { Platform } from 'react-native';

export function bottomInset(base = 10, iosReserve = base + 12) {
  if (Platform.OS === 'web') return `calc(${base}px + env(safe-area-inset-bottom, 0px))`;
  if (Platform.OS === 'ios') return iosReserve;
  return base;
}
