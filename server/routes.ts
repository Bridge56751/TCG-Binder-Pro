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
          symbol: null,
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
      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(id)}`
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

      res.json({
        id,
        name: id,
        totalCards: cards.length,
        cards,
      });
    } catch (error) {
      console.error("Error fetching Yu-Gi-Oh! set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  app.get("/api/tcg/onepiece/sets", async (_req, res) => {
    try {
      const opSets = [
        { id: "OP01", name: "Romance Dawn", totalCards: 121 },
        { id: "OP02", name: "Paramount War", totalCards: 121 },
        { id: "OP03", name: "Pillars of Strength", totalCards: 122 },
        { id: "OP04", name: "Kingdoms of Intrigue", totalCards: 121 },
        { id: "OP05", name: "Awakening of the New Era", totalCards: 120 },
        { id: "OP06", name: "Wings of the Captain", totalCards: 130 },
        { id: "OP07", name: "500 Years in the Future", totalCards: 130 },
        { id: "OP08", name: "Two Legends", totalCards: 130 },
        { id: "OP09", name: "The Four Emperors", totalCards: 130 },
        { id: "ST01", name: "Straw Hat Crew", totalCards: 17 },
        { id: "ST02", name: "Worst Generation", totalCards: 17 },
        { id: "ST03", name: "The Seven Warlords of the Sea", totalCards: 17 },
        { id: "ST04", name: "Animal Kingdom Pirates", totalCards: 17 },
      ].map((s) => ({ ...s, game: "onepiece", logo: null, symbol: null }));

      res.json(opSets);
    } catch (error) {
      console.error("Error fetching One Piece sets:", error);
      res.status(500).json({ error: "Failed to fetch One Piece sets" });
    }
  });

  app.get("/api/tcg/onepiece/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;
      const setInfo = {
        OP01: { name: "Romance Dawn", total: 121 },
        OP02: { name: "Paramount War", total: 121 },
        OP03: { name: "Pillars of Strength", total: 122 },
        OP04: { name: "Kingdoms of Intrigue", total: 121 },
        OP05: { name: "Awakening of the New Era", total: 120 },
        OP06: { name: "Wings of the Captain", total: 130 },
        OP07: { name: "500 Years in the Future", total: 130 },
        OP08: { name: "Two Legends", total: 130 },
        OP09: { name: "The Four Emperors", total: 130 },
        ST01: { name: "Straw Hat Crew", total: 17 },
        ST02: { name: "Worst Generation", total: 17 },
        ST03: { name: "The Seven Warlords of the Sea", total: 17 },
        ST04: { name: "Animal Kingdom Pirates", total: 17 },
      } as Record<string, { name: string; total: number }>;

      const info = setInfo[id];
      if (!info) {
        return res.status(404).json({ error: "Set not found" });
      }

      const cards = Array.from({ length: info.total }, (_, i) => ({
        id: `${id}-${String(i + 1).padStart(3, "0")}`,
        localId: String(i + 1).padStart(3, "0"),
        name: `Card #${i + 1}`,
        image: null,
      }));

      res.json({
        id,
        name: info.name,
        totalCards: info.total,
        cards,
      });
    } catch (error) {
      console.error("Error fetching One Piece set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
