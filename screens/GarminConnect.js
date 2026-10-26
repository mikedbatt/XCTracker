import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import { confirmDestructive } from '../utils/confirmDialog';
import {
  connectGarminWithCode,
  disconnectGarmin,
  isGarminConnected,
  startGarminAuth,
} from '../garminConfig';

WebBrowser.maybeCompleteAuthSession();

const formatDateTime = (iso) => new Date(iso).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function GarminConnect({ onClose }) {
  const [loading,       setLoading]       = useState(true);
  const [garminLinked,  setGarminLinked]  = useState(false);
  const [lastSync,      setLastSync]      = useState(null);
  const [busy,          setBusy]          = useState(null); // 'connect' | 'disconnect'
  const [error,         setError]         = useState(null);

  // The native flow can deliver the same code twice (openAuthSessionAsync
  // result + the deep-link listener); a code can only be exchanged once.
  const handledCodeRef = useRef(null);

  const isWeb = Platform.OS === 'web';

  useEffect(() => { loadGarminStatus(); }, []);

  // Web: the Garmin login usually finishes in a different browser tab (or the
  // Garmin Connect app), so when the athlete switches back to the PWA, re-read
  // the connection and clear the Connect spinner.
  useEffect(() => {
    if (!isWeb) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      loadGarminStatus();
      setBusy(b => (b === 'connect' ? null : b));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Listen for deep link redirect (native only — Android can return 'dismiss'
  // from openAuthSessionAsync while the deep link still arrives).
  useEffect(() => {
    if (isWeb) return undefined;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!url.includes('garmin-auth')) return;
      if (global._garminOAuthState) handleAuthRedirect(url);
    });
    return () => subscription.remove();
  }, []);

  const loadGarminStatus = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const data = userDoc.exists() ? userDoc.data() : {};
      setGarminLinked(isGarminConnected(data));
      setLastSync(data.garminLastSync ?? null);
    } catch (e) { console.error('Load Garmin status:', e); }
    setLoading(false);
  };

  const handleConnect = async () => {
    setError(null);
    setBusy('connect');
    try {
      if (isWeb) {
        // Full-page redirect; app/garmin-callback.tsx finishes the flow.
        const { authUrl, state } = await startGarminAuth(`${window.location.origin}/garmin-callback`);
        // Fallback only, for when Garmin's redirect omits ?state= and the
        // return lands in this same browser context.
        try { localStorage.setItem('garmin_oauth_state', state); } catch (e) { console.warn('localStorage unavailable:', e); }
        window.location.href = authUrl;
        return; // keep the spinner up while the page navigates away
      }

      const redirectUri = Linking.createURL('garmin-auth');
      const { authUrl, state } = await startGarminAuth(redirectUri);
      global._garminOAuthState = state;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === 'success' && result.url) {
        await handleAuthRedirect(result.url);
      } else {
        setBusy(null); // cancelled / dismissed — nothing to report
      }
    } catch (e) {
      console.error('Garmin auth error:', e);
      setError(e.message || 'Could not open Garmin. Please try again.');
      setBusy(null);
    }
  };

  const handleAuthRedirect = async (url) => {
    const params = new URLSearchParams(url.split('?')[1]);
    const code = params.get('code');
    if (params.get('error') || !code) {
      setError('Garmin authorization was cancelled.');
      setBusy(null);
      return;
    }
    if (handledCodeRef.current === code) return;
    handledCodeRef.current = code;
    const state = params.get('state') || global._garminOAuthState;
    global._garminOAuthState = null;

    setBusy('connect');
    try {
      await connectGarminWithCode(code, state);
      await loadGarminStatus();
    } catch (e) {
      console.error('Garmin OAuth error:', e);
      setError(e.message);
    }
    setBusy(null);
  };

  const handleDisconnect = () => {
    confirmDestructive({
      title: 'Disconnect Garmin?',
      message: 'Your existing runs will remain. You can reconnect at any time.',
      confirmLabel: 'Disconnect',
      onConfirm: async () => {
        setError(null);
        setBusy('disconnect');
        try {
          await disconnectGarmin();
          setGarminLinked(false);
          setLastSync(null);
        } catch (e) {
          console.error('Garmin disconnect:', e);
          setError(e.message);
        }
        setBusy(null);
      },
    });
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Connect Garmin</Text>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
        <Ionicons name="close" size={22} color={SIGNAL.color.ink} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      </View>
    );
  }

  const errorCard = error && (
    <View style={[styles.card, styles.errorCard]}>
      <Ionicons name="alert-circle" size={18} color={SIGNAL.color.coral} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {header}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {errorCard}

        {garminLinked ? (
          <>
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={18} color={SIGNAL.color.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>Status</Text>
                  <Text style={styles.statusTitle}>Garmin connected</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last run received</Text>
                <Text style={styles.infoValue}>{lastSync ? formatDateTime(lastSync) : 'Waiting for first run'}</Text>
              </View>
            </View>

            <Text style={[styles.helperText, { marginTop: -SIGNAL.space[2] }]}>
              New runs appear automatically a few minutes after your watch syncs with your phone. Runs from before you connected aren't imported.
            </Text>

            <View style={styles.card}>
              <Text style={styles.eyebrow}>What gets synced</Text>
              <View style={{ height: 8 }} />
              {[
                'Miles (converted from meters automatically)',
                'Duration and calculated pace',
                'Pace auto-classified into training zones',
                'Elevation gain',
                'Activity name (used as run notes)',
              ].map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Ionicons name="checkmark" size={16} color={SIGNAL.color.emerald} style={{ marginTop: 2 }} />
                  <Text style={styles.detailText}>{item}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.disconnectBtn, busy && styles.btnDisabled]}
              onPress={handleDisconnect}
              disabled={!!busy}
              activeOpacity={0.85}
            >
              {busy === 'disconnect'
                ? <ActivityIndicator color={SIGNAL.color.coral} />
                : <Text style={styles.disconnectBtnText}>Disconnect Garmin</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Why connect</Text>
              <Text style={styles.cardHeading}>Automatic run tracking</Text>
              <Text style={styles.cardBody}>
                Pull runs, pace, and mileage directly from your Garmin watch so your log stays complete.
              </Text>

              <View style={styles.divider} />

              {[
                'Runs sync automatically — no manual entry',
                'Every run from the moment you connect syncs on its own',
                'Works with every Garmin running watch',
                'Keeps your log complete when you forget',
                'Your coach sees real data, not estimates',
              ].map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Ionicons name="checkmark" size={16} color={SIGNAL.color.emerald} style={{ marginTop: 2 }} />
                  <Text style={styles.detailText}>{item}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.connectBtn, busy && styles.btnDisabled]}
              onPress={handleConnect}
              disabled={!!busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Connect with Garmin"
            >
              {busy === 'connect'
                ? <ActivityIndicator color={SIGNAL.color.white} />
                : (
                  <>
                    <Ionicons name="watch-outline" size={20} color={SIGNAL.color.white} style={{ marginRight: 10 }} />
                    <Text style={styles.connectBtnText}>Connect with Garmin</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <Text style={styles.helperText}>
              You'll be taken to Garmin Connect to authorize XCTracker to read your activities. We never post or modify your Garmin data.
            </Text>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SIGNAL.color.paper2,
  },
  headerTitle: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.white,
    ...SIGNAL.border.hairline,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[2],
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIGNAL.space[2],
    backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.fill}`,
    borderColor: SIGNAL.color.coral,
  },
  errorText: {
    flex: 1,
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.ink,
    lineHeight: 20,
  },
  eyebrow: { ...SIGNAL.style.eyebrow },
  cardHeading: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.ink,
    marginTop: 6,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  cardBody: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    lineHeight: 20,
    marginTop: 6,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
  },
  checkBadge: {
    width: 36,
    height: 36,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    marginTop: 2,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  divider: {
    height: 1,
    backgroundColor: SIGNAL.color.line,
    marginVertical: SIGNAL.space[4],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
  },
  infoValue: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.ink,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIGNAL.space[2],
    marginBottom: SIGNAL.space[2],
  },
  detailText: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    lineHeight: 20,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  btnDisabled: { opacity: 0.5 },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 16,
    paddingHorizontal: SIGNAL.space[6],
    marginBottom: SIGNAL.space[3],
    alignSelf: 'stretch',
  },
  connectBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  disconnectBtn: {
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 14,
    paddingHorizontal: SIGNAL.space[6],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.coral,
    marginBottom: SIGNAL.space[4],
  },
  disconnectBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.coral,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  helperText: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    marginBottom: SIGNAL.space[5],
    lineHeight: 18,
    paddingHorizontal: SIGNAL.space[2],
  },
});
