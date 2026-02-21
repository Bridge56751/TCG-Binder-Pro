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

  const lastUpdated = "February 21, 2026";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy & Legal</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: colors.textSecondary }]}>
          Last updated: {lastUpdated}
        </Text>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Privacy Policy</Text>

          <Text style={[styles.heading, { color: colors.text }]}>Information We Collect</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            When you create an account, we collect your email address and an encrypted version of your password. We never store your password in plain text.{"\n\n"}
            When you use the app, we store your card collection data (which cards you own and their quantities) to enable cloud sync across your devices. If you use the app as a guest, your collection data is stored only on your device.{"\n\n"}
            We do not collect your location, contacts, photos (camera images used for card scanning are processed in real-time and never stored), or any other personal information beyond what is listed above.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>How We Use Your Information</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Your email address is used for account authentication, email verification, and password reset functionality. Your collection data is used solely to provide the collection tracking and cloud sync features of the app.{"\n\n"}
            We do not sell, trade, rent, or share your personal information with any third parties for marketing or advertising purposes. We do not serve ads in this app.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Data Storage & Security</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Your account data is stored in a secured PostgreSQL database. Passwords are hashed using industry-standard encryption (bcrypt). We use HTTPS for all data transmission between the app and our servers.{"\n\n"}
            Collection data stored locally on your device uses AsyncStorage and remains on your device unless you choose to sync it to the cloud.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Third-Party Services</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            This app uses the following third-party services to provide card data and images:{"\n\n"}
            {"\u2022"} TCGdex (tcgdex.dev) — Pokemon card data and images{"\n"}
            {"\u2022"} YGOProDeck (ygoprodeck.com) — Yu-Gi-Oh! card data and images{"\n"}
            {"\u2022"} Scryfall (scryfall.com) — Magic: The Gathering card data and images{"\n"}
            {"\u2022"} OPTCG API (optcgapi.com) — One Piece TCG card data and images{"\n"}
            {"\u2022"} OpenAI — AI-powered card identification from camera images{"\n"}
            {"\u2022"} RevenueCat — Subscription and in-app purchase management{"\n"}
            {"\u2022"} Resend — Transactional email delivery (verification and password reset emails){"\n\n"}
            Each of these services has its own privacy policy governing their handling of data. Card data and images are fetched in real-time from these services and cached locally on your device for offline access.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Data Deletion</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            You may delete your account at any time from the Settings screen. When you delete your account, all associated data (email, encrypted password, and cloud-synced collection data) is permanently removed from our servers. Locally stored data on your device can be removed by uninstalling the app.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Children's Privacy</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            This app is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us so we can remove it.
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>2. Terms of Use</Text>

          <Text style={[styles.heading, { color: colors.text }]}>Acceptance of Terms</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            By downloading, installing, or using CardVault ("the App"), you agree to be bound by these terms. If you do not agree to these terms, do not use the App.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Description of Service</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            CardVault is a digital collection tracking tool for trading card games. The App allows users to browse card sets, track owned cards, view market pricing information, and scan physical cards using AI-powered image recognition. The App does not facilitate the buying, selling, or trading of physical or digital cards.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>User Accounts</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            You may use the App as a guest with limited functionality, or create an account for full access. You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate information when creating your account.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Subscriptions & Purchases</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            CardVault offers a free tier with a limited number of cards in your collection, and a premium subscription for unlimited collection tracking. Premium subscriptions are billed monthly through Apple's App Store. Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. You can manage and cancel your subscription in your Apple ID account settings.{"\n\n"}
            Prices are in USD and may vary by region. All purchases are subject to Apple's standard terms and conditions.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Pricing Information</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Card prices displayed in the App are sourced from third-party data providers and are provided for informational and reference purposes only. We do not guarantee the accuracy, completeness, or timeliness of pricing data. Prices should not be relied upon as the sole basis for buying or selling decisions. We are not responsible for any financial decisions made based on pricing information displayed in the App.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Acceptable Use</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            You agree not to:{"\n\n"}
            {"\u2022"} Use the App for any unlawful purpose{"\n"}
            {"\u2022"} Attempt to reverse-engineer, decompile, or disassemble the App{"\n"}
            {"\u2022"} Interfere with or disrupt the App's servers or networks{"\n"}
            {"\u2022"} Scrape, harvest, or extract data from the App by automated means{"\n"}
            {"\u2022"} Create multiple accounts for abusive purposes{"\n"}
            {"\u2022"} Impersonate another person or entity
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Limitation of Liability</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            The App is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the App will be uninterrupted, error-free, or free of harmful components.{"\n\n"}
            To the fullest extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the App.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Termination</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            We reserve the right to suspend or terminate your access to the App at any time, for any reason, without notice. You may stop using the App and delete your account at any time.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Changes to Terms</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            We may update these terms from time to time. Continued use of the App after changes constitutes acceptance of the revised terms. We encourage you to review this page periodically.
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Trademark & IP Notices</Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            CardVault is an unofficial, fan-made collection tracking tool. This App is not produced, endorsed, supported, or affiliated with any of the following companies or their subsidiaries.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Pokemon</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Pokemon, Pokemon Trading Card Game, and all related names, characters, images, and trademarks are the property of The Pokemon Company, Nintendo, Game Freak, and Creatures Inc. Pokemon card data is provided by TCGdex (tcgdex.dev), an open-source community project licensed under the MIT License.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Yu-Gi-Oh!</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Yu-Gi-Oh!, Yu-Gi-Oh! Trading Card Game, and all related names, characters, images, and trademarks are the property of Konami Holdings Corporation and Kazuki Takahashi. Yu-Gi-Oh! card data is provided by YGOProDeck (ygoprodeck.com), a community-maintained database.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>Magic: The Gathering</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Magic: The Gathering and all related names, characters, images, and trademarks are the property of Wizards of the Coast LLC, a subsidiary of Hasbro, Inc. Magic card data is provided by Scryfall (scryfall.com). Card images are displayed in accordance with the Wizards of the Coast Fan Content Policy. This App is not approved or endorsed by Wizards of the Coast.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>One Piece Card Game</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            One Piece, One Piece Card Game, and all related names, characters, images, and trademarks are the property of Eiichiro Oda, Bandai Co., Ltd., Shueisha Inc., Toei Animation Co., Ltd., and Viz Media, LLC. One Piece card data is provided by OPTCG API (optcgapi.com), a community-maintained database.
          </Text>

          <Text style={[styles.heading, { color: colors.text }]}>General Disclaimer</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            All card names, card images, card artwork, set names, set symbols, and other game-related content displayed in this App are the intellectual property of their respective owners. These materials are used under fair use principles for the purpose of identification, commentary, and personal collection management.{"\n\n"}
            This App does not claim ownership of any card images, artwork, or other copyrighted materials. All images are fetched directly from third-party API services and are not hosted, stored, or redistributed by this App.{"\n\n"}
            If you are a rights holder and believe your intellectual property is being used in a way that constitutes infringement, please contact us and we will promptly address your concerns.
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Data Source Attribution</Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            We gratefully acknowledge the following open-source and community projects that make this App possible:{"\n\n"}
            {"\u2022"} TCGdex (tcgdex.dev) — Open-source Pokemon TCG database, MIT License{"\n"}
            {"\u2022"} YGOProDeck (ygoprodeck.com) — Community Yu-Gi-Oh! card database{"\n"}
            {"\u2022"} Scryfall (scryfall.com) — Magic: The Gathering card database{"\n"}
            {"\u2022"} OPTCG API (optcgapi.com) — Community One Piece TCG database{"\n\n"}
            We encourage users to visit and support these projects.
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Contact</Text>

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            If you have any questions or concerns about this Privacy Policy, Terms of Use, or any legal matter, please contact us at:{"\n\n"}
            tcgbinderpro.com
          </Text>
        </View>
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
    paddingHorizontal: 20,
  },
  updated: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  sectionCard: {
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    marginBottom: 4,
  },
  heading: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    marginTop: 8,
  },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
});
