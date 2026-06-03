// ── Cross-platform image helpers ─────────────────────────────────────────────
// Native (iOS/Android) uses expo-image-picker + expo-media-library + expo-file-system.
// Web uses DOM primitives (<input type=file> + anchor download). Same call site,
// platform branched here so feature screens don't need Platform checks.

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
// SDK 54 moved the function-based API (downloadAsync, cacheDirectory, deleteAsync)
// to a /legacy subpath. The top-level export is the new class-based File/Paths API.
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Prompt the user to pick an image. Resolves to `{ uri, blob? }` on success,
 * `null` if cancelled, or throws on permission denial (native only).
 */
export async function pickImageCrossPlatform() {
  if (Platform.OS === 'web') return pickImageWeb();

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('Photo library permission denied');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}

function pickImageWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      // Clean up the DOM node either way.
      setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 0);
      if (!file) { resolve(null); return; }
      resolve({ uri: URL.createObjectURL(file), blob: file });
    };
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Save a remote image URL to the user's device.
 * - Native: downloads via expo-file-system, writes to camera roll via MediaLibrary.
 * - Web: triggers a browser download via an anchor element.
 * Throws on permission denial (native only).
 */
export async function saveImageCrossPlatform(imageUrl) {
  if (Platform.OS === 'web') return saveImageWeb(imageUrl);

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    const err = new Error('Photo library permission denied');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const filename = `teambase_${Date.now()}.jpg`;
  const localPath = FileSystem.cacheDirectory + filename;
  const download = await FileSystem.downloadAsync(imageUrl, localPath);
  if (download.status !== 200) throw new Error(`HTTP ${download.status}`);
  await MediaLibrary.saveToLibraryAsync(download.uri);
  try { await FileSystem.deleteAsync(download.uri, { idempotent: true }); }
  catch (e) { console.warn('Temp file cleanup:', e); }
}

async function saveImageWeb(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `teambase_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    URL.revokeObjectURL(objectUrl);
  }, 100);
}
