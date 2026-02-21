import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  FlatList,
  Dimensions,
  Platform,
  StatusBar,
  Modal,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface GalleryCard {
  id: string;
  name: string;
  image: string | null;
  localId?: string;
  setName?: string;
}

interface CardGalleryProps {
  visible: boolean;
  cards: GalleryCard[];
  initialIndex: number;
  onClose: () => void;
}

export function CardGallery({ visible, cards, initialIndex, onClose }: CardGalleryProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderCard = useCallback(({ item }: { item: GalleryCard }) => (
    <View style={styles.slide}>
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={styles.fullImage}
          contentFit="contain"
          transition={200}
          cachePolicy="disk"
        />
      ) : (
        <View style={styles.noImageContainer}>
          <Ionicons name="image-outline" size={64} color="rgba(255,255,255,0.3)" />
          <Text style={styles.noImageText}>No image available</Text>
        </View>
      )}
    </View>
  ), []);

  if (cards.length === 0) return null;

  const currentCard = cards[currentIndex] || cards[0];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.cardName} numberOfLines={1}>{currentCard.name}</Text>
            {currentCard.setName && (
              <Text style={styles.setName} numberOfLines={1}>
                {currentCard.setName}{currentCard.localId ? ` #${currentCard.localId}` : ""}
              </Text>
            )}
          </View>
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>{currentIndex + 1}/{cards.length}</Text>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={cards}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          bounces={false}
          decelerationRate="fast"
          style={styles.list}
        />

        <View style={[styles.footer, { paddingBottom: bottomInset + 12 }]}>
          <View style={styles.dots}>
            {cards.length <= 20 ? cards.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            )) : (
              <Text style={styles.pageIndicator}>{currentIndex + 1} of {cards.length}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  setName: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  counterBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  counterText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  list: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  fullImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_HEIGHT * 0.7,
  },
  noImageContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noImageText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    backgroundColor: "#FFFFFF",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pageIndicator: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
});
