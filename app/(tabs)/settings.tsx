import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { AppBanner } from "@/components/AppBanner";
import { useAuth } from "@/lib/AuthContext";
import { useCollection } from "@/lib/CollectionContext";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, toggle, isDark } = useTheme();
  const { user, loading: authLoading, login, register, logout, deleteAccount } = useAuth();
  const { totalCards, syncCollection, collection } = useCollection();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      setUsername("");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      const parsed = msg.match(/\d+:\s*(.+)/);
      if (parsed) {
        try {
          const json = JSON.parse(parsed[1]);
          setError(json.error || parsed[1]);
        } catch {
          setError(parsed[1]);
        }
      } else {
        setError(msg);
      }
    }
    setSubmitting(false);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch {}
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all cloud data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch {}
          },
        },
      ]
    );
  };

  const handleSync = async () => {
    if (!syncCollection) return;
    setSubmitting(true);
    try {
      await syncCollection();
      Alert.alert("Synced", "Your collection has been saved to the cloud.");
    } catch {
      Alert.alert("Error", "Failed to sync collection.");
    }
    setSubmitting(false);
  };

  if (authLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppBanner />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
          showsVerticalScrollIndicator={false}
        >
        <View style={[styles.header, { paddingTop: 12 }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
            <Text style={styles.avatarText}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.usernameDisplay, { color: colors.text }]}>
            {user.username}
          </Text>
          <Text style={[styles.statsText, { color: colors.textSecondary }]}>
            {totalCards()} cards collected
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            CLOUD SYNC
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable style={styles.menuItem} onPress={handleSync} disabled={submitting}>
              <View style={[styles.menuIcon, { backgroundColor: colors.success + "18" }]}>
                <Ionicons name="cloud-upload" size={20} color={colors.success} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Save to Cloud
                </Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  Back up your collection
                </Text>
              </View>
              {submitting ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            APPEARANCE
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable style={styles.menuItem} onPress={toggle}>
              <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name={isDark ? "sunny" : "moon"} size={20} color={colors.tint} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  {isDark ? "Light Mode" : "Dark Mode"}
                </Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  Switch appearance
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ACCOUNT
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable style={styles.menuItem} onPress={handleLogout}>
              <View style={[styles.menuIcon, { backgroundColor: colors.error + "18" }]}>
                <Ionicons name="log-out" size={20} color={colors.error} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.error }]}>
                  Log Out
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
            <Pressable style={styles.menuItem} onPress={handleDeleteAccount}>
              <View style={[styles.menuIcon, { backgroundColor: colors.error + "18" }]}>
                <Ionicons name="trash" size={20} color={colors.error} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.error }]}>
                  Delete Account
                </Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  Permanently remove your data
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.authContainer, { paddingTop: 40, paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <View style={[styles.logoContainer, { backgroundColor: colors.tint }]}>
          <Ionicons name="layers" size={36} color="#FFFFFF" />
        </View>
        <Text style={[styles.authTitle, { color: colors.text }]}>
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </Text>
        <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
          {mode === "login"
            ? "Sign in to sync your collection"
            : "Sign up to save your collection to the cloud"}
        </Text>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.error + "18" }]}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formSection}>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Ionicons name="person-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Username"
              placeholderTextColor={colors.textTertiary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>
          </View>

          {mode === "register" && (
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Confirm Password"
                placeholderTextColor={colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          )}

          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.tint }, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {mode === "login" ? "Sign In" : "Create Account"}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.switchMode}
          onPress={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          <Text style={[styles.switchText, { color: colors.textSecondary }]}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <Text style={{ color: colors.tint, fontFamily: "DMSans_600SemiBold" }}>
              {mode === "login" ? "Sign Up" : "Sign In"}
            </Text>
          </Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "DMSans_700Bold",
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
  usernameDisplay: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    marginBottom: 4,
  },
  statsText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  separator: {
    height: 1,
    marginLeft: 64,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
  },
  menuHint: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    marginTop: 1,
  },
  authContainer: {
    paddingHorizontal: 28,
    alignItems: "center",
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 26,
    fontFamily: "DMSans_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: "stretch",
  },
  errorText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    flex: 1,
  },
  formSection: {
    width: "100%",
    gap: 14,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "DMSans_400Regular",
    height: "100%",
  },
  submitButton: {
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
  switchMode: {
    marginTop: 20,
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
  },
});
