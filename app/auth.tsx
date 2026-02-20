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
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { useAuth } from "@/lib/AuthContext";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { login, register, continueAsGuest } = useAuth();

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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[styles.authContainer, { paddingTop: topInset + 60, paddingBottom: bottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logoContainer, { backgroundColor: colors.tint }]}>
          <Ionicons name="layers" size={40} color="#FFFFFF" />
        </View>
        <Text style={[styles.appName, { color: colors.text }]}>CardVault</Text>
        <Text style={[styles.authTitle, { color: colors.text }]}>
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </Text>
        <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
          {mode === "login"
            ? "Sign in to access your collection"
            : "Sign up to start tracking your cards"}
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

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.cardBorder }]} />
          <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.cardBorder }]} />
        </View>

        <Pressable
          style={[styles.guestButton, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
          onPress={continueAsGuest}
        >
          <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.guestButtonText, { color: colors.text }]}>Continue as Guest</Text>
        </Pressable>
        <Text style={[styles.guestHint, { color: colors.textTertiary }]}>
          Limited to 20 cards. Create an account anytime for unlimited cards and cloud backup.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  authContainer: {
    paddingHorizontal: 28,
    alignItems: "center",
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  appName: {
    fontSize: 30,
    fontFamily: "DMSans_700Bold",
    marginBottom: 24,
  },
  authTitle: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    marginBottom: 8,
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
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
    marginTop: 24,
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
    alignSelf: "stretch",
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
  },
  guestButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
  guestHint: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});
