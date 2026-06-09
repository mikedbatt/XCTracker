import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import { bottomInset } from '../utils/safeArea';
import { BRAND, SIGNAL } from '../constants/design';
import { confirmDestructive } from '../utils/confirmDialog';
import { pickImageCrossPlatform, saveImageCrossPlatform } from '../utils/imageHelpers';

export default function TeamFeed({ userData, school, onClose, channel, channelName }) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [message,     setMessage]     = useState('');
  const [posting,     setPosting]     = useState(false);
  const [showTip,     setShowTip]     = useState(false);
  const [imageUri,    setImageUri]    = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Whether the user is scrolled to the bottom (newest). Starts true so the
  // first load lands on the newest post; flips false when they scroll up to
  // read history so incoming posts don't yank them back down.
  const atBottomRef = useRef(true);

  // Web renders a normal top-down list (no `inverted`), so reverse the
  // newest-first posts to oldest-first → newest ends up at the BOTTOM, like a
  // chat. Native keeps newest-first + `inverted` (same visual result).
  const isWebFeed = Platform.OS === 'web';
  const listData = useMemo(
    () => (isWebFeed ? posts.slice().reverse() : posts),
    [posts, isWebFeed],
  );

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
    // Fetch only the ~100 most recent posts server-side (uses the existing
    // teamPosts[schoolId, createdAt] index) instead of downloading the school's
    // whole post history. Channel is still filtered client-side. The cap is
    // across all channels, which is fine at beta scale (whole_team dominates).
    const q = query(
      collection(db, 'teamPosts'),
      where('schoolId', '==', userData.schoolId),
      orderBy('createdAt', 'desc'),
      limit(100),
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
        orderBy('createdAt', 'desc'),
        limit(100),
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
    try {
      const picked = await pickImageCrossPlatform();
      if (picked) setImageUri(picked.uri);
    } catch (e) {
      if (e.code === 'PERMISSION_DENIED') {
        Alert.alert('Permission needed', 'Allow photo access to attach images.');
      } else {
        console.warn('Pick image failed:', e);
        Alert.alert('Error', 'Could not pick image.');
      }
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
      await saveImageCrossPlatform(imageUrl);
      if (Platform.OS !== 'web') {
        Alert.alert('Saved', 'Image saved to your camera roll.');
      }
      // On web the browser shows the download — no extra alert needed.
    } catch (e) {
      if (e.code === 'PERMISSION_DENIED') {
        Alert.alert(
          'Permission needed',
          'TeamBase needs photo library access to save images. You can enable it in Settings → TeamBase → Photos.'
        );
        return;
      }
      console.warn('Save image failed:', e);
      Alert.alert('Could not save', 'Something went wrong saving this image. Please try again.');
    }
  };

  const handleDelete = (post) => {
    const isOwn = post.authorId === myUid;
    confirmDestructive({
      title: 'Delete post?',
      message: isOwn
        ? 'Remove your message from the team feed?'
        : `Remove ${post.authorName}'s message from the feed?`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'teamPosts', post.id));
        } catch {
          Alert.alert('Error', 'Could not delete post.');
        }
      },
    });
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
    if (role === 'admin_coach')     return { label: 'COACH',   color: SIGNAL.color.indigo };
    if (role === 'assistant_coach') return { label: 'COACH',   color: SIGNAL.color.indigo };
    if (role === 'captain')         return { label: 'CAPTAIN', color: SIGNAL.color.pink };
    return null;
  };

  const renderPost = ({ item: post }) => {
    const isOwn      = post.authorId === myUid;
    const canDelete  = isOwn || isCoach;
    const badge      = getRoleBadge(post.authorRole);
    const initials   = post.authorName?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?';
    const avatarColor = post.authorAvatarColor || SIGNAL.color.indigo;

    if (isOwn) {
      return (
        <View style={styles.bubbleRowOwn}>
          <View style={styles.bubbleOwn}>
            {post.imageUrl && (
              <TouchableOpacity
                activeOpacity={0.85}
                onLongPress={() => {
                  confirmDestructive({
                    title: 'Save image',
                    message: 'Save this image to your camera roll?',
                    confirmLabel: 'Save',
                    onConfirm: () => handleSaveImage(post.imageUrl),
                  });
                }}
              >
                <Image source={{ uri: post.imageUrl }} style={styles.bubbleImage} resizeMode="cover" />
              </TouchableOpacity>
            )}
            {post.text ? (
              <Text style={styles.bubbleTextOwn}>{post.text}</Text>
            ) : null}
            <View style={styles.bubbleFooterOwn}>
              <Text style={styles.bubbleTimeOwn}>{formatTime(post.createdAt)}</Text>
              {canDelete && (
                <TouchableOpacity
                  onPress={() => handleDelete(post)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.bubbleDeleteOwn}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.bubbleRow}>
        <View style={[styles.postAvatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.postAvatarText}>{initials}</Text>
        </View>
        <View style={styles.bubbleOther}>
          <View style={styles.bubbleHeader}>
            <Text style={styles.bubbleAuthor}>{post.authorName}</Text>
            {badge && (
              <View style={[styles.roleBadge, { backgroundColor: badge.color }]}>
                <Text style={styles.roleBadgeText}>{badge.label}</Text>
              </View>
            )}
          </View>
          {post.imageUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => {
                confirmDestructive({
                  title: 'Save image',
                  message: 'Save this image to your camera roll?',
                  confirmLabel: 'Save',
                  onConfirm: () => handleSaveImage(post.imageUrl),
                });
              }}
            >
              <Image source={{ uri: post.imageUrl }} style={styles.bubbleImage} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {post.text ? <Text style={styles.bubbleText}>{post.text}</Text> : null}
          <View style={styles.bubbleFooter}>
            <Text style={styles.bubbleTime}>{formatTime(post.createdAt)}</Text>
            {canDelete && (
              <TouchableOpacity
                onPress={() => handleDelete(post)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.bubbleDelete}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const hasDraft = !!(message.trim() || imageUri);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{channelName || 'Team Feed'}</Text>
          <Text style={styles.headerEyebrow}>
            {school?.name ? `${school.name} · Cross Country` : 'Cross Country'}
          </Text>
        </View>
        {isCoach ? (
          <TouchableOpacity onPress={() => setShowTip(t => !t)} style={styles.tipBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="information-circle-outline" size={22} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
        ) : <View style={{ width: 30 }} />}
      </View>
      {showTip && (
        <View style={styles.tipBanner}>
          <Text style={styles.tipText}>
            Coaches can delete any message. Athletes can only delete their own. Tap "Delete" on any message.
          </Text>
          <TouchableOpacity onPress={() => setShowTip(false)}>
            <Ionicons name="close" size={16} color={SIGNAL.color.mute} />
          </TouchableOpacity>
        </View>
      )}

      {/* Posts list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SIGNAL.color.indigo} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          data={listData}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          // `inverted` mis-renders on react-native-web (cells flip + mirror —
          // "upside down and backwards"). On web render a normal top-down list
          // with oldest-first data (newest at the bottom, chat-style); keep the
          // native chat-style invert.
          inverted={!isWebFeed}
          // Web chat behavior: keep the newest (bottom) in view as posts/images
          // arrive, but only when the user is already at the bottom — don't yank
          // them down while they're scrolled up reading history.
          onScroll={isWebFeed ? (e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 48;
          } : undefined}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (isWebFeed && atBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={SIGNAL.color.indigo} />
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, Platform.OS === 'web' && styles.emptyCardWeb]}>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>
                Be the first to post something to the team feed.
              </Text>
            </View>
          }
          // The "TODAY" separator sits visually above the posts. In an inverted
          // list that's the footer; in a normal (web) list it's the header.
          {...(posts.length > 0
            ? {
                [Platform.OS === 'web' ? 'ListHeaderComponent' : 'ListFooterComponent']: (
                  <View style={styles.daySeparator}>
                    <View style={styles.daySeparatorLine} />
                    <Text style={styles.daySeparatorLabel}>TODAY</Text>
                    <View style={styles.daySeparatorLine} />
                  </View>
                ),
              }
            : {})}
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
          <TouchableOpacity style={styles.imageBtn} onPress={pickImage} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="image-outline" size={24} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.composeInput}
            placeholder={`Message ${channelName || 'the team'}…`}
            placeholderTextColor={SIGNAL.color.mute2}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: hasDraft ? SIGNAL.color.indigo : SIGNAL.color.paper2 },
            ]}
            onPress={handlePost}
            disabled={!hasDraft || posting}
          >
            {posting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons
                name="arrow-up"
                size={18}
                color={hasDraft ? '#fff' : SIGNAL.color.mute2}
              />
            )}
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerEyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: 3,
  },
  tipBtn: {
    padding: 4,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tipText: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
    lineHeight: 16,
  },

  // ── List + empty state ──────────────────────────────────────────────────
  list: {
    flex: 1, // occupy only the space above the compose bar so scrollToEnd
             // lands the newest message in view, not behind the input
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
  },
  emptyCard: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    transform: [{ scaleY: -1 }], // counter the native inverted-list flip
  },
  emptyCardWeb: {
    transform: [{ scaleY: 1 }], // web list isn't inverted — no counter-flip
  },
  emptyTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.ink,
    marginBottom: 8,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  emptySub: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Day separator ───────────────────────────────────────────────────────
  daySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: SIGNAL.color.line,
  },
  daySeparatorLabel: {
    ...SIGNAL.style.eyebrow,
    color: SIGNAL.color.mute2,
  },

  // ── Bubbles ─────────────────────────────────────────────────────────────
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  bubbleRowOwn: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  bubbleOther: {
    maxWidth: '76%',
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleOwn: {
    maxWidth: '76%',
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  bubbleAuthor: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
  },
  bubbleText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14.5,
    color: SIGNAL.color.ink,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14.5,
    color: '#fff',
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  bubbleFooterOwn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  bubbleTime: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10.5,
    color: SIGNAL.color.mute2,
  },
  bubbleTimeOwn: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.7)',
  },
  bubbleDelete: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: SIGNAL.color.mute2,
    marginLeft: 10,
  },
  bubbleDeleteOwn: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  bubbleImage: {
    width: 240,
    height: 160,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Avatar (others) ─────────────────────────────────────────────────────
  postAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  postAvatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11,
  },

  // ── Role badge ──────────────────────────────────────────────────────────
  roleBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roleBadgeText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 9,
    letterSpacing: 0.4,
  },

  // ── Composer ────────────────────────────────────────────────────────────
  composeBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: bottomInset(12, 26),
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    gap: 10,
  },
  imageBtn: {
    paddingBottom: 6,
  },
  composeInput: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.ink,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  charCount: {
    textAlign: 'right',
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.amber,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: SIGNAL.color.white,
  },

  // ── Image preview chip ──────────────────────────────────────────────────
  imagePreview: {
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    padding: 10,
    alignItems: 'flex-start',
  },
  imagePreviewImg: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  imagePreviewClose: {
    position: 'absolute',
    top: 4,
    left: 74,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 11,
  },
});
