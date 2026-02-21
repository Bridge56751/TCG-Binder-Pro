import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/lib/ThemeContext";

export default function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Trademark & IP Notices</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          TCG Binder is an independent, unofficial collection tracking and reference application. This App is not produced, endorsed, sponsored, supported, or affiliated with any trading card game publisher, brand owner, or intellectual property holder referenced within the App.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>Pok{"\u00E9"}mon</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Pok{"\u00E9"}mon{"\u00AE"}, Pok{"\u00E9"}mon Trading Card Game{"\u00AE"}, and all related names, characters, images, artwork, logos, and trademarks are the property of The Pok{"\u00E9"}mon Company, Nintendo, Game Freak, and Creatures Inc.{"\n\n"}Pok{"\u00E9"}mon card data displayed in this App is provided by TCGdex (https://www.tcgdex.dev), an open-source, community-maintained project licensed under the MIT License.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>Yu-Gi-Oh!</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Yu-Gi-Oh!{"\u00AE"}, Yu-Gi-Oh! Trading Card Game{"\u00AE"}, and all related names, characters, images, artwork, logos, and trademarks are the property of Konami Holdings Corporation and the late Kazuki Takahashi.{"\n\n"}Yu-Gi-Oh! card data displayed in this App is provided by YGOProDeck (https://ygoprodeck.com), a community-maintained database.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>Magic: The Gathering</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Magic: The Gathering{"\u00AE"}, and all related names, characters, images, artwork, logos, and trademarks are the property of Wizards of the Coast LLC, a subsidiary of Hasbro, Inc.{"\n\n"}Magic: The Gathering card data is provided by Scryfall (https://scryfall.com). Card images are displayed in accordance with publicly available API terms and applicable fan content guidelines. This App is not approved or endorsed by Wizards of the Coast.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>One Piece Card Game</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          One Piece{"\u00AE"}, One Piece Card Game{"\u00AE"}, and all related names, characters, images, artwork, logos, and trademarks are the property of Eiichiro Oda, Bandai Co., Ltd., Shueisha Inc., Toei Animation Co., Ltd., and Viz Media, LLC.{"\n\n"}One Piece card data displayed in this App is provided by OPTCG API (https://optcgapi.com), a community-maintained database.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>General Disclaimer</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          All card names, card images, card artwork, set names, set symbols, and other game-related content displayed in this App are the intellectual property of their respective owners.{"\n\n"}TCG Binder is a collection tracking, reference, and portfolio management tool. Card images and related content are displayed solely for identification, reference, and personal collection management purposes as part of the App's functionality.{"\n\n"}This App does not claim ownership of any card images, artwork, trademarks, or other copyrighted materials. All card images are fetched dynamically from third-party API services and are not hosted, stored, modified, or redistributed by this App.{"\n\n"}No content is sold, licensed, or monetized as intellectual property. Any fees charged for use of the App relate exclusively to software features, tools, and services, not to access to copyrighted content.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        <Text style={[styles.heading, { color: colors.text }]}>Rights Holder Notice</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          If you are a rights holder and believe that your intellectual property is being referenced or displayed in a manner that constitutes infringement, please contact us at tcgbinderpro.com. We take intellectual property concerns seriously and will promptly review and address all legitimate requests.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  heading: {
    fontFamily: "DMSans_700Bold",
    fontSize: 17,
    marginBottom: 8,
  },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
});
