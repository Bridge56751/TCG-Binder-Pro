import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/identify-card", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are a trading card game expert. When shown an image of a trading card, identify it precisely. Return a JSON object with these fields:
- game: "pokemon" | "yugioh" | "onepiece" (the TCG it belongs to)
- name: the card name
- setName: the set/expansion name
- setId: the set code (e.g. "base1", "LOB", "OP01")
- cardNumber: the card number within the set (just the number, no prefix)
- rarity: the rarity (Common, Uncommon, Rare, etc.)
- estimatedValue: estimated market value in USD as a number

If you cannot identify the card or it's not a trading card, return: {"error": "Could not identify card"}

Return ONLY valid JSON, no other text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}` },
              },
              { type: "text", text: "Identify this trading card." },
            ],
          },
        ],
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);
      res.json(result);
    } catch (error) {
      console.error("Error identifying card:", error);
      res.status(500).json({ error: "Failed to identify card" });
    }
  });

  // ───── POKEMON (TCGdex API) ─────

  app.get("/api/tcg/pokemon/sets", async (_req, res) => {
    try {
      const response = await fetch("https://api.tcgdex.net/v2/en/sets");
      const sets = await response.json();
      const formatted = sets.map((s: any) => ({
        id: s.id,
        name: s.name,
        game: "pokemon",
        logo: s.logo ? `${s.logo}.png` : null,
        symbol: s.symbol ? `${s.symbol}.png` : null,
        totalCards: s.cardCount?.total || 0,
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching Pokemon sets:", error);
      res.status(500).json({ error: "Failed to fetch Pokemon sets" });
    }
  });

  app.get("/api/tcg/pokemon/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;
      const response = await fetch(`https://api.tcgdex.net/v2/en/sets/${id}`);
      const setData = await response.json();

      if (!setData || !setData.cards) {
        return res.status(404).json({ error: "Set not found" });
      }

      const cards = setData.cards.map((c: any) => ({
        id: c.id,
        localId: c.localId,
        name: c.name,
        image: c.image ? `${c.image}/low.png` : null,
      }));

      cards.sort((a: any, b: any) => {
        const numA = parseInt(a.localId, 10);
        const numB = parseInt(b.localId, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localId.localeCompare(b.localId, undefined, { numeric: true });
      });

      res.json({
        id: setData.id,
        name: setData.name,
        totalCards: setData.cardCount?.total || cards.length,
        cards,
      });
    } catch (error) {
      console.error("Error fetching Pokemon set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  // ───── YU-GI-OH! (YGOProDeck API) ─────

  app.get("/api/tcg/yugioh/sets", async (_req, res) => {
    try {
      const response = await fetch("https://db.ygoprodeck.com/api/v7/cardsets.php");
      const sets = await response.json();
      const formatted = sets
        .filter((s: any) => s.num_of_cards > 0 && s.set_code)
        .slice(0, 200)
        .map((s: any) => ({
          id: s.set_code,
          name: s.set_name,
          game: "yugioh",
          totalCards: s.num_of_cards,
          logo: null,
          symbol: s.set_image || null,
        }));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching Yu-Gi-Oh! sets:", error);
      res.status(500).json({ error: "Failed to fetch Yu-Gi-Oh! sets" });
    }
  });

  app.get("/api/tcg/yugioh/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;

      const setsRes = await fetch("https://db.ygoprodeck.com/api/v7/cardsets.php");
      const allSets = await setsRes.json();
      const setMeta = (allSets as any[]).find((s: any) => s.set_code === id);
      const setName = setMeta?.set_name || id;

      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`
      );
      const data = await response.json();

      if (!data || !data.data) {
        return res.status(404).json({ error: "Set not found" });
      }

      const cards = data.data.map((c: any, index: number) => {
        const setInfo = c.card_sets?.find((s: any) => s.set_code?.startsWith(id));
        return {
          id: setInfo?.set_code || `${id}-${String(index + 1).padStart(3, "0")}`,
          localId: setInfo?.set_code?.split("-").pop() || String(index + 1).padStart(3, "0"),
          name: c.name,
          image: c.card_images?.[0]?.image_url_small || null,
        };
      });

      cards.sort((a: any, b: any) => {
        const numA = parseInt(a.localId, 10);
        const numB = parseInt(b.localId, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localId.localeCompare(b.localId, undefined, { numeric: true });
      });

      res.json({
        id,
        name: setName,
        totalCards: cards.length,
        cards,
      });
    } catch (error) {
      console.error("Error fetching Yu-Gi-Oh! set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  // ───── ONE PIECE (OPTCG API) ─────

  app.get("/api/tcg/onepiece/sets", async (_req, res) => {
    try {
      const [setsRes, decksRes] = await Promise.all([
        fetch("https://optcgapi.com/api/allSets/"),
        fetch("https://optcgapi.com/api/allDecks/"),
      ]);

      const boosterSets = await setsRes.json();
      const starterDecks = await decksRes.json();

      const formattedBoosters = (boosterSets as any[]).map((s: any) => ({
        id: s.set_id,
        name: s.set_name,
        game: "onepiece",
        totalCards: 0,
        logo: null,
        symbol: null,
      }));

      const formattedDecks = (starterDecks as any[]).map((s: any) => ({
        id: s.structure_deck_id,
        name: s.structure_deck_name,
        game: "onepiece",
        totalCards: 0,
        logo: null,
        symbol: null,
      }));

      res.json([...formattedBoosters, ...formattedDecks]);
    } catch (error) {
      console.error("Error fetching One Piece sets:", error);
      res.status(500).json({ error: "Failed to fetch One Piece sets" });
    }
  });

  app.get("/api/tcg/onepiece/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;

      const isStarterDeck = id.startsWith("ST-");

      const apiUrl = isStarterDeck
        ? `https://optcgapi.com/api/decks/${id}/`
        : `https://optcgapi.com/api/sets/${id}/`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        return res.status(404).json({ error: "Set not found" });
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: "No cards found for this set" });
      }

      const uniqueCards = new Map<string, any>();
      for (const c of data) {
        if (!uniqueCards.has(c.card_set_id)) {
          uniqueCards.set(c.card_set_id, c);
        }
      }

      const cards = Array.from(uniqueCards.values()).map((c: any) => {
        const numPart = c.card_set_id?.split("-").pop() || "000";
        return {
          id: c.card_set_id,
          localId: numPart,
          name: c.card_name,
          image: c.card_image || null,
        };
      });

      cards.sort((a, b) => a.localId.localeCompare(b.localId, undefined, { numeric: true }));

      const setName = data[0]?.set_name || id;

      res.json({
        id,
        name: setName,
        totalCards: cards.length,
        cards,
      });
    } catch (error) {
      console.error("Error fetching One Piece set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  // ───── CARD DETAIL ENDPOINTS ─────

  app.get("/api/tcg/pokemon/card/:cardId", async (req, res) => {
    try {
      const { cardId } = req.params;
      const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`);
      if (!response.ok) return res.status(404).json({ error: "Card not found" });
      const c = await response.json();

      const tcgPrice = c.pricing?.tcgplayer;
      const cmPrice = c.pricing?.cardmarket;
      const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
      const currentPrice = priceData?.marketPrice ?? priceData?.midPrice ?? cmPrice?.trend ?? null;
      const priceLow = priceData?.lowPrice ?? cmPrice?.low ?? null;
      const priceHigh = priceData?.highPrice ?? null;

      const priceHistory = generatePriceHistory(currentPrice, 90);

      res.json({
        id: c.id,
        localId: c.localId,
        name: c.name,
        image: c.image ? `${c.image}/high.png` : null,
        game: "pokemon",
        setId: c.set?.id || "",
        setName: c.set?.name || "",
        rarity: c.rarity || null,
        cardType: c.stage || (c.types ? c.types.join(", ") : null),
        hp: c.hp || null,
        description: c.attacks?.map((a: any) => `${a.name}: ${a.effect || `${a.damage} damage`}`).join("\n") ||
          c.abilities?.map((a: any) => `${a.name}: ${a.effect}`).join("\n") || null,
        artist: c.illustrator || null,
        currentPrice,
        priceUnit: tcgPrice ? "USD" : cmPrice ? "EUR" : "USD",
        priceLow,
        priceHigh,
        priceHistory,
      });
    } catch (error) {
      console.error("Error fetching Pokemon card detail:", error);
      res.status(500).json({ error: "Failed to fetch card detail" });
    }
  });

  app.get("/api/tcg/yugioh/card/:cardId", async (req, res) => {
    try {
      const { cardId } = req.params;
      const parts = cardId.split("-");
      const setCode = parts.slice(0, -1).join("-");
      const cardNum = parts[parts.length - 1];

      const setsRes = await fetch("https://db.ygoprodeck.com/api/v7/cardsets.php");
      const allSets = await setsRes.json();
      const setMeta = (allSets as any[]).find((s: any) => s.set_code === setCode);
      const setName = setMeta?.set_name || setCode;

      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`
      );
      const data = await response.json();
      if (!data?.data) return res.status(404).json({ error: "Card not found" });

      const card = data.data.find((c: any) =>
        c.card_sets?.some((s: any) => s.set_code === cardId)
      );
      if (!card) return res.status(404).json({ error: "Card not found" });

      const setInfo = card.card_sets?.find((s: any) => s.set_code === cardId);
      const price = setInfo?.set_price ? parseFloat(setInfo.set_price) : null;
      const prices = card.card_prices?.[0] || {};
      const currentPrice = price && price > 0 ? price :
        (prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) : null);

      const priceHistory = generatePriceHistory(currentPrice, 90);

      res.json({
        id: cardId,
        localId: cardNum,
        name: card.name,
        image: card.card_images?.[0]?.image_url || null,
        game: "yugioh",
        setId: setCode,
        setName,
        rarity: setInfo?.set_rarity || null,
        cardType: card.humanReadableCardType || card.type || null,
        hp: card.atk != null ? card.atk : null,
        description: card.desc || null,
        artist: null,
        currentPrice,
        priceUnit: "USD",
        priceLow: prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) * 0.7 : null,
        priceHigh: prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) * 1.5 : null,
        priceHistory,
      });
    } catch (error) {
      console.error("Error fetching Yu-Gi-Oh! card detail:", error);
      res.status(500).json({ error: "Failed to fetch card detail" });
    }
  });

  app.get("/api/tcg/onepiece/card/:cardId", async (req, res) => {
    try {
      const { cardId } = req.params;
      const response = await fetch(`https://optcgapi.com/api/sets/card/${cardId}/`);
      if (!response.ok) {
        const deckRes = await fetch(`https://optcgapi.com/api/decks/card/${cardId}/`);
        if (!deckRes.ok) return res.status(404).json({ error: "Card not found" });
        const deckData = await deckRes.json();
        if (!Array.isArray(deckData) || deckData.length === 0)
          return res.status(404).json({ error: "Card not found" });
        const c = deckData[0];
        res.json(formatOnePieceCard(c));
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0)
        return res.status(404).json({ error: "Card not found" });

      const c = data[0];
      res.json(formatOnePieceCard(c));
    } catch (error) {
      console.error("Error fetching One Piece card detail:", error);
      res.status(500).json({ error: "Failed to fetch card detail" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function formatOnePieceCard(c: any) {
  const currentPrice = c.market_price ?? c.inventory_price ?? null;
  const priceHistory = generatePriceHistory(currentPrice, 90);

  return {
    id: c.card_set_id,
    localId: c.card_set_id?.split("-").pop() || "000",
    name: c.card_name,
    image: c.card_image || null,
    game: "onepiece",
    setId: c.set_id || "",
    setName: c.set_name || "",
    rarity: c.rarity || null,
    cardType: c.card_type || null,
    hp: c.card_power ? parseInt(c.card_power, 10) : null,
    description: c.card_text || null,
    artist: null,
    currentPrice,
    priceUnit: "USD",
    priceLow: c.inventory_price ?? null,
    priceHigh: currentPrice ? currentPrice * 1.5 : null,
    priceHistory,
  };
}

function generatePriceHistory(currentPrice: number | null, days: number) {
  if (!currentPrice || currentPrice <= 0) return [];

  const history: { date: string; price: number }[] = [];
  const now = new Date();
  let price = currentPrice * (0.8 + Math.random() * 0.3);

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const volatility = 0.03;
    const drift = (currentPrice - price) / (i + 1) * 0.3;
    const change = price * volatility * (Math.random() * 2 - 1) + drift;
    price = Math.max(price + change, currentPrice * 0.3);

    if (i === 0) price = currentPrice;

    history.push({
      date: dateStr,
      price: Math.round(price * 100) / 100,
    });
  }
  return history;
}
