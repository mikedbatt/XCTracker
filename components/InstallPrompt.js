// ── InstallPrompt ────────────────────────────────────────────────────────────
// A dismissible banner that nudges web visitors to install the PWA to their home
// screen. Renders NOTHING on native, when already installed (standalone), or once
// dismissed/installed.
//
//   • Android / desktop Chrome — captures the `beforeinstallprompt` event and
//     shows an "Install" button that triggers the native install dialog.
//   • iOS Safari — has no install event, so we show the manual
//     "Share → Add to Home Screen" steps instead.
//
// Dismissal is remembered in localStorage so we don't nag on every visit.

import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SIGNAL } from '../constants/design';

const DISMISS_KEY = 'tb_install_dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  // Hooks must run unconditionally; we gate on Platform inside the effect and render.
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until we confirm eligibility

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStandalone()) return; // already installed — nothing to do

    let alreadyDismissed = false;
    try {
      alreadyDismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      // localStorage can throw in private mode — treat as not dismissed.
    }
    if (alreadyDismissed) return;
    setDismissed(false);

    // iOS can't programmatically prompt — show manual instructions instead.
    if (isIOS()) {
      setShowIosHint(true);
      return;
    }

    const onBeforeInstall = (e) => {
      e.preventDefault(); // stash the event so we can trigger it from our button
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setShowIosHint(false);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore — banner is dismissed for this session regardless.
    }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // user dismissed the native dialog — fine.
    }
    setDeferredPrompt(null); // a prompt event can only be used once
  };

  if (Platform.OS !== 'web' || dismissed) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.icon}>
          <Ionicons name="download-outline" size={20} color={SIGNAL.color.indigo} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Install XCTracker</Text>
          <Text style={styles.sub}>
            {showIosHint
              ? 'Tap the Share button, then “Add to Home Screen.”'
              : 'Add it to your home screen for a full-screen, app-like experience.'}
          </Text>
        </View>
        {!showIosHint && (
          <TouchableOpacity style={styles.cta} onPress={install} accessibilityRole="button">
            <Text style={styles.ctaText}>Install</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.close}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss install prompt"
        >
          <Ionicons name="close" size={18} color={SIGNAL.color.mute} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen,
    paddingBottom: SIGNAL.space[6],
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[5],
    // Floating element → shadow is allowed per Signal spec.
    shadowColor: '#0B0D12',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: SIGNAL.radius.control,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SIGNAL.space[4],
  },
  body: { flex: 1, marginRight: SIGNAL.space[3] },
  title: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sub: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  cta: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[2],
    paddingHorizontal: SIGNAL.space[5],
    marginRight: SIGNAL.space[2],
  },
  ctaText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.white,
  },
  close: {
    padding: SIGNAL.space[1],
  },
});
