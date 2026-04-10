import { Ionicons } from '@expo/vector-icons';
import {
    addDoc,
    collection,
    deleteDoc, doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView, Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE } from '../constants/design';

export default function TeamFeed({ userData, school, onClose, channel, channelName }) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [message,     setMessage]     = useState('');
  const [posting,     setPosting]     = useState(false);
  const [showTip,     setShowTip]     = useState(false);
  const [imageUri,    setImageUri]    = useState(null);
  const inputRef = useRef(null);

  const primaryColor = school?.primaryColor || BRAND;
  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';
  const myUid   = auth.currentUser?.uid;

  const activeChannel = channel || 'whole_team';

  // ── Mark channel as seen on open ────────────────────────────────────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      updateDoc(doc(db, 'users', uid), {
        [`lastSeenChannels.${activeChannel}`]: new Date(),
        // Also update legacy lastSeenFeed for backward compat
        ...(activeChannel === 'whole_team' && { lastSeenFeed: new Date() }),
      }).catch(() => {});
    }
  }, [activeChannel]);

  // ── Real-time listener (filtered by channel) ───────────────────────────
  useEffect(() => {
    if (!userData.schoolId) return;
    // Single-field query on schoolId, filter channel client-side to avoid composite index
    const q = query(
      collection(db, 'teamPosts'),
      where('schoolId', '==', userData.schoolId),
    );
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all
        .filter(p => (p.channel || 'whole_team') === activeChannel)
        .sort((a, b) => {
          const aT = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const bT = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return bT - aT;
        })
        .slice(0, 100);
      setPosts(filtered);
      setLoading(false);
    }, err => {
      console.warn('TeamFeed listener:', err);
      loadPosts();
    });
    return () => unsub();
  }, [activeChannel]);

  const loadPosts = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'teamPosts'),
        where('schoolId', '==', userData.schoolId),
      ));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all
        .filter(p => (p.channel || 'whole_team') === activeChannel)
        .sort((a, b) => {
          const aT = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const bT = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return bT - aT;
        })
        .slice(0, 100);
      setPosts(filtered);
    } catch (e) { console.warn('Load posts:', e); }
    setLoading(false);
    setRefreshing(false);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const filename = `teamPosts/${userData.schoolId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  };

  const handlePost = async () => {
    const text = message.trim();
    if (!text && !imageUri) return;
    if (text.length > 500) {
      Alert.alert('Too long', 'Messages are limited to 500 characters.');
      return;
    }
    setPosting(true);
    try {
      let imageUrl = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
      }
      await addDoc(collection(db, 'teamPosts'), {
        schoolId:    userData.schoolId,
        channel:     activeChannel,
        text:        text || '',
        authorId:    myUid,
        authorName:  `${userData.firstName} ${userData.lastName}`,
        authorRole:  userData.role,
        createdAt:   serverTimestamp(),
        ...(imageUrl && { imageUrl }),
      });
      setMessage('');
      setImageUri(null);
      inputRef.current?.blur();
    } catch (e) {
      Alert.alert('Error', 'Could not post. Please try again.');
    }
    setPosting(false);
  };

  const handleSaveImage = async (imageUrl) => {
    if (!imageUrl) return;
    try {
      // Request permission first; bail with a friendly message if denied
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'TeamBase needs photo library access to save images. You can enable it in Settings → TeamBase → Photos.'
        );
        return;
      }

      // Download the remote image to a local temp file, then save to camera roll
      const filename = `teambase_${Date.now()}.jpg`;
      const localPath = FileSystem.cacheDirectory + filename;
      const download = await FileSystem.downloadAsync(imageUrl, localPath);
      if (download.status !== 200) throw new Error(`HTTP ${download.status}`);

      await MediaLibrary.saveToLibraryAsync(download.uri);

      // Best-effort cleanup of the temp file
      try { await FileSystem.deleteAsync(download.uri, { idempotent: true }); }
      catch (e) { console.warn('Temp file cleanup:', e); }

      Alert.alert('Saved', 'Image saved to your camera roll.');
    } catch (e) {
      console.warn('Save image failed:', e);
      Alert.alert('Could not save', 'Something went wrong saving this image. Please try again.');
    }
  };

  const handleDelete = (post) => {
    const isOwn = post.authorId === myUid;
    Alert.alert(
      'Delete post?',
      isOwn
        ? 'Remove your message from the team feed?'
        : `Remove ${post.authorName}'s message from the feed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'teamPosts', post.id));
          } catch {
            Alert.alert('Error', 'Could not delete post.');
          }
        }},
      ]
    );
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate?.() || new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr  = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr  < 24) return `${diffHr}h ago`;
    if (diffDay < 7)  return `${diffDay}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getRoleBadge = (role) => {
    if (role === 'admin_coach')     return { label: 'Head Coach', color: '#1565c0' };
    if (role === 'assistant_coach') return { label: 'Coach',      color: '#1976d2' };
    return null;
  };

  const renderPost = ({ item: post }) => {
    const isOwn   = post.authorId === myUid;
    const canDelete = isOwn || isCoach;
    const badge   = getRoleBadge(post.authorRole);
    const initials = post.authorName?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';

    return (
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        {!isOwn && (
          <View style={[styles.postAvatar, { backgroundColor: badge ? badge.color : '#888' }]}>
            <Text style={styles.postAvatarText}>{initials}</Text>
          </View>
        )}
        <View style={[styles.bubble, isOwn ? { backgroundColor: primaryColor, borderBottomRightRadius: 4 } : styles.bubbleOther]}>
          {!isOwn && (
            <View style={styles.bubbleHeader}>
              <Text style={styles.bubbleAuthor}>{post.authorName}</Text>
              {badge && (
                <View style={[styles.roleBadge, { backgroundColor: badge.color }]}>
                  <Text style={styles.roleBadgeText}>{badge.label}</Text>
                </View>
              )}
            </View>
          )}
          {post.imageUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => {
                Alert.alert(
                  'Save image',
                  'Save this image to your camera roll?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Save', onPress: () => handleSaveImage(post.imageUrl) },
                  ]
                );
              }}
            >
              <Image source={{ uri: post.imageUrl }} style={styles.bubbleImage} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {post.text ? <Text style={[styles.bubbleText, isOwn && { color: '#fff' }]}>{post.text}</Text> : null}
          <View style={styles.bubbleFooter}>
            <Text style={[styles.bubbleTime, isOwn && { color: 'rgba(255,255,255,0.6)' }]}>{formatTime(post.createdAt)}</Text>
            {canDelete && (
              <TouchableOpacity
                onPress={() => handleDelete(post)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.bubbleDelete, isOwn && { color: 'rgba(255,255,255,0.5)' }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {isOwn && <View style={{ width: 38 }} />}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{channelName || 'Team Feed'}</Text>
          <Text style={styles.headerSub}>{school?.name}</Text>
        </View>
        {isCoach ? (
          <TouchableOpacity onPress={() => setShowTip(t => !t)} style={styles.tipBtn}>
            <Ionicons name="information-circle-outline" size={22} color={NEUTRAL.muted} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>
      {showTip && (
        <View style={styles.tipBanner}>
          <Text style={styles.tipText}>Coaches can delete any message. Athletes can only delete their own. Tap "Delete" on any message.</Text>
          <TouchableOpacity onPress={() => setShowTip(false)}>
            <Ionicons name="close" size={16} color={NEUTRAL.muted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Posts list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          inverted
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primaryColor} />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>
                Be the first to post something to the team feed!
              </Text>
            </View>
          }
        />
      )}

      {/* Compose bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {imageUri && (
          <View style={styles.imagePreview}>
            <Image source={{ uri: imageUri }} style={styles.imagePreviewImg} resizeMode="cover" />
            <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setImageUri(null)}>
              <Ionicons name="close-circle" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.composeBar}>
          <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={24} color={NEUTRAL.muted} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.composeInput}
            placeholder={`Message ${channelName || 'the team'}...`}
            placeholderTextColor={NEUTRAL.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.postBtn,
              { backgroundColor: (message.trim() || imageUri) ? primaryColor : '#e0e0e0' }
            ]}
            onPress={handlePost}
            disabled={(!message.trim() && !imageUri) || posting}
          >
            {posting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.postBtnText, { color: (message.trim() || imageUri) ? '#fff' : '#bbb' }]}>Post</Text>
            }
          </TouchableOpacity>
        </View>
        {message.length > 400 && (
          <Text style={styles.charCount}>{500 - message.length} characters remaining</Text>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f5f5f5' },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:            { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:          { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerCenter:      { alignItems: 'center' },
  headerTitle:       { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  headerSub:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 1 },
  tipBtn:            { padding: 8 },
  tipBanner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3e0', paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  tipText:           { flex: 1, fontSize: 12, color: '#e65100', lineHeight: 16 },
  listContent:       { padding: 16, paddingBottom: 8 },
  emptyCard:         { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle:        { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySub:          { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  // Chat bubble styles
  bubbleRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6 },
  bubbleRowOwn:      { flexDirection: 'row-reverse' },
  bubble:            { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOther:       { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleHeader:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  bubbleAuthor:      { fontSize: 13, fontWeight: '700', color: '#555' },
  bubbleText:        { fontSize: 15, color: '#333', lineHeight: 21 },
  bubbleFooter:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  bubbleTime:        { fontSize: 11, color: '#bbb' },
  bubbleDelete:      { fontSize: 11, color: '#ccc', marginLeft: 10 },
  postAvatar:        { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  postAvatarText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  roleBadge:         { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  roleBadgeText:     { color: '#fff', fontSize: 10, fontWeight: '700' },
  composeBar:        { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  composeAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
  composeAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  composeInput:      { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#333', maxHeight: 100, borderWidth: 1, borderColor: '#e0e0e0' },
  imageBtn:          { paddingBottom: 4 },
  postBtn:           { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 2 },
  postBtnText:       { fontSize: 14, fontWeight: '700' },
  charCount:         { textAlign: 'right', fontSize: 11, color: '#f59e0b', paddingHorizontal: 16, paddingBottom: 4, backgroundColor: '#fff' },
  bubbleImage:       { width: '100%', height: 200, borderRadius: 12, marginBottom: 6 },
  imagePreview:      { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', padding: 10, alignItems: 'flex-start' },
  imagePreviewImg:   { width: 80, height: 80, borderRadius: 8 },
  imagePreviewClose: { position: 'absolute', top: 4, left: 74, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 11 },
});