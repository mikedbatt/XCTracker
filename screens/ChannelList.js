import { Ionicons } from '@expo/vector-icons';
import {
  collection, doc, getDoc, getDocs, query, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
} from '../constants/design';
import TeamFeed from './TeamFeed';

const CHANNEL_META = {
  whole_team: { name: 'Whole Team', icon: 'people', color: SIGNAL.color.indigo },
  boys:       { name: 'Boys', icon: 'walk', color: SIGNAL.color.cyan },
  girls:      { name: 'Girls', icon: 'walk', color: SIGNAL.color.pink },
  parents:    { name: 'Parents', icon: 'people-circle', color: SIGNAL.color.violet },
  coaches:    { name: 'Coaches', icon: 'shield', color: SIGNAL.color.amber },
};

function getChannelMeta(channelKey) {
  if (CHANNEL_META[channelKey]) return CHANNEL_META[channelKey];
  // Training group channels: "group_GROUPID"
  return { name: channelKey, icon: 'fitness', color: SIGNAL.color.indigo };
}

export default function ChannelList({ userData, school, groups, athletes, onClose, onUnreadChange, embedded = false }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState(null);

  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';
  const isParent = userData.role === 'parent';
  const primaryColor = school?.primaryColor || SIGNAL.color.indigo;

  useEffect(() => {
    buildChannels();
  }, []);

  const buildChannels = async () => {
    setLoading(true);

    // Determine which channels this user belongs to
    const myChannels = [];

    if (isParent) {
      myChannels.push({ key: 'parents', ...CHANNEL_META.parents });
    } else if (isCoach) {
      // Coaches see all channels
      myChannels.push({ key: 'whole_team', ...CHANNEL_META.whole_team });

      // Training group channels
      const loadedGroups = groups || [];
      for (const g of loadedGroups) {
        myChannels.push({ key: `group_${g.id}`, name: g.name, icon: 'fitness', color: primaryColor });
      }

      myChannels.push({ key: 'boys', ...CHANNEL_META.boys });
      myChannels.push({ key: 'girls', ...CHANNEL_META.girls });
      myChannels.push({ key: 'parents', ...CHANNEL_META.parents });
      myChannels.push({ key: 'coaches', ...CHANNEL_META.coaches });
    } else {
      // Athlete
      myChannels.push({ key: 'whole_team', ...CHANNEL_META.whole_team });

      // Their training group
      if (userData.groupId) {
        let loadedGroups = groups || [];
        let myGroup = loadedGroups.find(g => g.id === userData.groupId);
        // If groups weren't passed (athlete dashboard), load the group doc directly
        if (!myGroup) {
          try {
            const gDoc = await getDoc(doc(db, 'groups', userData.groupId));
            if (gDoc.exists()) myGroup = { id: gDoc.id, ...gDoc.data() };
          } catch {}
        }
        if (myGroup) {
          myChannels.push({ key: `group_${myGroup.id}`, name: myGroup.name, icon: 'fitness', color: primaryColor });
        }
      }

      // Gender group
      if (userData.gender === 'boys') {
        myChannels.push({ key: 'boys', ...CHANNEL_META.boys });
      } else if (userData.gender === 'girls') {
        myChannels.push({ key: 'girls', ...CHANNEL_META.girls });
      }
    }

    // Load latest post + unread count for each channel
    try {
      // Fetch user's lastSeenChannels
      const freshUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const lastSeenChannels = freshUserDoc.data()?.lastSeenChannels || {};
      // Backward compat: use lastSeenFeed for whole_team if no channel-specific timestamp
      const lastSeenFeed = freshUserDoc.data()?.lastSeenFeed;
      if (!lastSeenChannels.whole_team && lastSeenFeed) {
        lastSeenChannels.whole_team = lastSeenFeed;
      }

      // Fetch all posts for this school
      const postsSnap = await getDocs(query(
        collection(db, 'teamPosts'),
        where('schoolId', '==', userData.schoolId)
      ));
      const allPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Compute per-channel data
      const enriched = myChannels.map(ch => {
        // Filter posts for this channel (backward compat: no channel field = whole_team)
        const channelPosts = allPosts.filter(p => {
          const postChannel = p.channel || 'whole_team';
          return postChannel === ch.key;
        });

        // Sort by createdAt desc
        channelPosts.sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return bTime - aTime;
        });

        const lastPost = channelPosts[0] || null;
        const lastPostTime = lastPost?.createdAt?.toDate ? lastPost.createdAt.toDate() : (lastPost?.createdAt ? new Date(lastPost.createdAt) : null);

        // Unread count
        const lastSeen = lastSeenChannels[ch.key];
        const lastSeenDate = lastSeen ? (lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen)) : new Date(0);
        const myUid = auth.currentUser?.uid;
        const unread = channelPosts.filter(p => {
          if (p.authorId === myUid) return false;
          const ts = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
          return ts > lastSeenDate;
        }).length;

        return {
          ...ch,
          lastPost,
          lastPostTime,
          unread,
          postCount: channelPosts.length,
        };
      });

      setChannels(enriched);
      if (onUnreadChange) onUnreadChange(enriched.reduce((s, ch) => s + (ch.unread || 0), 0));
    } catch (e) {
      console.warn('Failed to build channels:', e);
      setChannels(myChannels.map(ch => ({ ...ch, lastPost: null, unread: 0, postCount: 0 })));
      if (onUnreadChange) onUnreadChange(0);
    }

    setLoading(false);
  };

  const formatTime = (date) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // If a channel is selected, show the TeamFeed for that channel
  if (selectedChannel) {
    return (
      <TeamFeed
        userData={userData}
        school={school}
        channel={selectedChannel.key}
        channelName={selectedChannel.name}
        onClose={() => { setSelectedChannel(null); buildChannels(); }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={SIGNAL.color.ink} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Feed</Text>
          <View style={{ width: 60 }} />
        </View>
      )}
      {embedded && (
        <View style={styles.embeddedHeader}>
          <Text style={styles.eyebrow}>Channels</Text>
          <Text style={styles.headerTitle}>Feed</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SIGNAL.color.indigo} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.listCard}>
            {channels.map((ch, idx) => (
              <TouchableOpacity
                key={ch.key}
                style={[styles.channelRow, idx < channels.length - 1 && styles.channelRowDivider]}
                activeOpacity={0.6}
                onPress={() => setSelectedChannel(ch)}
              >
                <View style={[styles.channelIcon, { backgroundColor: ch.color + SIGNAL.tint.chip }]}>
                  <Ionicons name={ch.icon} size={20} color={ch.color} />
                </View>
                <View style={styles.channelInfo}>
                  <View style={styles.channelTopRow}>
                    <Text style={styles.channelName} numberOfLines={1}>{ch.name}</Text>
                    {ch.lastPostTime && (
                      <Text style={[styles.channelTime, ch.unread > 0 && styles.channelTimeUnread]}>{formatTime(ch.lastPostTime)}</Text>
                    )}
                  </View>
                  <View style={styles.channelBottomRow}>
                    {ch.lastPost ? (
                      <Text style={[styles.channelPreview, ch.unread > 0 && styles.channelPreviewUnread]} numberOfLines={1}>
                        {ch.lastPost.authorName?.split(' ')[0]}: {ch.lastPost.text}
                      </Text>
                    ) : (
                      <Text style={styles.channelPreviewEmpty} numberOfLines={1}>No messages yet</Text>
                    )}
                    {ch.unread > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{ch.unread > 99 ? '99+' : ch.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  embeddedHeader: {
    paddingTop: SIGNAL.space[6],
    paddingBottom: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space.screen,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[2],
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: SIGNAL.space[2],
    minWidth: 60,
  },
  backText: {
    color: SIGNAL.color.ink,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerTitle: {
    fontSize: SIGNAL.size.title,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space.screen,
  },
  listCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    overflow: 'hidden',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.card,
    gap: SIGNAL.space[4],
  },
  channelRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelInfo: {
    flex: 1,
    minWidth: 0,
  },
  channelTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    gap: SIGNAL.space[2],
  },
  channelBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIGNAL.space[2],
  },
  channelName: {
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    flexShrink: 1,
  },
  channelTime: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
  },
  channelTimeUnread: {
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  channelPreview: {
    flex: 1,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 18,
  },
  channelPreviewUnread: {
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
  },
  channelPreviewEmpty: {
    flex: 1,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute2,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 18,
  },
  unreadBadge: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.chip,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
});
