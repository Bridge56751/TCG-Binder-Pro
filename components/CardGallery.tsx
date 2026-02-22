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

function getHighResUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("/low.png")) return url.replace("/low.png", "/high.png");
  if (url.includes("ygoprodeck.com") && url.includes("/cards_small/")) return url.replace("/cards_small/", "/cards/");
  if (url.includes("scryfall") || url.includes("cards.scryfall.io")) {
    return url.replace(/\/(small|normal)\//, "/large/");
  }
  return url;
}

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
  onClose: (lastIndex: number) => void;
}

export function CardGallery({ visible, cards, initialIndex, onClose }: CardGalleryProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mountKey, setMountKey] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isSettledRef = useRef(false);
  const topInset = Platform.OS === "web" ? 20 : insets.top;
  const bottomInset = Platform.OS === "web" ? 20 : insets.bottom;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setMountKey((k) => k + 1);
      isSettledRef.current = false;
      setTimeout(() => {
        isSettledRef.current = true;
      }, 600);
    }
  }, [visible, initialIndex]);

  const handleScroll = useCallback((e: any) => {
    if (!isSettledRef.current) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(idx);
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  const renderCard = useCallback(({ item }: { item: GalleryCard }) => {
    const highResUri = getHighResUrl(item.image);
    return (
      <View style={styles.slide}>
        {highResUri ? (
          <Image
            source={{ uri: highResUri }}
            style={styles.fullImage}
            contentFit="contain"
            transition={200}
            cachePolicy="disk"
            placeholder={item.image ? { uri: item.image } : undefined}
          />
        ) : (
          <View style={styles.noImageContainer}>
            <Ionicons name="image-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.noImageText}>No image available</Text>
          </View>
        )}
      </View>
    );
  }, []);

  if (cards.length === 0) return null;

  const currentCard = cards[currentIndex] || cards[0];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => onClose(currentIndex)}
    >
      <View style={styles.overlay}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <Pressable style={styles.closeButton} onPress={() => onClose(currentIndex)} hitSlop={12}>
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
          key={`gallery-${mountKey}`}
          ref={flatListRef}
          data={cards}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={handleScroll}
          bounces={false}
          decelerationRate="fast"
          onScrollToIndexFailed={(info) => {
            const offset = info.index * SCREEN_WIDTH;
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset, animated: false });
            }, 100);
          }}
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
