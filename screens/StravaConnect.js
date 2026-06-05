import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  collection,
  doc, getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { BRAND, SIGNAL, STRAVA_ORANGE } from '../constants/design';
import {
  STRAVA_CONFIG,
  connectStravaWithCode,
  fetchStravaActivities,
  fetchStravaStreams,
  refreshStravaToken,
  stravaActivityToRun,
} from '../stravaConfig';
import { calcPaceZoneBreakdown } from '../utils/vdotUtils';

WebBrowser.maybeCompleteAuthSession();

export default function StravaConnect({ userData, school, onClose, onSynced }) {
  const [stravaLinked,  setStravaLinked]  = useState(false);
  const [stravaAthlete, setStravaAthlete] = useState(null);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [lastSyncDate,  setLastSyncDate]  = useState(null);

  const primaryColor = school?.primaryColor || BRAND;

  useEffect(() => { loadStravaStatus(); }, []);

  // Listen for deep link redirect from Strava
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  const handleDeepLink = async (event) => {
    const url = event.url;
    if (!url.includes('strava-auth')) return;

    // Parse the authorization code from the URL
    const params = new URLSearchParams(url.split('?')[1]);
    const code  = params.get('code');
    const error = params.get('error');

    if (error) {
      Alert.alert('Connection cancelled', 'Strava authorization was cancelled.');
      return;
    }
    if (code) {
      await handleOAuthSuccess(code);
    }
  };

  const loadStravaStatus = async () => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.stravaAccessToken) {
          setStravaLinked(true);
          setStravaAthlete(data.stravaAthlete || null);
          setLastSyncDate(data.stravaLastSync ? new Date(data.stravaLastSync) : null);
        }
      }
    } catch (e) { console.error('Load Strava status:', e); }
    setLoading(false);
  };

  const handleConnect = async () => {
    try {
      // Web: full-page redirect to Strava; the /strava-callback route handles the
      // return (the native in-app browser session flow doesn't apply on web).
      if (Platform.OS === 'web') {
        const redirectUri = `${window.location.origin}/strava-callback`;
        const authUrl = `${STRAVA_CONFIG.authUrl}?client_id=${STRAVA_CONFIG.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=auto&scope=${STRAVA_CONFIG.scopes}`;
        window.location.href = authUrl;
        return;
      }

      // Native: build the redirect URI using Expo's deep linking
      const redirectUri = Linking.createURL('strava-auth');

      const authUrl = `${STRAVA_CONFIG.authUrl}?client_id=${STRAVA_CONFIG.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&approval_prompt=auto&scope=${STRAVA_CONFIG.scopes}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const params = new URLSearchParams(result.url.split('?')[1]);
        const code  = params.get('code');
        const error = params.get('error');
        if (error) {
          Alert.alert('Cancelled', 'Strava authorization was cancelled.');
          return;
        }
        if (code) await handleOAuthSuccess(code);
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User closed the browser — no action needed
      }
    } catch (e) {
      console.error('Auth error:', e);
      Alert.alert('Error', 'Could not open Strava authorization. Please try again.');
    }
  };

  const handleOAuthSuccess = async (code) => {
    setSyncing(true);
    try {
      const redirectUri = Linking.createURL('strava-auth');
      const tokenData = await connectStravaWithCode(auth.currentUser.uid, code, redirectUri);

      setStravaLinked(true);
      setStravaAthlete({
        firstName: tokenData.athlete?.firstname,
        lastName:  tokenData.athlete?.lastname,
      });

      Alert.alert(
        'Strava connected! 🎉',
        `Welcome ${tokenData.athlete?.firstname}! Syncing your recent runs now...`,
        [{ text: 'OK', onPress: () => handleSync(tokenData.access_token) }]
      );
    } catch (e) {
      console.error('OAuth error:', e);
      Alert.alert('Error', 'Could not complete Strava connection. Please try again.');
    }
    setSyncing(false);
  };

  const getValidToken = async () => {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const data = userDoc.data();

    const now = Math.floor(Date.now() / 1000);
    if (data.stravaTokenExpiry && data.stravaTokenExpiry > now + 300) {
      return data.stravaAccessToken;
    }

    // Token expired — refresh it
    const refreshed = await refreshStravaToken(data.stravaRefreshToken);
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      stravaAccessToken:  refreshed.access_token,
      stravaRefreshToken: refreshed.refresh_token,
      stravaTokenExpiry:  refreshed.expires_at,
    });
    return refreshed.access_token;
  };

  const handleSync = async (tokenOverride = null) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = tokenOverride || await getValidToken();

      // Get timestamp for sync window
      // Use 90 days ago for first sync OR if last sync was today (bad state from failed first sync)
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const data = userDoc.data();
      const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
      const lastSyncStr = data.stravaLastSync;

      // Fetch everything since last sync, or 90 days for first sync
      let lastSync;
      if (!lastSyncStr) {
        lastSync = ninetyDaysAgo;
      } else {
        const lastSyncTime = Math.floor(new Date(lastSyncStr).getTime() / 1000);
        lastSync = Math.max(lastSyncTime, ninetyDaysAgo);
      }

      // Fetch activities from Strava
      const activities = await fetchStravaActivities(token, lastSync);

      if (!activities || activities.length === 0) {
        setSyncResult({ imported: 0, skipped: 0, message: 'No new runs found on Strava.' });
        setSyncing(false);
        return;
      }

      // Get existing Strava run IDs to avoid duplicates
      const existingSnap = await getDocs(query(
        collection(db, 'runs'),
        where('userId', '==', auth.currentUser.uid),
        where('source', '==', 'strava')
      ));
      const existingStravaIds = new Set(existingSnap.docs.map(d => d.data().stravaId));

      let imported = 0;
      let skipped  = 0;
      let totalMilesImported = 0;

      // Load the athlete doc once — used for pace-zone calculation below.
      const userSnap2 = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const athleteData = userSnap2.data();
      const trainingPaces = athleteData?.trainingPaces || null;

      for (const activity of activities) {
        if (existingStravaIds.has(activity.id.toString())) { skipped++; continue; }

        const run = stravaActivityToRun(activity, auth.currentUser.uid, userData.schoolId);
        if (!run) { skipped++; continue; }

        // Fetch the pace stream only to compute paceZoneSeconds at sync time.
        // We do NOT persist the raw stream — storing one entry per second of
        // activity inline on the run doc was OOM-crashing the app for users
        // with lots of synced runs.
        let paceZoneSeconds = null;
        if (trainingPaces) {
          try {
            const { paceStream } = await fetchStravaStreams(token, activity.id);
            if (paceStream) paceZoneSeconds = calcPaceZoneBreakdown(paceStream, trainingPaces);
            await new Promise(r => setTimeout(r, 200));
          } catch (e) { console.warn('Stream fetch:', e); }
        }

        const runWithZones = {
          ...run,
          ...(paceZoneSeconds ? { paceZoneSeconds, hasPaceData: true } : { hasPaceData: false }),
        };

        // Deterministic doc ID prevents duplicate runs from concurrent syncs.
        // A second sync that races with the first just overwrites the same doc.
        await setDoc(doc(db, 'runs', `strava_${auth.currentUser.uid}_${activity.id}`), runWithZones);
        totalMilesImported += run.miles;
        imported++;
      }

      // Update total miles and last sync timestamp
      const newTotal = Math.round(((data.totalMiles || 0) + totalMilesImported) * 10) / 10;
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        totalMiles:      newTotal,
        stravaLastSync:  new Date().toISOString(),
      });

      const now = new Date();
      setLastSyncDate(now);
      setSyncResult({
        imported,
        skipped,
        miles: Math.round(totalMilesImported * 10) / 10,
        message: imported > 0
          ? `${imported} run${imported !== 1 ? 's' : ''} imported (${Math.round(totalMilesImported * 10) / 10} miles)`
          : 'All runs already imported — you\'re up to date!',
      });

      if (imported > 0) onSynced && onSynced();
    } catch (e) {
      console.error('Sync error:', e);
      Alert.alert('Sync failed', 'Could not sync with Strava. Please try again.');
    }
    setSyncing(false);
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Strava?',
      'Your existing runs will remain. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: async () => {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            stravaAccessToken:  null,
            stravaRefreshToken: null,
            stravaTokenExpiry:  null,
            stravaAthleteId:    null,
            stravaAthlete:      null,
            stravaLastSync:     null,
          });
          setStravaLinked(false);
          setStravaAthlete(null);
          setLastSyncDate(null);
          setSyncResult(null);
        }},
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Connect Strava</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={SIGNAL.color.ink} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect Strava</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={SIGNAL.color.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {stravaLinked ? (
          <>
            {/* Connected status card */}
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={18} color={SIGNAL.color.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>Status</Text>
                  <Text style={styles.statusTitle}>
                    Connected as {stravaAthlete?.firstName || 'athlete'} {stravaAthlete?.lastName || ''}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last synced</Text>
                <Text style={styles.infoValue}>
                  {lastSyncDate
                    ? lastSyncDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'Never'}
                </Text>
              </View>
            </View>

            {/* Sync result */}
            {syncResult && (
              <View style={[styles.card, styles.resultCard, { borderLeftColor: syncResult.imported > 0 ? SIGNAL.color.emerald : SIGNAL.color.mute2 }]}>
                <Text style={[styles.resultTitle, { color: syncResult.imported > 0 ? SIGNAL.color.emerald : SIGNAL.color.mute }]}>
                  {syncResult.imported > 0 ? 'Sync complete' : 'Already up to date'}
                </Text>
                <Text style={styles.resultMessage}>{syncResult.message}</Text>
                {syncResult.imported > 0 && (
                  <Text style={styles.resultHint}>
                    Add effort rating and notes to your imported runs from your run list.
                  </Text>
                )}
              </View>
            )}

            {/* Sync button (indigo primary action) */}
            <TouchableOpacity
              style={[styles.primaryBtn, syncing && styles.btnDisabled]}
              onPress={() => handleSync()}
              disabled={syncing}
              activeOpacity={0.85}
            >
              {syncing
                ? <ActivityIndicator color={SIGNAL.color.white} />
                : (
                  <>
                    <Ionicons name="refresh" size={18} color={SIGNAL.color.white} style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Sync runs now</Text>
                  </>
                )
              }
            </TouchableOpacity>

            <Text style={styles.helperText}>
              Syncs all running activities from the past 90 days on first sync, then only new runs after that.
            </Text>

            {/* What gets imported */}
            <View style={styles.card}>
              <Text style={styles.eyebrow}>What gets imported</Text>
              <View style={{ height: 8 }} />
              {[
                'Miles (converted from km automatically)',
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
              <Text style={styles.detailNote}>
                You'll add effort rating (1–10) and personal notes after import.
              </Text>
            </View>

            {/* Disconnect (coral destructive) */}
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} activeOpacity={0.85}>
              <Text style={styles.disconnectBtnText}>Disconnect Strava</Text>
            </TouchableOpacity>

          </>
        ) : (
          <>
            {/* Info / benefits card */}
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Why connect</Text>
              <Text style={styles.cardHeading}>Automatic run tracking</Text>
              <Text style={styles.cardBody}>
                Pull runs, pace, and mileage directly from Strava so your log stays complete.
              </Text>

              <View style={styles.divider} />

              {[
                'Runs sync automatically — no manual entry',
                'Pace zones from real GPS data',
                'Pace and mileage pulled from GPS',
                'Keeps your log complete when you forget',
                'Your coach sees real data, not estimates',
              ].map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Ionicons name="checkmark" size={16} color={SIGNAL.color.emerald} style={{ marginTop: 2 }} />
                  <Text style={styles.detailText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Connect with Strava (Strava orange CTA) */}
            <TouchableOpacity
              style={styles.connectBtn}
              onPress={handleConnect}
              activeOpacity={0.85}
            >
              <Text style={styles.connectBtnText}>Connect with Strava</Text>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              You'll be taken to Strava to authorize TeamBase to read your activities. We never post or modify your Strava data.
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

  // ── Header ──────────────────────────────────────────────────────────────────
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

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[2],
  },

  // ── Cards ───────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },

  // ── Eyebrow / typography ────────────────────────────────────────────────────
  eyebrow: {
    ...SIGNAL.style.eyebrow,
  },
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

  // ── Connected status ────────────────────────────────────────────────────────
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

  // ── Result card ─────────────────────────────────────────────────────────────
  resultCard: {
    borderLeftWidth: 4,
  },
  resultTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    marginBottom: 4,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  resultMessage: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    marginBottom: 6,
    lineHeight: 20,
  },
  resultHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    lineHeight: 18,
  },

  // ── Detail rows (bulleted lists) ────────────────────────────────────────────
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
  detailNote: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: SIGNAL.space[2],
    lineHeight: 18,
  },

  // ── Buttons ─────────────────────────────────────────────────────────────────
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 16,
    paddingHorizontal: SIGNAL.space[6],
    marginBottom: SIGNAL.space[3],
  },
  primaryBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  connectBtn: {
    backgroundColor: STRAVA_ORANGE,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 16,
    paddingHorizontal: SIGNAL.space[6],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIGNAL.space[3],
  },
  connectBtnText: {
    fontFamily: SIGNAL.font.bodyBold,
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

  // ── Helper / hint text ──────────────────────────────────────────────────────
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
