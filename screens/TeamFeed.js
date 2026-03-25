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
    where,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';

import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView, Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE } from '../constants/design';

export default function TeamFeed({ userData, school, onClose }) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [message,     setMessage]     = useState('');
  const [posting,     setPosting]     = useState(false);
  const inputRef = useRef(null);

  const primaryColor = school?.primaryColor || BRAND;
  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';
  const myUid   = auth.currentUser?.uid;

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userData.schoolId) return;
    const q = query(
      collection(db, 'teamPosts'),
      where('schoolId', '==', userData.schoolId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      console.log('TeamFeed listener:', err);
      // Fall back to one-time fetch if listener fails (index not ready)
      loadPosts();
    });
    return () => unsub();
  }, []);

  const loadPosts = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'teamPosts'),
        where('schoolId', '==', userData.schoolId),
        orderBy('createdAt', 'desc'),
        limit(100)
      ));
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.log('Load posts:', e); }
    setLoading(false);
    setRefreshing(false);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const handlePost = async () => {
    const text = message.trim();
    if (!text) return;
    if (text.length > 500) {
      Alert.alert('Too long', 'Messages are limited to 500 characters.');
      return;
    }
    setPosting(true);
    try {
      await addDoc(collection(db, 'teamPosts'), {
        schoolId:    userData.schoolId,
        text,
        authorId:    myUid,
        authorName:  `${userData.firstName} ${userData.lastName}`,
        authorRole:  userData.role,
        createdAt:   serverTimestamp(),
      });
      setMessage('');
      inputRef.current?.blur();
    } catch (e) {
      Alert.alert('Error', 'Could not post. Please try again.');
    }
    setPosting(false);
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
      <View style={[styles.postCard, isOwn && { borderLeftColor: primaryColor, borderLeftWidth: 3 }]}>
        <View style={styles.postHeader}>
          <View style={[styles.postAvatar, { backgroundColor: isOwn ? primaryColor : badge ? badge.color : '#888' }]}>
            <Text style={styles.postAvatarText}>{initials}</Text>
          </View>
          <View style={styles.postMeta}>
            <View style={styles.postNameRow}>
              <Text style={[styles.postAuthor, isOwn && { color: primaryColor }]}>
                {isOwn ? 'You' : post.authorName}
              </Text>
              {badge && (
                <View style={[styles.roleBadge, { backgroundColor: badge.color }]}>
                  <Text style={styles.roleBadgeText}>{badge.label}</Text>
                </View>
              )}
            </View>
            <Text style={styles.postTime}>{formatTime(post.createdAt)}</Text>
          </View>
          {canDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(post)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.postText}>{post.text}</Text>
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
          <Text style={styles.headerTitle}>Team Feed</Text>
          <Text style={styles.headerSub}>{school?.name}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

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
          ListHeaderComponent={
            isCoach ? (
              <View style={styles.moderationNote}>
                <Text style={styles.moderationText}>
                  As coach you can delete any post. Athletes can only delete their own.
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Compose bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.composeBar}>
          <View style={[styles.composeAvatar, { backgroundColor: primaryColor }]}>
            <Text style={styles.composeAvatarText}>
              {userData.firstName?.[0]}{userData.lastName?.[0]}
            </Text>
          </View>
          <TextInput
            ref={inputRef}
            style={styles.composeInput}
            placeholder="Post to the team..."
            placeholderTextColor="#999"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.postBtn,
              { backgroundColor: message.trim() ? primaryColor : '#e0e0e0' }
            ]}
            onPress={handlePost}
            disabled={!message.trim() || posting}
          >
            {posting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.postBtnText, { color: message.trim() ? '#fff' : '#bbb' }]}>Post</Text>
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
  listContent:       { padding: 16, paddingBottom: 8 },
  moderationNote:    { backgroundColor: '#fff3e0', borderRadius: 10, padding: 10, marginBottom: 12 },
  moderationText:    { fontSize: 12, color: '#e65100', textAlign: 'center' },
  emptyCard:         { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle:        { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySub:          { fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 20 },
  postCard:          { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
  postHeader:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  postAvatar:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  postAvatarText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  postMeta:          { flex: 1 },
  postNameRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  postAuthor:        { fontSize: 15, fontWeight: '700', color: '#333' },
  roleBadge:         { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeText:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  postTime:          { fontSize: 12, color: '#bbb', marginTop: 2 },
  deleteBtn:         { padding: 4 },
  deleteBtnText:     { fontSize: 16, color: '#ccc', fontWeight: '600' },
  postText:          { fontSize: 15, color: '#333', lineHeight: 22 },
  composeBar:        { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  composeAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2 },
  composeAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  composeInput:      { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#333', maxHeight: 100, borderWidth: 1, borderColor: '#e0e0e0' },
  postBtn:           { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 2 },
  postBtnText:       { fontSize: 14, fontWeight: '700' },
  charCount:         { textAlign: 'right', fontSize: 11, color: '#f59e0b', paddingHorizontal: 16, paddingBottom: 4, backgroundColor: '#fff' },
});