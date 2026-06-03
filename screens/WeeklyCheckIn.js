import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SIGNAL } from '../constants/design';

const MESSAGE_MAX = 500;

function formatReplyDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WeeklyCheckIn({
  visible,
  existingCheckin,        // null if no doc yet this week; object if athlete already submitted
  onSubmit,               // (messageText) => void — only called when no coachReply yet
  onMarkReplyRead,        // () => void — called on close when an unread reply exists
  onViewHistory,          // () => void — open past check-ins modal (athlete view)
  onClose,
}) {
  const coachReply = existingCheckin?.coachReply || null;
  const hasUnreadReply = coachReply && !existingCheckin?.athleteViewedReplyAt;
  const isLocked = !!coachReply;  // can't edit message after coach has replied

  const [message, setMessage] = useState(existingCheckin?.message || '');
  const [submitting, setSubmitting] = useState(false);

  // Sync message when modal opens or the underlying doc changes
  useEffect(() => {
    setMessage(existingCheckin?.message || '');
  }, [existingCheckin?.id, visible]);

  const canSubmit = !isLocked && message.trim().length > 0 && !submitting;

  const handleClose = () => {
    if (hasUnreadReply && onMarkReplyRead) onMarkReplyRead();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(message.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Weekly check-in</Text>
            <Text style={styles.title}>
              {coachReply ? "Coach's reply" : 'How was your week?'}
            </Text>
            <Text style={styles.subtitle}>
              {coachReply
                ? 'Read what your coach sent back.'
                : "Share anything you'd like your coach to know — training, school, life, all of it."}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Athlete's message — input if unlocked, read-only block if locked */}
          <Text style={styles.fieldLabel}>Your message</Text>
          {isLocked ? (
            <View style={styles.readBlock}>
              <Text style={styles.readBlockText}>
                {existingCheckin.message || '(no message)'}
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={message}
                onChangeText={t => setMessage(t.slice(0, MESSAGE_MAX))}
                placeholder="Tell coach how things are going…"
                placeholderTextColor={SIGNAL.color.mute2}
                multiline
                maxLength={MESSAGE_MAX}
                textAlignVertical="top"
              />
              <Text style={styles.counter}>{message.length} / {MESSAGE_MAX}</Text>
            </>
          )}

          {/* Coach's reply — only shown when present */}
          {coachReply && (
            <>
              <View style={styles.divider} />
              <View style={styles.replyHeader}>
                <Ionicons name="chatbubble-ellipses" size={14} color={SIGNAL.color.indigo} />
                <Text style={styles.replyHeaderText}>
                  {coachReply.repliedByName || 'Coach'}
                  {coachReply.repliedAt ? ` · ${formatReplyDate(coachReply.repliedAt)}` : ''}
                </Text>
              </View>
              <View style={styles.replyBlock}>
                <Text style={styles.replyText}>{coachReply.text}</Text>
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {isLocked ? (
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Got it</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.doneBtn, !canSubmit && styles.doneBtnDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                <Text style={[styles.doneBtnText, !canSubmit && styles.doneBtnTextDisabled]}>
                  {submitting ? 'Sending…' : (existingCheckin ? 'Update' : 'Send to coach')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipBtn} onPress={handleClose}>
                <Text style={styles.skipBtnText}>
                  {existingCheckin ? 'Close' : 'Not this week'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {onViewHistory && (
            <TouchableOpacity
              style={styles.historyLink}
              onPress={() => { handleClose(); setTimeout(onViewHistory, 250); }}
            >
              <Ionicons name="time-outline" size={13} color={SIGNAL.color.indigo} />
              <Text style={styles.historyLinkText}>View past check-ins</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 18,
    paddingHorizontal: 22,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 6,
  },
  title: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  subtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    marginTop: 4,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
    marginTop: 2,
  },

  // Body
  scrollBody: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 24 },

  fieldLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    marginTop: 6,
    marginBottom: 10,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  input: {
    minHeight: 140,
    padding: 14,
    borderRadius: 12,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 22,
  },
  counter: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute2,
    textAlign: 'right',
    marginTop: 6,
  },

  readBlock: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  readBlockText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 22,
  },

  divider: {
    height: 1,
    backgroundColor: SIGNAL.color.line,
    marginTop: 22,
    marginBottom: 16,
  },

  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  replyHeaderText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12.5,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  replyBlock: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: `${SIGNAL.color.indigo}10`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}30`,
  },
  replyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 22,
  },

  // Footer
  footer: {
    padding: 18,
    paddingBottom: 28,
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  doneBtn: {
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.indigo,
  },
  doneBtnDisabled: {
    backgroundColor: SIGNAL.color.line,
  },
  doneBtnText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 16,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  doneBtnTextDisabled: {
    color: SIGNAL.color.mute2,
  },
  skipBtn: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 2,
  },
  skipBtnText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
  },
  historyLinkText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12.5,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
