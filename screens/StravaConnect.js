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
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  STRAVA_CONFIG, exchangeStravaCode,
  fetchStravaActivities,
  fetchStravaHRStream,
  refreshStravaToken,
  stravaActivityToRun,
} from '../stravaConfig';
import {
  DEFAULT_ZONE_BOUNDARIES, calcMaxHR, calcZoneBreakdownFromStream,
} from '../zoneConfig';

WebBrowser.maybeCompleteAuthSession();

export default function StravaConnect({ userData, school, onClose, onSynced }) {
  const [stravaLinked,  setStravaLinked]  = useState(false);
  const [stravaAthlete, setStravaAthlete] = useState(null);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [lastSyncDate,  setLastSyncDate]  = useState(null);

  const primaryColor = school?.primaryColor || '#2e7d32';

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
      // Build the redirect URI using Expo's deep linking
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
      const tokenData = await exchangeStravaCode(code, redirectUri);

      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        stravaAccessToken:  tokenData.access_token,
        stravaRefreshToken: tokenData.refresh_token,
        stravaTokenExpiry:  tokenData.expires_at,
        stravaAthleteId:    tokenData.athlete?.id?.toString(),
        stravaAthlete: {
          id:        tokenData.athlete?.id,
          firstName: tokenData.athlete?.firstname,
          lastName:  tokenData.athlete?.lastname,
        },
      });

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
      const today = new Date().toISOString().split('T')[0];
      const lastSyncStr = data.stravaLastSync;
      const lastSyncIsToday = lastSyncStr && lastSyncStr.startsWith(today);

      // If last sync was today (bad state) or no sync yet, go back 90 days
      // Otherwise go back to start of yesterday to catch any runs logged today
      let lastSync;
      if (!lastSyncStr || lastSyncIsToday) {
        lastSync = ninetyDaysAgo;
      } else {
        // Use start of yesterday so we always catch runs from today
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        lastSync = Math.floor(yesterday.getTime() / 1000);
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

      // Load athlete's zone settings for accurate zone calculation
      let zoneSettings = null;
      try {
        const zoneDoc = await getDoc(doc(db, 'zoneSettings', auth.currentUser.uid));
        if (zoneDoc.exists()) zoneSettings = zoneDoc.data();
      } catch { /* use defaults */ }

      // Determine age and max HR for zone calculation
      const userSnap2 = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const athleteData = userSnap2.data();
      const age = athleteData?.birthdate
        ? Math.floor((new Date() - new Date(athleteData.birthdate)) / (365.25 * 86400000))
        : 16;
      const boundaries = zoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
      const maxHR = calcMaxHR(age, zoneSettings?.customMaxHR);

      for (const activity of activities) {
        if (existingStravaIds.has(activity.id.toString())) { skipped++; continue; }

        const run = stravaActivityToRun(activity, auth.currentUser.uid, userData.schoolId);
        if (!run) { skipped++; continue; }

        // Try to fetch HR stream for accurate zone data
        // Rate limit: only fetch streams for activities that have HR data
        let zoneSeconds = null;
        let rawHRStream = null;
        if (activity.average_heartrate && activity.has_heartrate) {
          try {
            const stream = await fetchStravaHRStream(token, activity.id);
            if (stream) {
              rawHRStream = stream; // Store raw { hr, seconds } array for recalculation
              const breakdown = calcZoneBreakdownFromStream(stream, maxHR, boundaries);
              if (breakdown) {
                zoneSeconds = {};
                breakdown.forEach(z => { zoneSeconds[`z${z.zone}`] = z.seconds; });
              }
            }
            await new Promise(r => setTimeout(r, 200));
          } catch (e) { console.log('Stream fetch:', e); }
        }

        const runWithZones = {
          ...run,
          ...(zoneSeconds ? { zoneSeconds, hasStreamData: true } : { hasStreamData: false }),
          ...(rawHRStream ? { rawHRStream } : {}), // store raw stream for recalculation
        };

        await setDoc(doc(collection(db, 'runs')), runWithZones);
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
        <View style={[styles.header, { backgroundColor: primaryColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Strava Sync</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Strava Sync</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Strava logo / branding area */}
        <View style={styles.brandCard}>
          <View style={styles.stravaLogo}>
            <Text style={styles.stravaLogoText}>STRAVA</Text>
          </View>
          <Text style={styles.brandTitle}>
            {stravaLinked ? 'Strava connected' : 'Connect Strava'}
          </Text>
          <Text style={styles.brandSubtitle}>
            {stravaLinked
              ? `Syncing as ${stravaAthlete?.firstName || 'athlete'} ${stravaAthlete?.lastName || ''}`
              : 'Automatically import your runs — no manual entry needed'
            }
          </Text>
        </View>

        {stravaLinked ? (
          <>
            {/* Last sync info */}
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Last synced</Text>
              <Text style={styles.infoValue}>
                {lastSyncDate
                  ? lastSyncDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Never'}
              </Text>
            </View>

            {/* Sync result */}
            {syncResult && (
              <View style={[styles.resultCard, { borderLeftColor: syncResult.imported > 0 ? primaryColor : '#999' }]}>
                <Text style={[styles.resultTitle, { color: syncResult.imported > 0 ? primaryColor : '#666' }]}>
                  {syncResult.imported > 0 ? '✅ Sync complete' : 'ℹ️ Already up to date'}
                </Text>
                <Text style={styles.resultMessage}>{syncResult.message}</Text>
                {syncResult.imported > 0 && (
                  <Text style={styles.resultHint}>
                    Add effort rating and notes to your imported runs from your run list.
                  </Text>
                )}
              </View>
            )}

            {/* Sync button */}
            <TouchableOpacity
              style={[styles.syncBtn, { backgroundColor: syncing ? '#ccc' : '#fc4c02' }]}
              onPress={() => handleSync()}
              disabled={syncing}
            >
              {syncing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.syncBtnText}>↻  Sync runs now</Text>
              }
            </TouchableOpacity>

            <Text style={styles.syncHint}>
              Syncs all running activities from the past 90 days on first sync, then only new runs after that.
            </Text>

            {/* What gets imported */}
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>What gets imported</Text>
              {[
                'Miles (converted from km automatically)',
                'Duration and calculated pace',
                'Average heart rate → auto-classified to Zone 1–5',
                'Elevation gain',
                'Activity name (used as run notes)',
              ].map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Text style={[styles.detailDot, { color: primaryColor }]}>✓</Text>
                  <Text style={styles.detailText}>{item}</Text>
                </View>
              ))}
              <Text style={styles.detailNote}>
                You'll add effort rating (1–10) and personal notes after import.
              </Text>
            </View>

            {/* Disconnect */}
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>Disconnect Strava</Text>
            </TouchableOpacity>

          </>
        ) : (
          <>
            {/* Benefits */}
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>Why connect Strava?</Text>
              {[
                'Runs sync automatically — no manual entry needed',
                'Heart rate zones calculated from your actual HR data',
                'Pace and mileage pulled directly from GPS',
                'Keeps your training log complete even when you forget to log',
                'Your coach sees your real data, not estimated data',
              ].map((item, i) => (
                <View key={i} style={styles.detailRow}>
                  <Text style={[styles.detailDot, { color: primaryColor }]}>✓</Text>
                  <Text style={styles.detailText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Connect button */}
            <TouchableOpacity
              style={[styles.connectBtn]}
              onPress={handleConnect}
            >
              <Text style={styles.connectBtnText}>Connect with Strava</Text>
            </TouchableOpacity>

            <Text style={styles.syncHint}>
              You'll be taken to Strava to authorize XCTracker to read your activities. We never post or modify your Strava data.
            </Text>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#f5f5f5' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:             { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:            { paddingVertical: 6, paddingHorizontal: 10 },
  backText:           { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerTitle:        { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  scroll:             { flex: 1 },
  brandCard:          { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 24, alignItems: 'center' },
  stravaLogo:         { backgroundColor: '#fc4c02', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 12 },
  stravaLogoText:     { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  brandTitle:         { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 6 },
  brandSubtitle:      { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  infoCard:           { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:          { fontSize: 14, color: '#999' },
  infoValue:          { fontSize: 14, fontWeight: '600', color: '#333' },
  resultCard:         { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  resultTitle:        { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  resultMessage:      { fontSize: 14, color: '#444', marginBottom: 6 },
  resultHint:         { fontSize: 12, color: '#999', fontStyle: 'italic' },
  syncBtn:            { marginHorizontal: 16, borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 10 },
  syncBtnText:        { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  syncHint:           { marginHorizontal: 16, fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  detailCard:         { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 14, padding: 16 },
  detailTitle:        { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12 },
  detailRow:          { flexDirection: 'row', gap: 8, marginBottom: 8 },
  detailDot:          { fontSize: 14, fontWeight: '700', width: 16 },
  detailText:         { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },
  detailNote:         { fontSize: 12, color: '#999', marginTop: 8, fontStyle: 'italic' },
  connectBtn:         { marginHorizontal: 16, backgroundColor: '#fc4c02', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 10 },
  connectBtnDisabled: { backgroundColor: '#ccc' },
  connectBtnText:     { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  disconnectBtn:      { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  disconnectBtnText:  { color: '#dc2626', fontSize: 15, fontWeight: '600' },
});