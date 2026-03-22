import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import Colors from '@/constants/colors';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { updatePassword, isPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [newFocused, setNewFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleUpdate = async () => {
    setError(null);
    if (!newPassword || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error: updateError } = await updatePassword(newPassword);
    setLoading(false);
    if (updateError) {
      setError(updateError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    }
  };

  if (!isPasswordRecovery && !done) {
    return (
      <View style={[styles.container, styles.centeredState, { paddingTop: topPad }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.textTertiary} />
        </View>
        <Text style={styles.title}>Link Expired</Text>
        <Text style={styles.subtitle}>
          This reset link is no longer valid. Please request a new one from the sign-in screen.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.replace('/auth')}
        >
          <Text style={styles.ctaBtnText}>Back to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.container, styles.centeredState, { paddingTop: topPad }]}>
        <View style={[styles.iconWrap, { backgroundColor: Colors.accentMuted }]}>
          <Feather name="check-circle" size={40} color={Colors.accent} />
        </View>
        <Text style={styles.title}>Password Updated</Text>
        <Text style={styles.subtitle}>
          Your password has been changed successfully. You can now sign in with your new password.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.replace('/auth')}
        >
          <Text style={styles.ctaBtnText}>Back to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.iconWrap, { backgroundColor: Colors.accentMuted }]}>
            <Ionicons name="key-outline" size={40} color={Colors.accent} />
          </View>

          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password of at least 8 characters to secure your account.
          </Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.fieldLabel}>New Password</Text>
              <View style={[styles.inputWrap, newFocused && styles.inputWrapFocused]}>
                <Feather
                  name="lock"
                  size={18}
                  color={newFocused ? Colors.accent : Colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="8+ characters"
                  placeholderTextColor={Colors.textTertiary}
                  value={newPassword}
                  onChangeText={text => { setNewPassword(text); setError(null); }}
                  secureTextEntry={!newVisible}
                  autoCapitalize="none"
                  autoFocus
                  onFocus={() => setNewFocused(true)}
                  onBlur={() => setNewFocused(false)}
                />
                <Pressable onPress={() => setNewVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={newVisible ? 'eye-off' : 'eye'} size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>
              {newPassword.length > 0 && (
                <View style={styles.strengthRow}>
                  {[...Array(4)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            newPassword.length >= (i + 1) * 2
                              ? newPassword.length >= 12 ? Colors.accent : '#F59E0B'
                              : Colors.border,
                        },
                      ]}
                    />
                  ))}
                  <Text style={styles.strengthLabel}>
                    {newPassword.length < 8 ? 'Too short' : newPassword.length < 12 ? 'Fair' : 'Strong'}
                  </Text>
                </View>
              )}
            </View>

            <View>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <View style={[styles.inputWrap, confirmFocused && styles.inputWrapFocused]}>
                <Feather
                  name="lock"
                  size={18}
                  color={confirmFocused ? Colors.accent : Colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Repeat your password"
                  placeholderTextColor={Colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={text => { setConfirmPassword(text); setError(null); }}
                  secureTextEntry={!confirmVisible}
                  autoCapitalize="none"
                  onFocus={() => setConfirmFocused(true)}
                  onBlur={() => setConfirmFocused(false)}
                />
                <Pressable onPress={() => setConfirmVisible(v => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Feather name={confirmVisible ? 'eye-off' : 'eye'} size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <Text style={styles.mismatchHint}>Passwords do not match</Text>
              )}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.updateBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                loading && { opacity: 0.7 },
              ]}
              onPress={handleUpdate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.background} size="small" />
              ) : (
                <Text style={styles.updateBtnText}>Update Password</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centeredState: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  fieldLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 54,
  },
  inputWrapFocused: {
    borderColor: Colors.accent,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
  },
  eyeBtn: {
    paddingLeft: 8,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textTertiary,
    marginLeft: 4,
    minWidth: 48,
  },
  mismatchHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.danger,
    marginTop: 6,
    marginLeft: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dangerMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.danger,
    flex: 1,
  },
  updateBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  updateBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.background,
  },
  ctaBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.background,
  },
});
