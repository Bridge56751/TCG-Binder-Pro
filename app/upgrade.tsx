import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { router } from "expo-router";
import { useAuth } from "@/lib/AuthContext";
import { usePurchase } from "@/lib/PurchaseContext";
import { useCollection, FREE_CARD_LIMIT } from "@/lib/CollectionContext";

const FEATURES = [
  { icon: "infinite" as const, title: "Unlimited Cards", desc: "No more 20-card limit" },
  { icon: "scan" as const, title: "Unlimited Scanning", desc: "Scan as many cards as you want" },
  { icon: "cloud-upload" as const, title: "Cloud Backup", desc: "Sync across all your devices" },
  { icon: "shield-checkmark" as const, title: "Priority Support", desc: "Get help when you need it" },
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
          Go unlimited with a one-time purchase.
        </Text>
      </View>

      <View style={styles.featuresSection}>
        {FEATURES.map((f, i) => (
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

      <View style={[styles.ctaSection, { paddingBottom: bottomInset + 16 }]}>
        {!user && isGuest && (
          <Text style={[styles.guestNote, { color: colors.textSecondary }]}>
            You'll need to create an account first
          </Text>
        )}
        <Pressable
          style={[styles.purchaseBtn, { backgroundColor: colors.tint }]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.purchaseBtnText}>
                {!user && isGuest ? "Create Account to Unlock" : "Unlock Premium - $2.99"}
              </Text>
              <Text style={styles.purchaseBtnSub}>One-time purchase</Text>
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
  guestNote: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    textAlign: "center",
    marginBottom: 10,
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
});
