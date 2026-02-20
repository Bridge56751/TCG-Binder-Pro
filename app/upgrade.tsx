import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { router } from "expo-router";
import { useAuth } from "@/lib/AuthContext";
import { usePurchase } from "@/lib/PurchaseContext";
import { useCollection, FREE_CARD_LIMIT } from "@/lib/CollectionContext";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/lib/legal-urls";

const PREMIUM_FEATURES = [
  { icon: "infinite" as const, title: "Unlimited Cards", desc: "No more 20-card limit" },
  { icon: "scan" as const, title: "Unlimited Scanning", desc: "Scan as many cards as you want" },
  { icon: "shield-checkmark" as const, title: "Priority Support", desc: "Get help when you need it" },
];

const FREE_ACCOUNT_FEATURES = [
  { icon: "cloud-upload" as const, title: "Cloud Backup", desc: "Sync your collection across devices" },
  { icon: "person" as const, title: "Save Your Progress", desc: "Keep your collection safe with an account" },
];

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, isGuest } = useAuth();
  const { isPremium, purchasePremium, restorePurchases } = usePurchase();
  const { totalCards } = useCollection();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handlePurchase = async () => {
    if (!user && isGuest) {
      router.push("/auth");
      return;
    }
    setPurchasing(true);
    try {
      const success = await purchasePremium();
      if (success) {
        router.back();
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        router.back();
      }
    } finally {
      setRestoring(false);
    }
  };

  if (isPremium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <View style={styles.closeRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.premiumActive}>
          <View style={[styles.premiumBadge, { backgroundColor: colors.tint + "18" }]}>
            <Ionicons name="star" size={40} color={colors.tint} />
          </View>
          <Text style={[styles.premiumTitle, { color: colors.text }]}>You're Premium</Text>
          <Text style={[styles.premiumDesc, { color: colors.textSecondary }]}>
            You have unlimited access to all features. Thanks for your support!
          </Text>
        </View>
      </View>
    );
  }

  const needsAccount = !user && isGuest;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <View style={styles.closeRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.heroSection}>
        <View style={[styles.heroBadge, { backgroundColor: colors.tint + "14" }]}>
          <Ionicons name="star" size={48} color={colors.tint} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Unlock Premium</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          You've used {totalCards()} of {FREE_CARD_LIMIT} free cards.{"\n"}
          Go unlimited for just $2.99/month.
        </Text>
      </View>

      <View style={styles.featuresSection}>
        <Text style={[styles.sectionLabel, { color: colors.tint }]}>PREMIUM - $2.99/MONTH</Text>
        {PREMIUM_FEATURES.map((f, i) => (
          <View key={i} style={[styles.featureRow, { borderColor: colors.cardBorder }]}>
            <View style={[styles.featureIcon, { backgroundColor: colors.tint + "14" }]}>
              <Ionicons name={f.icon} size={22} color={colors.tint} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: colors.text }]}>{f.title}</Text>
              <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.tint} />
          </View>
        ))}
      </View>

      {needsAccount && (
        <View style={styles.featuresSection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>FREE ACCOUNT</Text>
          {FREE_ACCOUNT_FEATURES.map((f, i) => (
            <View key={i} style={[styles.featureRow, { borderColor: colors.cardBorder }]}>
              <View style={[styles.featureIcon, { backgroundColor: colors.textSecondary + "14" }]}>
                <Ionicons name={f.icon} size={22} color={colors.textSecondary} />
              </View>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.textSecondary} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.ctaSection, { paddingBottom: bottomInset + 16 }]}>
        {needsAccount ? (
          <>
            <View style={[styles.stepIndicator, { backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }]}>
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.tint }]}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.text }]}>Create a free account</Text>
              </View>
              <View style={[styles.stepDivider, { backgroundColor: colors.cardBorder }]} />
              <View style={styles.stepRow}>
                <View style={[styles.stepBadge, { backgroundColor: colors.textTertiary }]}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.textSecondary }]}>Subscribe to Premium for $2.99/mo</Text>
              </View>
            </View>

            <Pressable
              style={[styles.purchaseBtn, { backgroundColor: colors.tint }]}
              onPress={() => router.push("/auth")}
            >
              <Text style={styles.purchaseBtnText}>Create Free Account</Text>
              <Text style={styles.purchaseBtnSub}>Then upgrade to Premium</Text>
            </Pressable>

            <Pressable
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.restoreBtnText, { color: colors.textSecondary }]}>
                  Restore Purchase
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.purchaseBtn, { backgroundColor: colors.tint }]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.purchaseBtnText}>Unlock Premium - $2.99/mo</Text>
                  <Text style={styles.purchaseBtnSub}>Monthly subscription</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.restoreBtnText, { color: colors.textSecondary }]}>
                  Restore Purchase
                </Text>
              )}
            </Pressable>
          </>
        )}

        <Text style={[styles.legalLinks, { color: colors.textTertiary }]}>
          <Text style={{ color: colors.textSecondary }} onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>Terms of Service (EULA)</Text>
          {"  |  "}
          <Text style={{ color: colors.textSecondary }} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroSection: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 28,
  },
  heroBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: "DMSans_700Bold",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  featuresSection: {
    paddingHorizontal: 20,
    gap: 1,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 14,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    marginTop: 1,
  },
  ctaSection: {
    marginTop: "auto",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  stepIndicator: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumber: {
    fontSize: 13,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
  stepText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
  },
  stepDivider: {
    width: 1,
    height: 12,
    marginLeft: 12,
    marginVertical: 4,
  },
  purchaseBtn: {
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  purchaseBtnText: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
  purchaseBtnSub: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  restoreBtn: {
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  restoreBtnText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
  },
  premiumActive: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  premiumBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  premiumTitle: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    marginBottom: 8,
  },
  premiumDesc: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  legalLinks: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    marginTop: 12,
  },
});
