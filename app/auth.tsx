import React, { useState, useRef, useEffect } from "react";
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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTheme } from "@/lib/ThemeContext";
import { useAuth } from "@/lib/AuthContext";
import * as AppleAuthentication from "expo-apple-authentication";

type ScreenMode = "login" | "register" | "verify" | "forgot" | "reset";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { login, register, appleSignIn, continueAsGuest, needsVerification, verifyEmail, resendVerification, requestPasswordReset, resetPassword, clearVerification, user } = useAuth();
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
    }
  }, []);

  const [mode, setMode] = useState<ScreenMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetEmail, setResetEmail] = useState("");
  const codeRefs = useRef<(TextInput | null)[]>([]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (needsVerification && user && mode !== "verify") {
      setMode("verify");
    }
  }, [needsVerification, user]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (text: string, index: number) => {
    const newCode = [...code];
    if (text.length > 1) {
      const digits = text.replace(/\D/g, "").slice(0, 6);
      for (let i = 0; i < 6; i++) {
        newCode[i] = digits[i] || "";
      }
      setCode(newCode);
      const focusIndex = Math.min(digits.length, 5);
      codeRefs.current[focusIndex]?.focus();
      return;
    }
    newCode[index] = text.replace(/\D/g, "");
    setCode(newCode);
    if (text && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
    }
  };

  const parseError = (err: any): string => {
    const msg = err?.message || "Something went wrong";
    const parsed = msg.match(/\d+:\s*(.+)/);
    if (parsed) {
      try {
        const json = JSON.parse(parsed[1]);
        return json.error || parsed[1];
      } catch {
        return parsed[1];
      }
    }
    return msg;
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError("Apple Sign-In failed: no identity token");
        return;
      }
      setSubmitting(true);
      setError("");
      await appleSignIn(
        credential.identityToken,
        credential.fullName,
        credential.email
      );
    } catch (err: any) {
      if (err.code === "ERR_REQUEST_CANCELED") {
        return;
      }
      setError(parseError(err));
    }
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!email.trim() || !password.trim()) {
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
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
    } catch (err: any) {
      setError(parseError(err));
    }
    setSubmitting(false);
  };

  const handleVerify = async () => {
    setError("");
    setSuccess("");
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      await verifyEmail(fullCode);
      setSuccess("Email verified!");
    } catch (err: any) {
      setError(parseError(err));
    }
    setSubmitting(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setSuccess("");
    try {
      await resendVerification();
      setSuccess("New code sent to your email");
      setResendCooldown(60);
      setCode(["", "", "", "", "", ""]);
    } catch (err: any) {
      setError(parseError(err));
    }
  };

  const handleForgotSubmit = async () => {
    setError("");
    setSuccess("");
    if (!resetEmail.trim()) {
      setError("Please enter your email");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(resetEmail.trim());
      setSuccess("Check your email for a reset code");
      setMode("reset");
      setCode(["", "", "", "", "", ""]);
    } catch (err: any) {
      setError(parseError(err));
    }
    setSubmitting(false);
  };

  const handleResetSubmit = async () => {
    setError("");
    setSuccess("");
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the full 6-digit code");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(resetEmail.trim(), fullCode, newPassword);
      setSuccess("Password reset! You can now sign in.");
      setTimeout(() => {
        setMode("login");
        setSuccess("");
        setCode(["", "", "", "", "", ""]);
        setNewPassword("");
        setResetEmail("");
      }, 2000);
    } catch (err: any) {
      setError(parseError(err));
    }
    setSubmitting(false);
  };

  const renderCodeInput = () => (
    <View style={styles.codeRow}>
      {code.map((digit, i) => (
        <TextInput
          key={i}
          ref={ref => { codeRefs.current[i] = ref; }}
          style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: digit ? colors.tint : colors.cardBorder, color: colors.text }]}
          value={digit}
          onChangeText={text => handleCodeChange(text, i)}
          onKeyPress={({ nativeEvent }) => handleCodeKeyPress(nativeEvent.key, i)}
          keyboardType="number-pad"
          maxLength={Platform.OS === "web" ? 6 : 1}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          selectTextOnFocus
        />
      ))}
    </View>
  );

  if (mode === "verify") {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.authContainer, { paddingTop: topInset + 60, paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.tint + "18" }]}>
            <Ionicons name="mail-outline" size={36} color={colors.tint} />
          </View>
          <Text style={[styles.authTitle, { color: colors.text }]}>Verify Your Email</Text>
          <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
            We sent a 6-digit code to{"\n"}
            <Text style={{ fontFamily: "DMSans_600SemiBold", color: colors.text }}>{user?.email}</Text>
          </Text>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.error + "18" }]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.successBanner, { backgroundColor: "#22c55e18" }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={[styles.errorText, { color: "#22c55e" }]}>{success}</Text>
            </View>
          ) : null}

          {renderCodeInput()}

          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.tint }, submitting && styles.submitDisabled]}
            onPress={handleVerify}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Verify Email</Text>
            )}
          </Pressable>

          <Pressable style={styles.switchMode} onPress={handleResend} disabled={resendCooldown > 0}>
            <Text style={[styles.switchText, { color: colors.textSecondary }]}>
              Didn't get the code?{" "}
              <Text style={{ color: resendCooldown > 0 ? colors.textTertiary : colors.tint, fontFamily: "DMSans_600SemiBold" }}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
              </Text>
            </Text>
          </Pressable>

          <Pressable style={[styles.skipLink, { marginTop: 12 }]} onPress={clearVerification}>
            <Text style={[styles.switchText, { color: colors.textTertiary, fontSize: 13 }]}>Skip for now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === "forgot") {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.authContainer, { paddingTop: topInset + 60, paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={[styles.backButton, { top: topInset + 16 }]} onPress={() => { setMode("login"); setError(""); setSuccess(""); }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={[styles.iconCircle, { backgroundColor: colors.tint + "18" }]}>
            <Ionicons name="key-outline" size={36} color={colors.tint} />
          </View>
          <Text style={[styles.authTitle, { color: colors.text }]}>Reset Password</Text>
          <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
            Enter your email and we'll send you a code to reset your password
          </Text>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.error + "18" }]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.successBanner, { backgroundColor: "#22c55e18" }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={[styles.errorText, { color: "#22c55e" }]}>{success}</Text>
            </View>
          ) : null}

          <View style={styles.formSection}>
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Ionicons name="mail-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                value={resetEmail}
                onChangeText={setResetEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <Pressable
              style={[styles.submitButton, { backgroundColor: colors.tint }, submitting && styles.submitDisabled]}
              onPress={handleForgotSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Send Reset Code</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (mode === "reset") {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.authContainer, { paddingTop: topInset + 60, paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={[styles.backButton, { top: topInset + 16 }]} onPress={() => { setMode("forgot"); setError(""); setSuccess(""); }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={[styles.iconCircle, { backgroundColor: colors.tint + "18" }]}>
            <Ionicons name="key-outline" size={36} color={colors.tint} />
          </View>
          <Text style={[styles.authTitle, { color: colors.text }]}>Enter Reset Code</Text>
          <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
            Enter the 6-digit code sent to{"\n"}
            <Text style={{ fontFamily: "DMSans_600SemiBold", color: colors.text }}>{resetEmail}</Text>
          </Text>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.error + "18" }]}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={[styles.successBanner, { backgroundColor: "#22c55e18" }]}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={[styles.errorText, { color: "#22c55e" }]}>{success}</Text>
            </View>
          ) : null}

          {renderCodeInput()}

          <View style={[styles.formSection, { marginTop: 20 }]}>
            <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="New Password"
                placeholderTextColor={colors.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <Pressable
              style={[styles.submitButton, { backgroundColor: colors.tint }, submitting && styles.submitDisabled]}
              onPress={handleResetSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Reset Password</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
        <Image
          source={require("../assets/images/icon.png")}
          style={styles.logoImage}
          contentFit="contain"
        />
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
            <Ionicons name="mail-outline" size={20} color={colors.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Email"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
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

          {mode === "login" && (
            <Pressable style={styles.forgotLink} onPress={() => { setMode("forgot"); setError(""); }}>
              <Text style={[styles.forgotText, { color: colors.tint }]}>Forgot password?</Text>
            </Pressable>
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

        {appleAuthAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

        <Pressable
          style={[styles.guestButton, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}
          onPress={continueAsGuest}
        >
          <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.guestButtonText, { color: colors.text }]}>Continue as Guest</Text>
        </Pressable>
        <Text style={[styles.guestHint, { color: colors.textTertiary }]}>
          Limited to 20 cards. Create an account anytime for cloud backup.
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
  logoImage: {
    width: 200,
    height: 200,
    borderRadius: 44,
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontFamily: "DMSans_700Bold",
    marginBottom: 12,
  },
  authTitle: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    marginBottom: 4,
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 18,
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
  successBanner: {
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
    marginTop: 14,
    paddingVertical: 4,
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
    marginTop: 14,
    marginBottom: 14,
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
  appleButton: {
    width: "100%",
    height: 52,
    marginBottom: 12,
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
  forgotLink: {
    alignSelf: "flex-end",
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
  },
  codeRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginBottom: 24,
  },
  codeBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: "center" as const,
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    position: "absolute" as const,
    left: 28,
    zIndex: 10,
    padding: 4,
  },
  skipLink: {
    paddingVertical: 4,
  },
});
