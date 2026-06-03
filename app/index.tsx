import { useFonts } from 'expo-font';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from '@expo-google-fonts/inter-tight';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';
// Import the Ionicons TTF directly so we can inject @font-face on web.
// expo-font's useFonts hook doesn't reliably wire icon fonts on web static
// builds; manual injection is the documented react-native-vector-icons fix.
// @ts-ignore — Metro resolves this asset as a URL string on web.
import iconFont from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf';
import AppNavigator from '../screens/AppNavigator';
import { initSentry } from '../utils/sentry';

// Initialize crash + error monitoring as early as possible so any startup
// errors get captured. No-op when EXPO_PUBLIC_SENTRY_DSN isn't set.
initSentry();

// One-shot @font-face injection on web. Runs at module load, before React mounts.
// The TTF asset import may come back as either a direct URL string or as an
// `{ default: url, uri: url }` shape depending on Metro/Babel interop — handle both.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const fontUrl =
    typeof iconFont === 'string'
      ? iconFont
      : (iconFont as any)?.uri || (iconFont as any)?.default || '';
  if (fontUrl) {
    const style = document.createElement('style');
    style.appendChild(document.createTextNode(
      `@font-face { font-family: 'ionicons'; src: url(${fontUrl}) format('truetype'); }`
    ));
    document.head.appendChild(style);
  } else {
    console.warn('Ionicons font URL could not be resolved from import; icons will render as boxes', iconFont);
  }
}

// Keep the native splash visible while we load the Signal redesign fonts.
// hideAsync() is called once useFonts resolves (success or failure).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Index() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    JetBrainsMono_400Regular,
  });
  // Ionicons is handled by the @font-face injection above (web) and by
  // @expo/vector-icons' own runtime loader (native) — no useFonts entry needed.

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Layout is metric-tolerant — if a font fails to load we still render the
  // app with system fallbacks rather than blocking startup.
  if (!fontsLoaded && !fontError) return null;

  return <AppNavigator />;
}
