import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/lib/ThemeContext";
import { router } from "expo-router";
import { useAuth } from "@/lib/AuthContext";
import { usePurchase } from "@/lib/PurchaseContext";
import { useCollection, FREE_CARD_LIMIT, GUEST_CARD_LIMIT } from "@/lib/CollectionContext";
import { GAMES } from "@/lib/types";
import type { GameId } from "@/lib/types";

const GAME_ICONS: Record<GameId, keyof typeof MaterialCommunityIcons.glyphMap> = {
  pokemon: "pokeball",
  yugioh: "cards",
  onepiece: "sail-boat",
  mtg: "magic-staff",
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, toggle, isDark } = useTheme();
  const { user, isGuest, logout, deleteAccount } = useAuth();
  const { isPremium, restorePurchases } = usePurchase();
  const { totalCards, syncCollection, syncStatus, lastSyncTime, enabledGames, toggleGame, isAtGuestLimit } = useCollection();

  const [submitting, setSubmitting] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<"logout" | "delete" | null>(null);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleLogout = () => {
    setConfirmingAction("logout");
  };

  const handleDeleteAccount = () => {
    setConfirmingAction("delete");
  };

  const executeConfirmedAction = async () => {
    const action = confirmingAction;
    setConfirmingAction(null);
    if (action === "logout") {
      try {
        await logout();
      } catch {}
    } else if (action === "delete") {
      try {
        await deleteAccount();
      } catch {}
    }
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

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>

        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: isGuest && !user ? colors.textTertiary : colors.tint }]}>
            <Text style={styles.avatarText}>
              {user ? user.username.charAt(0).toUpperCase() : "G"}
            </Text>
          </View>
          <Text style={[styles.usernameDisplay, { color: colors.text }]}>
            {user ? user.username : "Guest"}
          </Text>
          <Text style={[styles.statsText, { color: colors.textSecondary }]}>
            {isPremium
              ? `${totalCards()} cards collected`
              : `${totalCards()} / ${FREE_CARD_LIMIT} cards (free limit)`}
          </Text>
          {isPremium && (
            <View style={[styles.premiumBadge, { backgroundColor: colors.tint + "18" }]}>
              <Ionicons name="star" size={12} color={colors.tint} />
              <Text style={[styles.premiumBadgeText, { color: colors.tint }]}>Premium</Text>
            </View>
          )}
        </View>

        {!isPremium && (
          <View style={styles.section}>
            <View style={[styles.upgradeCard, { backgroundColor: colors.tint + "12", borderColor: colors.tint + "30" }]}>
              <Ionicons name="star" size={22} color={colors.tint} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>Unlock Premium</Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  Unlimited cards, cloud backup, and more for $2.99
                </Text>
              </View>
              <Pressable
                style={[styles.upgradeBtn, { backgroundColor: colors.tint }]}
                onPress={() => router.push("/upgrade")}
              >
                <Text style={styles.upgradeBtnText}>Upgrade</Text>
              </Pressable>
            </View>
          </View>
        )}

        {user && (
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
                    {syncStatus === "syncing"
                      ? "Syncing..."
                      : syncStatus === "error"
                      ? "Sync failed - tap to retry"
                      : syncStatus === "success"
                      ? "Just synced"
                      : lastSyncTime
                      ? `Last synced ${formatTimeAgo(lastSyncTime)}`
                      : "Back up your collection"}
                  </Text>
                </View>
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : syncStatus === "syncing" ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : syncStatus === "error" ? (
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                ) : syncStatus === "success" ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                )}
              </Pressable>
            </View>
          </View>
        )}

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
            CARD GAMES
          </Text>
          <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>
            Choose which games to show in your collection
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            {GAMES.map((game, index) => {
              const isEnabled = enabledGames.includes(game.id);
              const isLast = enabledGames.length <= 1 && isEnabled;
              return (
                <React.Fragment key={game.id}>
                  {index > 0 && <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />}
                  <View style={styles.menuItem}>
                    <View style={[styles.menuIcon, { backgroundColor: game.color + "18" }]}>
                      <MaterialCommunityIcons name={GAME_ICONS[game.id]} size={20} color={game.color} />
                    </View>
                    <View style={styles.menuContent}>
                      <Text style={[styles.menuLabel, { color: colors.text }]}>{game.name}</Text>
                    </View>
                    <Switch
                      value={isEnabled}
                      onValueChange={() => {
                        if (isLast) {
                          Alert.alert("Can't Disable", "You need at least one game enabled.");
                        } else {
                          toggleGame(game.id);
                        }
                      }}
                      trackColor={{ false: colors.surfaceAlt, true: game.color + "80" }}
                      thumbColor={isEnabled ? game.color : colors.textTertiary}
                    />
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            SUPPORT
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable style={styles.menuItem} onPress={() => Linking.openURL("mailto:protcgbinder@gmail.com")}>
              <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name="mail" size={20} color={colors.tint} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Contact Support
                </Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  protcgbinder@gmail.com
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
            <Pressable style={styles.menuItem} onPress={() => Linking.openURL("https://example.com")}>
              <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name="globe-outline" size={20} color={colors.tint} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Website
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
            <Pressable style={styles.menuItem} onPress={() => Linking.openURL("https://example.com/privacy")}>
              <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.tint} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Privacy Policy
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            PURCHASES
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable style={styles.menuItem} onPress={async () => {
              setSubmitting(true);
              try { await restorePurchases(); } finally { setSubmitting(false); }
            }} disabled={submitting}>
              <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                <Ionicons name="receipt-outline" size={20} color={colors.tint} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Restore Purchases
                </Text>
                <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                  Recover previous purchases
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

        {user ? (
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
        ) : isGuest ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              ACCOUNT
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <Pressable style={styles.menuItem} onPress={() => router.push("/auth")}>
                <View style={[styles.menuIcon, { backgroundColor: colors.tint + "18" }]}>
                  <Ionicons name="person-add" size={20} color={colors.tint} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    Create Account
                  </Text>
                  <Text style={[styles.menuHint, { color: colors.textSecondary }]}>
                    Unlimited cards and cloud backup
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
              <View style={[styles.separator, { backgroundColor: colors.cardBorder }]} />
              <Pressable style={styles.menuItem} onPress={handleLogout}>
                <View style={[styles.menuIcon, { backgroundColor: colors.error + "18" }]}>
                  <Ionicons name="log-out" size={20} color={colors.error} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuLabel, { color: colors.error }]}>
                    Sign Out
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {confirmingAction && (
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {confirmingAction === "logout" ? "Log Out" : "Delete Account"}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              {confirmingAction === "logout"
                ? "Are you sure you want to log out?"
                : "This will permanently delete your account and all cloud data. This cannot be undone."}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.surfaceAlt }]}
                onPress={() => setConfirmingAction(null)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.error }]}
                onPress={executeConfirmedAction}
              >
                <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>
                  {confirmingAction === "logout" ? "Log Out" : "Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  premiumBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
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
  sectionHint: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    marginBottom: 10,
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
  upgradeCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  upgradeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  upgradeBtnText: {
    fontSize: 14,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
  modalOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modalCard: {
    width: "85%" as any,
    borderRadius: 16,
    padding: 24,
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    marginBottom: 8,
    textAlign: "center" as const,
  },
  modalMessage: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    lineHeight: 22,
    textAlign: "center" as const,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row" as const,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  modalButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
});
