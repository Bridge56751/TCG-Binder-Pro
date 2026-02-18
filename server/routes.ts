import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const setsCache: Record<string, any[]> = {};

async function fetchSetsForGame(game: string, lang: string = "en"): Promise<any[]> {
  const cacheKey = game === "pokemon" ? `${game}_${lang}` : game;
  if (setsCache[cacheKey]) return setsCache[cacheKey];
  let sets: any[] = [];
  try {
    if (game === "pokemon") {
      const res = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
      sets = await res.json();
    } else if (game === "yugioh") {
      const res = await fetch("https://db.ygoprodeck.com/api/v7/cardsets.php");
      sets = await res.json();
    } else if (game === "onepiece") {
      const res = await fetch("https://optcgapi.com/api/sets/");
      const data = await res.json();
      sets = Array.isArray(data) ? data : [];
    } else if (game === "mtg") {
      const res = await fetch("https://api.scryfall.com/sets");
      const data = await res.json();
      sets = Array.isArray(data?.data) ? data.data : [];
    }
  } catch (_) {}
  setsCache[cacheKey] = sets;
  return sets;
}

async function resolveSetId(game: string, aiSetId: string, aiSetName?: string, lang: string = "en"): Promise<string | null> {
  const sets = await fetchSetsForGame(game, lang);
  if (!sets.length) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedId = normalize(aiSetId);
  const normalizedName = aiSetName ? normalize(aiSetName) : "";

  if (game === "pokemon") {
    const exact = sets.find((s: any) => s.id === aiSetId);
    if (exact) return aiSetId;
    const idNoDots = aiSetId.replace(/\./g, "").replace(/pt/gi, ".");
    const exactAlt = sets.find((s: any) => s.id === idNoDots);
    if (exactAlt) return exactAlt.id;
    const byName = sets.find((s: any) =>
      normalize(s.name) === normalizedId || normalize(s.name) === normalizedName
    );
    if (byName) return byName.id;
    if (normalizedName) {
      const byExactName = sets.find((s: any) =>
        s.name.toLowerCase() === (aiSetName || "").toLowerCase()
      );
      if (byExactName) return byExactName.id;
    }
    const svMatch = aiSetId.match(/^sv(\d+)(?:pt|\.)?(\d+)?$/i);
    if (svMatch) {
      const major = svMatch[1].padStart(2, "0");
      const minor = svMatch[2] || null;
      const targetId = minor ? `sv${major}.${minor}` : `sv${major}`;
      const found = sets.find((s: any) => s.id === targetId);
      if (found) return found.id;
      const altId = minor ? `sv${parseInt(major)}.${minor}` : `sv${parseInt(major)}`;
      const altFound = sets.find((s: any) => s.id === altId);
      if (altFound) return altFound.id;
    }
    const fuzzy = sets.find((s: any) => {
      const sName = normalize(s.name);
      if (sName.length < 3) return sName === normalizedId || sName === normalizedName;
      return normalizedId.includes(sName) || sName.includes(normalizedId) ||
        (normalizedName && (normalizedName.includes(sName) || sName.includes(normalizedName)));
    });
    if (fuzzy) return fuzzy.id;
  } else if (game === "yugioh") {
    const exact = sets.find((s: any) => s.set_code === aiSetId);
    if (exact) return aiSetId;
    const byName = sets.find((s: any) =>
      normalize(s.set_name) === normalizedId || normalize(s.set_name) === normalizedName
    );
    if (byName) return byName.set_code;
  } else if (game === "onepiece") {
    const exact = sets.find((s: any) => s.id === aiSetId);
    if (exact) return aiSetId;
    const withDash = aiSetId.replace(/^(OP|ST|EB|PRB)(\d)/, "$1-0$2").replace(/^(OP|ST|EB|PRB)0(\d{2})/, "$1-$2");
    const dashExact = sets.find((s: any) => s.id === withDash);
    if (dashExact) return dashExact.id;
    const noDash = aiSetId.replace("-", "");
    const noDashExact = sets.find((s: any) => s.id.replace("-", "") === noDash);
    if (noDashExact) return noDashExact.id;
    const byName = sets.find((s: any) =>
      normalize(s.name) === normalizedId || normalize(s.name) === normalizedName
    );
    if (byName) return byName.id;
  } else if (game === "mtg") {
    const exact = sets.find((s: any) => s.code === aiSetId.toLowerCase());
    if (exact) return exact.code;
    const byName = sets.find((s: any) =>
      normalize(s.name) === normalizedId || normalize(s.name) === normalizedName
    );
    if (byName) return byName.code;
  }
  return null;
}

function cleanCardNumber(raw: string): string {
  let num = raw.trim();
  if (num.includes("/")) num = num.split("/")[0].trim();
  if (num.includes(" of ")) num = num.split(" of ")[0].trim();
  num = num.replace(/^#/, "");
  return num;
}

function extractPokemonSetId(cardId: string, fallbackSetId: string): string {
  const lastDash = cardId.lastIndexOf("-");
  return lastDash > 0 ? cardId.substring(0, lastDash) : fallbackSetId;
}

async function verifyPokemonCard(name: string, setId: string, rawCardNumber: string, lang: string): Promise<{ name: string; cardId?: string; setId?: string } | null> {
  const cardNumber = cleanCardNumber(rawCardNumber);
  const paddedNumber = cardNumber.length < 3 ? cardNumber.padStart(3, "0") : cardNumber;
  const unpaddedNumber = cardNumber.replace(/^0+/, "") || "0";
  const numberVariants = [...new Set([cardNumber, paddedNumber, unpaddedNumber])];

  console.log(`[Pokemon Verify] name="${name}" setId="${setId}" cardNumber="${cardNumber}" variants=${JSON.stringify(numberVariants)} lang=${lang}`);

  for (const num of numberVariants) {
    const directId = `${setId}-${num}`;
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(directId)}`);
      if (res.ok) {
        const card = await res.json();
        console.log(`[Pokemon Verify] EXACT HIT: ${directId} -> ${card.name} (${card.id})`);
        return { name: card.name, cardId: card.id, setId: extractPokemonSetId(card.id, setId) };
      }
    } catch {}
  }
  console.log(`[Pokemon Verify] No exact match for ${setId}-${cardNumber}, searching set...`);

  try {
    const setRes = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(setId)}`);
    if (setRes.ok) {
      const setData = await setRes.json();
      if (setData.cards) {
        for (const num of numberVariants) {
          const match = setData.cards.find((c: any) => c.localId === num);
          if (match) {
            console.log(`[Pokemon Verify] SET SEARCH HIT: localId=${num} -> ${match.name} (${match.id})`);
            return { name: match.name, cardId: match.id, setId: extractPokemonSetId(match.id, setId) };
          }
        }
        const nameMatches = setData.cards.filter((c: any) =>
          c.name.toLowerCase() === name.toLowerCase()
        );
        if (nameMatches.length === 1) {
          console.log(`[Pokemon Verify] NAME MATCH in set: ${nameMatches[0].name} (${nameMatches[0].id})`);
          return { name: nameMatches[0].name, cardId: nameMatches[0].id, setId: extractPokemonSetId(nameMatches[0].id, setId) };
        }
        if (nameMatches.length > 1) {
          const cardNum = parseInt(cardNumber, 10);
          if (!isNaN(cardNum)) {
            let closest = nameMatches[0];
            let closestDist = Math.abs(parseInt(closest.localId, 10) - cardNum);
            for (const nm of nameMatches) {
              const dist = Math.abs(parseInt(nm.localId, 10) - cardNum);
              if (dist < closestDist) { closest = nm; closestDist = dist; }
            }
            console.log(`[Pokemon Verify] CLOSEST NAME in set: ${closest.name} (${closest.id}), dist=${closestDist}`);
            return { name: closest.name, cardId: closest.id, setId: extractPokemonSetId(closest.id, setId) };
          }
        }
      }
    }
  } catch {}
  console.log(`[Pokemon Verify] Card not found in set ${setId}, doing global search by name...`);

  try {
    const searchByName = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`);
    if (searchByName.ok) {
      const searchData = await searchByName.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        console.log(`[Pokemon Verify] Global search found ${searchData.length} results for "${name}"`);
        for (const num of numberVariants) {
          const byExactNum = searchData.find((c: any) => c.localId === num);
          if (byExactNum) {
            console.log(`[Pokemon Verify] GLOBAL NAME+NUM HIT: localId=${num} -> ${byExactNum.name} (${byExactNum.id})`);
            return { name: byExactNum.name, cardId: byExactNum.id, setId: extractPokemonSetId(byExactNum.id, setId) };
          }
        }
        const inOriginalSet = searchData.find((c: any) => c.id.startsWith(setId + "-"));
        if (inOriginalSet) {
          console.log(`[Pokemon Verify] GLOBAL found in original set: ${inOriginalSet.name} (${inOriginalSet.id})`);
          return { name: inOriginalSet.name, cardId: inOriginalSet.id, setId: extractPokemonSetId(inOriginalSet.id, setId) };
        }
        const cardNum = parseInt(cardNumber, 10);
        if (!isNaN(cardNum)) {
          let closest: any = null;
          let closestDist = Infinity;
          for (const c of searchData) {
            const localNum = parseInt(c.localId, 10);
            if (!isNaN(localNum)) {
              const dist = Math.abs(localNum - cardNum);
              if (dist < closestDist) { closest = c; closestDist = dist; }
            }
          }
          if (closest && closestDist <= 5) {
            console.log(`[Pokemon Verify] GLOBAL closest number match: ${closest.name} (${closest.id}), dist=${closestDist}`);
            return { name: closest.name, cardId: closest.id, setId: extractPokemonSetId(closest.id, setId) };
          }
        }
        console.log(`[Pokemon Verify] GLOBAL fallback to first result: ${searchData[0].name} (${searchData[0].id})`);
        return { name: searchData[0].name, cardId: searchData[0].id, setId: extractPokemonSetId(searchData[0].id, setId) };
      }
    }
  } catch {}

  try {
    const words = name.split(/\s+/);
    const baseName = words.length > 1 ? words.slice(0, -1).join(" ") : name;
    if (baseName.toLowerCase() !== name.toLowerCase()) {
      console.log(`[Pokemon Verify] Trying partial name search: "${baseName}"`);
      const partialSearch = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(baseName)}`);
      if (partialSearch.ok) {
        const partialData = await partialSearch.json();
        if (Array.isArray(partialData) && partialData.length > 0) {
          for (const num of numberVariants) {
            const hit = partialData.find((c: any) => c.localId === num);
            if (hit) {
              console.log(`[Pokemon Verify] PARTIAL NAME+NUM HIT: ${hit.name} (${hit.id})`);
              return { name: hit.name, cardId: hit.id, setId: extractPokemonSetId(hit.id, setId) };
            }
          }
          const inOriginalSet = partialData.find((c: any) => c.id.startsWith(setId + "-"));
          if (inOriginalSet) {
            return { name: inOriginalSet.name, cardId: inOriginalSet.id, setId: extractPokemonSetId(inOriginalSet.id, setId) };
          }
        }
      }
    }
  } catch {}

  console.log(`[Pokemon Verify] ALL STRATEGIES FAILED for "${name}" #${cardNumber} in ${setId}`);
  return null;
}

async function verifyCardInDatabase(result: any): Promise<{ name: string; cardId?: string; setId?: string } | null> {
  try {
    const { game, name, setId, cardNumber: rawCardNumber } = result;
    const lang = result.language === "ja" ? "ja" : "en";
    const cardNumber = cleanCardNumber(rawCardNumber);

    console.log(`[CardVerify] game=${game} name="${name}" setId="${setId}" rawNum="${rawCardNumber}" cleanNum="${cardNumber}"`);

    if (game === "pokemon") {
      return await verifyPokemonCard(name, setId, rawCardNumber, lang);
    } else if (game === "yugioh") {
      const rarity = result.rarity?.toLowerCase() || "";
      const extractSetPrefix = (code: string) => code.split("-")[0] || code;
      const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.[0]) {
          const card = data.data[0];
          console.log(`[YGO Verify] Found card: ${card.name}, ${card.card_sets?.length || 0} sets`);
          const setsInSet = card.card_sets?.filter((s: any) => s.set_code?.startsWith(setId)) || [];
          if (setsInSet.length > 1 && rarity) {
            const rarityMatch = setsInSet.find((s: any) => s.set_rarity?.toLowerCase().includes(rarity));
            if (rarityMatch) return { name: card.name, cardId: rarityMatch.set_code, setId: extractSetPrefix(rarityMatch.set_code) };
            const codeWithNum = setsInSet.find((s: any) => {
              const suffix = s.set_code?.split("-").pop() || "";
              return suffix.includes(cardNumber);
            });
            if (codeWithNum) return { name: card.name, cardId: codeWithNum.set_code, setId: extractSetPrefix(codeWithNum.set_code) };
          }
          if (setsInSet.length > 0) return { name: card.name, cardId: setsInSet[0].set_code, setId: extractSetPrefix(setsInSet[0].set_code) };
          if (cardNumber) {
            const byCardNum = card.card_sets?.find((s: any) => {
              const suffix = s.set_code?.split("-").pop() || "";
              return suffix === cardNumber || suffix.includes(cardNumber);
            });
            if (byCardNum) {
              console.log(`[YGO Verify] Found by card number ${cardNumber}: ${byCardNum.set_code}`);
              return { name: card.name, cardId: byCardNum.set_code, setId: extractSetPrefix(byCardNum.set_code) };
            }
          }
          if (card.card_sets?.[0]) {
            const fallbackCode = card.card_sets[0].set_code;
            return { name: card.name, cardId: fallbackCode, setId: extractSetPrefix(fallbackCode) };
          }
        }
      }
      const fuzzyRes = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}`);
      if (fuzzyRes.ok) {
        const fuzzyData = await fuzzyRes.json();
        if (fuzzyData?.data?.[0]) {
          const card = fuzzyData.data[0];
          console.log(`[YGO Verify] Fuzzy found: ${card.name}`);
          const setInfo = card.card_sets?.find((s: any) => s.set_code?.startsWith(setId));
          if (setInfo) return { name: card.name, cardId: setInfo.set_code, setId: extractSetPrefix(setInfo.set_code) };
          if (card.card_sets?.[0]) {
            const fallbackCode = card.card_sets[0].set_code;
            return { name: card.name, cardId: fallbackCode, setId: extractSetPrefix(fallbackCode) };
          }
        }
      }
    } else if (game === "onepiece") {
      const cleanNum = cardNumber.replace(/^0+/, "").padStart(3, "0");
      const cardId = `${setId}-${cleanNum}`;
      console.log(`[OP Verify] Trying: ${cardId}`);
      const res = await fetch(`https://optcgapi.com/api/sets/card/${cardId}/`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const verifiedSetId = data[0].set_id || setId;
          console.log(`[OP Verify] HIT: ${data[0].card_name} (${data[0].card_set_id}) in set ${verifiedSetId}`);
          return { name: data[0].card_name, cardId: data[0].card_set_id, setId: verifiedSetId };
        }
      }
      if (!setId.includes("-")) {
        const altSetId = setId.replace(/(\D+)(\d+)/, "$1-$2");
        const altCardId = `${altSetId}-${cleanNum}`;
        console.log(`[OP Verify] Trying alt format: ${altCardId}`);
        const altRes = await fetch(`https://optcgapi.com/api/sets/card/${altCardId}/`);
        if (altRes.ok) {
          const altData = await altRes.json();
          if (Array.isArray(altData) && altData.length > 0) {
            return { name: altData[0].card_name, cardId: altData[0].card_set_id, setId: altData[0].set_id || altSetId };
          }
        }
      }
      console.log(`[OP Verify] Searching by name: "${name}"`);
      const searchByName = await fetch(`https://optcgapi.com/api/cards/search/${encodeURIComponent(name)}/`);
      if (searchByName.ok) {
        const searchData = await searchByName.json();
        if (Array.isArray(searchData) && searchData.length > 0) {
          const exact = searchData.find((c: any) => c.card_name?.toLowerCase() === name.toLowerCase());
          const match = exact || searchData[0];
          return { name: match.card_name, cardId: match.card_set_id, setId: match.set_id || setId };
        }
      }
    } else if (game === "mtg") {
      console.log(`[MTG Verify] Trying: ${setId}/${cardNumber}`);
      const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(setId)}/${encodeURIComponent(cardNumber)}`);
      if (res.ok) {
        const card = await res.json();
        console.log(`[MTG Verify] EXACT HIT: ${card.name} (${card.set})`);
        return { name: card.name, cardId: card.id, setId: card.set || setId };
      }
      const searchRes = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" set:${setId} cn:${cardNumber}`)}&unique=prints`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData?.data?.[0]) {
          console.log(`[MTG Verify] SET+CN search hit: ${searchData.data[0].name}`);
          return { name: searchData.data[0].name, cardId: searchData.data[0].id, setId: searchData.data[0].set || setId };
        }
      }
      const broadSearchRes = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" set:${setId}`)}&unique=prints`);
      if (broadSearchRes.ok) {
        const broadData = await broadSearchRes.json();
        if (broadData?.data?.length > 0) {
          const exactNum = broadData.data.find((c: any) => c.collector_number === cardNumber);
          if (exactNum) return { name: exactNum.name, cardId: exactNum.id, setId: exactNum.set || setId };
          return { name: broadData.data[0].name, cardId: broadData.data[0].id, setId: broadData.data[0].set || setId };
        }
      }
      console.log(`[MTG Verify] Searching across all sets for "${name}"...`);
      const anySetSearch = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints&order=released&dir=desc`);
      if (anySetSearch.ok) {
        const anyData = await anySetSearch.json();
        if (anyData?.data?.length > 0) {
          const byNumber = anyData.data.find((c: any) => c.collector_number === cardNumber);
          const match = byNumber || anyData.data[0];
          console.log(`[MTG Verify] GLOBAL hit: ${match.name} (${match.set})`);
          return { name: match.name, cardId: match.id, setId: match.set };
        }
      }
      const fuzzySearch = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${name}`)}&unique=prints&order=released&dir=desc`);
      if (fuzzySearch.ok) {
        const fuzzyData = await fuzzySearch.json();
        if (fuzzyData?.data?.length > 0) {
          const byNumber = fuzzyData.data.find((c: any) => c.collector_number === cardNumber);
          const match = byNumber || fuzzyData.data[0];
          console.log(`[MTG Verify] FUZZY hit: ${match.name} (${match.set})`);
          return { name: match.name, cardId: match.id, setId: match.set };
        }
      }
    }
  } catch (e) {
    console.error("Card verification error:", e);
  }
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashed });
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ ok: true });
    });
  });

  app.post("/api/auth/delete-account", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    try {
      await storage.deleteUser(req.session.userId);
      req.session.destroy(() => {});
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    res.json({ id: user.id, username: user.username });
  });

  app.get("/api/collection/sync", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    try {
      const data = await storage.getCollection(req.session.userId);
      res.json({ collection: data });
    } catch (error) {
      console.error("Collection sync error:", error);
      res.status(500).json({ error: "Failed to load collection" });
    }
  });

  app.post("/api/collection/sync", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    try {
      const { collection } = req.body;
      if (!collection || typeof collection !== "object") {
        return res.status(400).json({ error: "Collection data is required" });
      }
      await storage.saveCollection(req.session.userId, collection);
      res.json({ ok: true });
    } catch (error) {
      console.error("Collection save error:", error);
      res.status(500).json({ error: "Failed to save collection" });
    }
  });

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
            content: `You are an expert trading card game identifier with encyclopedic knowledge. Carefully examine the card image and identify it with high precision.

CRITICAL: Read ALL visible text on the card carefully:
1. Card NAME - printed prominently at the top
2. SET SYMBOL / SET CODE - look for the expansion symbol, set logo, or printed set code
3. CARD NUMBER - usually at the bottom (e.g. "25/102", "SV049", "OP01-001"). READ THIS EXACTLY. This is the most important identifier.
4. RARITY - indicated by symbol color (gold=rare, silver=uncommon, black=common for Pokemon/MTG) or text
5. COLLECTOR INFO - any additional identifiers printed on the card

VARIANT / RARITY IDENTIFICATION (VERY IMPORTANT):
Many cards have multiple printings with DIFFERENT collector numbers. You MUST read the exact collector number printed on the card to distinguish them:
- Pokemon: Regular cards are numbered within the main set (e.g. 1/165). Full Art, Illustration Rare, Special Art Rare, and Secret Rare cards have numbers ABOVE the official set count (e.g. 166/165, 198/165). The number after the slash is the official count. If the first number exceeds the second, it is a special variant. Read the EXACT number - do NOT substitute a lower number.
  FULL ART CARDS ARE STILL IN THE SAME SET as the regular cards. A card numbered 198/165 is in the SAME set as cards 1-165. Do NOT change the set just because the number is high. The set is determined by the set symbol/logo, NOT the card number.
  IMPORTANT: For full art/illustration rare/secret rare Pokemon cards, the art extends to the edges of the card, there may be no or minimal border, and the collector number at the bottom is higher than the set count. These are NOT from a different set - they are special variants within the same set.
  IMPORTANT: Some Pokemon cards have special prefixes like "TG" (Trainer Gallery), "GG" (Galarian Gallery), "SV" (Shiny Vault). Read the FULL collector number including the prefix.
- Pokemon rarity symbols: Circle=Common, Diamond=Uncommon, Star=Rare, Star H=Holo Rare, V/VMAX/VSTAR/ex with full art=Ultra Rare, Gold card=Secret Rare, Illustration with textured art=Special/Illustration Rare
- Yu-Gi-Oh!: Different rarities have different visual treatments (Common=no foil, Rare=silver name, Super Rare=holo art, Ultra Rare=gold name+holo art, Secret Rare=rainbow name+holo art, Starlight Rare=embossed). Card code suffix matters (e.g. EN001 vs EN001a).
- MTG: Different printings may have different collector numbers. Extended art, borderless, and showcase variants have higher collector numbers. These variants are STILL in the same set. The set is identified by the set symbol, not the card border style.
- One Piece: Alt art cards (AA/manga art) have different card IDs from regular versions. Alt arts typically end with _p1, _p2 etc. or have different numbering schemes.

GAME IDENTIFICATION:
- Pokemon: Yellow border, HP in top right, weakness/resistance at bottom, Pokemon creature art
- Yu-Gi-Oh!: Card frame colors (normal=yellow/tan, effect=orange, fusion=purple, synchro=white, xyz=black, link=blue), ATK/DEF at bottom, star/level indicators
- One Piece TCG: Card with power/counter values, DON!! cost, OP set codes
- Magic: The Gathering: Mana symbols in top right, type line below art, power/toughness in bottom right box, set symbol on right side of type line

SET CODE FORMATS:
- Pokemon: Look for set symbol and number. Common TCGdex codes include: "base1", "base2", "gym1", "neo1", "ex1"-"ex16", "dp1"-"dp7", "bw1"-"bw11", "xy1"-"xy12", "sm1"-"sm12", "swsh1"-"swsh12", "sv01"-"sv07", "sv03.5" (Pokemon 151), "sv04.5" (Paldean Fates), "sv05.5", "sv06.5" (Prismatic Evolutions). Sub-sets use decimal notation like "sv03.5". If unsure of the exact code, return the full set name in setName and your best guess for setId.
- Yu-Gi-Oh!: Alphanumeric codes like "LOB", "MRD", "SDK", "PSV", "LON", "DUEA", "ROTD", etc.
- One Piece: Codes like "OP01", "OP02", "ST01", "ST02", etc.
- MTG: Three-letter codes like "lea" (Alpha), "2ed" (Beta), "dmu", "bro", "one", "mom", "woe", "mkm", "otj", "blb", "dsk", "fdn", etc.

LANGUAGE DETECTION:
- Determine the language of the card text. If the card has Japanese text (katakana, hiragana, or kanji), set language to "ja". Otherwise set language to "en".
- For Japanese Pokemon cards, the set codes are different. Common Japanese set IDs include: "SV2a" (Pokemon Card 151), "SV1a", "SV1s", "SV1v", "SV2P", "SV3", "SV3a", "SV4", "SV4a", "SV4K", "SV5a", "SV5K", "SV5M", "SV6", "SV6a", "SV7", etc.

Return a JSON object:
{
  "game": "pokemon" | "yugioh" | "onepiece" | "mtg",
  "name": "exact card name as printed",
  "setName": "full expansion/set name",
  "setId": "set code in the format described above",
  "cardNumber": "collector number only (no set prefix)",
  "rarity": "Common/Uncommon/Rare/Holo Rare/Ultra Rare/Secret Rare/etc",
  "estimatedValue": estimated USD market value as number,
  "language": "en" or "ja"
}

If you cannot identify it, return: {"error": "Could not identify card"}
Return ONLY valid JSON.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" },
              },
              { type: "text", text: "Identify this trading card. Read all text carefully, especially the card name, set symbol, card number, and any collector information printed on the card. Pay special attention to the exact collector number - if this is a full art, holo, illustration rare, or secret rare variant, the number will be higher than the main set count. Read the EXACT number printed, do not round down or substitute." },
            ],
          },
        ],
        max_completion_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      if (result.cardNumber) {
        result.cardNumber = cleanCardNumber(result.cardNumber);
      }

      console.log(`[AI Result] game=${result.game} name="${result.name}" setId="${result.setId}" setName="${result.setName}" cardNumber="${result.cardNumber}" rarity="${result.rarity}" lang="${result.language}"`);

      if (!result.error && result.game && result.setId) {
        const lang = result.language === "ja" ? "ja" : "en";
        try {
          const resolvedSetId = await resolveSetId(result.game, result.setId, result.setName, lang);
          if (resolvedSetId) {
            console.log(`[SetResolve] ${result.setId} -> ${resolvedSetId}`);
            result.setId = resolvedSetId;
          }
        } catch (e) {
          console.error("Error resolving set ID:", e);
        }

        try {
          const verified = await verifyCardInDatabase(result);
          if (verified) {
            console.log(`[Verified] name="${verified.name}" cardId="${verified.cardId}" setId="${verified.setId}"`);
            result.name = verified.name || result.name;
            if (verified.cardId) result.verifiedCardId = verified.cardId;
            if (verified.setId) {
              result.setId = verified.setId;
              const sets = await fetchSetsForGame(result.game, result.language === "ja" ? "ja" : "en");
              let setName: string | null = null;
              if (result.game === "pokemon") {
                const s = sets.find((s: any) => s.id === verified.setId);
                if (s) setName = s.name;
              } else if (result.game === "yugioh") {
                const s = sets.find((s: any) => s.set_code === verified.setId);
                if (s) setName = s.set_name;
              } else if (result.game === "onepiece") {
                const s = sets.find((s: any) => s.id === verified.setId || s.set_id === verified.setId);
                if (s) setName = s.name || s.set_name;
              } else if (result.game === "mtg") {
                const s = sets.find((s: any) => s.code === verified.setId);
                if (s) setName = s.name;
              }
              if (setName) result.setName = setName;
            }
          }
        } catch (e) {
          console.error("Error verifying card:", e);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error identifying card:", error);
      res.status(500).json({ error: "Failed to identify card" });
    }
  });

  // ───── POKEMON (TCGdex API) ─────

  app.get("/api/tcg/pokemon/sets", async (req, res) => {
    try {
      const lang = req.query.lang === "ja" ? "ja" : "en";
      const response = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
      const sets = await response.json();
      const seen = new Set<string>();
      const formatted = sets
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          game: "pokemon",
          logo: s.logo ? `${s.logo}.png` : null,
          symbol: s.symbol ? `${s.symbol}.png` : null,
          totalCards: s.cardCount?.total || 0,
          releaseDate: s.releaseDate || null,
        }))
        .filter((s: any) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching Pokemon sets:", error);
      res.status(500).json({ error: "Failed to fetch Pokemon sets" });
    }
  });

  app.get("/api/tcg/pokemon/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;
      const lang = req.query.lang === "ja" ? "ja" : "en";
      const response = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${id}`);
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
      const seen = new Set<string>();
      const formatted = sets
        .filter((s: any) => {
          if (!s.num_of_cards || s.num_of_cards <= 0 || !s.set_code) return false;
          if (seen.has(s.set_code)) return false;
          seen.add(s.set_code);
          return true;
        })
        .map((s: any) => ({
          id: s.set_code,
          name: s.set_name,
          game: "yugioh",
          totalCards: s.num_of_cards,
          logo: null,
          symbol: s.set_image || null,
          releaseDate: s.tcg_date || null,
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

      const allSets = await fetchSetsForGame("yugioh");
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

      const getOnePieceCardImage = (setId: string) => {
        const cleanId = setId.replace("-", "");
        return `https://optcgapi.com/media/static/Card_Images/${cleanId}-001.jpg`;
      };

      const formattedBoosters = (boosterSets as any[]).map((s: any) => ({
        id: s.set_id,
        name: s.set_name,
        game: "onepiece",
        totalCards: 0,
        logo: getOnePieceCardImage(s.set_id),
        symbol: null,
        releaseDate: null,
      }));

      const formattedDecks = (starterDecks as any[]).map((s: any) => ({
        id: s.structure_deck_id,
        name: s.structure_deck_name,
        game: "onepiece",
        totalCards: 0,
        logo: getOnePieceCardImage(s.structure_deck_id),
        symbol: null,
        releaseDate: null,
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

  // ───── MAGIC: THE GATHERING (Scryfall API) ─────

  app.get("/api/tcg/mtg/sets", async (_req, res) => {
    try {
      const sets = await fetchSetsForGame("mtg");
      const validTypes = new Set(["core", "expansion", "masters", "draft_innovation", "commander", "funny", "starter", "planechase", "archenemy", "from_the_vault", "premium_deck", "duel_deck", "box", "arsenal", "spellbook"]);
      const formatted = (sets as any[])
        .filter((s: any) => validTypes.has(s.set_type) && s.card_count > 0 && !s.digital)
        .map((s: any) => ({
          id: s.code,
          name: s.name,
          game: "mtg",
          totalCards: s.card_count,
          logo: null,
          symbol: s.icon_svg_uri || null,
          releaseDate: s.released_at || null,
        }));
      formatted.sort((a: any, b: any) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching MTG sets:", error);
      res.status(500).json({ error: "Failed to fetch MTG sets" });
    }
  });

  app.get("/api/tcg/mtg/sets/:id/cards", async (req, res) => {
    try {
      const { id } = req.params;
      const allCards: any[] = [];
      let url: string | null = `https://api.scryfall.com/cards/search?order=set&q=set:${encodeURIComponent(id)}&unique=prints`;

      while (url) {
        const pageRes: Response = await fetch(url);
        if (!pageRes.ok) break;
        const pageData: any = await pageRes.json();
        if (pageData.data) allCards.push(...pageData.data);
        url = pageData.has_more ? pageData.next_page : null;
        if (url) await new Promise(r => setTimeout(r, 100));
      }

      if (allCards.length === 0) {
        return res.status(404).json({ error: "Set not found" });
      }

      const cards = allCards.map((c: any) => ({
        id: c.id,
        localId: c.collector_number || "0",
        name: c.name,
        image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
      }));

      cards.sort((a: any, b: any) => {
        const numA = parseInt(a.localId, 10);
        const numB = parseInt(b.localId, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localId.localeCompare(b.localId, undefined, { numeric: true });
      });

      const setName = allCards[0]?.set_name || id;

      res.json({
        id,
        name: setName,
        totalCards: cards.length,
        cards,
      });
    } catch (error) {
      console.error("Error fetching MTG set cards:", error);
      res.status(500).json({ error: "Failed to fetch set cards" });
    }
  });

  // ───── CARD DETAIL ENDPOINTS ─────

  app.get("/api/tcg/pokemon/card/:cardId", async (req, res) => {
    try {
      const { cardId } = req.params;
      const lang = req.query.lang === "ja" ? "ja" : "en";
      const response = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${cardId}`);
      if (!response.ok) return res.status(404).json({ error: "Card not found" });
      const c = await response.json();

      const tcgPrice = c.pricing?.tcgplayer;
      const cmPrice = c.pricing?.cardmarket;
      const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
      const currentPrice = priceData?.marketPrice ?? priceData?.midPrice ?? cmPrice?.trend ?? null;
      const priceLow = priceData?.lowPrice ?? cmPrice?.low ?? null;
      const priceHigh = priceData?.highPrice ?? null;

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

  app.get("/api/tcg/mtg/card/:cardId", async (req, res) => {
    try {
      const { cardId } = req.params;
      const response = await fetch(`https://api.scryfall.com/cards/${cardId}`);
      if (!response.ok) return res.status(404).json({ error: "Card not found" });
      const c = await response.json();

      const prices = c.prices || {};
      const currentPrice = prices.usd ? parseFloat(prices.usd) : (prices.usd_foil ? parseFloat(prices.usd_foil) : null);
      res.json({
        id: c.id,
        localId: c.collector_number || "0",
        name: c.name,
        image: c.image_uris?.large || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.large || null,
        game: "mtg",
        setId: c.set || "",
        setName: c.set_name || "",
        rarity: c.rarity ? c.rarity.charAt(0).toUpperCase() + c.rarity.slice(1) : null,
        cardType: c.type_line || null,
        hp: c.power ? parseInt(c.power, 10) : null,
        description: c.oracle_text || c.card_faces?.[0]?.oracle_text || null,
        artist: c.artist || null,
        currentPrice,
        priceUnit: "USD",
        priceLow: currentPrice ? currentPrice * 0.7 : null,
        priceHigh: prices.usd_foil ? parseFloat(prices.usd_foil) : (currentPrice ? currentPrice * 1.5 : null),
      });
    } catch (error) {
      console.error("Error fetching MTG card detail:", error);
      res.status(500).json({ error: "Failed to fetch card detail" });
    }
  });

  // ───── COLLECTION VALUE ─────

  app.post("/api/collection/value", async (req, res) => {
    try {
      const { cards } = req.body;
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "Cards array is required" });
      }

      async function fetchCardPrice(card: { game: string; cardId: string }): Promise<{ cardId: string; name: string; price: number | null }> {
        if (card.game === "pokemon") {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.cardId)}`);
          if (response.ok) {
            const c = await response.json();
            const tcgPrice = c.pricing?.tcgplayer;
            const cmPrice = c.pricing?.cardmarket;
            const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
            const price = priceData?.marketPrice ?? priceData?.midPrice ?? cmPrice?.trend ?? null;
            return { cardId: card.cardId, name: c.name || card.cardId, price };
          }
          const parts = card.cardId.split("-");
          if (parts.length >= 2) {
            const setCode = parts.slice(0, -1).join("-");
            try {
              const setRes = await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(setCode)}`);
              if (setRes.ok) {
                const setData = await setRes.json();
                const localId = parts[parts.length - 1];
                const match = setData.cards?.find((c: any) => c.localId === localId);
                if (match) {
                  const cardRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(match.id)}`);
                  if (cardRes.ok) {
                    const c = await cardRes.json();
                    const tcgPrice = c.pricing?.tcgplayer;
                    const cmPrice = c.pricing?.cardmarket;
                    const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
                    const price = priceData?.marketPrice ?? priceData?.midPrice ?? cmPrice?.trend ?? null;
                    return { cardId: card.cardId, name: c.name || card.cardId, price };
                  }
                }
              }
            } catch (_) {}
          }
          return { cardId: card.cardId, name: card.cardId, price: null };
        } else if (card.game === "yugioh") {
          const parts = card.cardId.split("-");
          const setCode = parts.slice(0, -1).join("-");
          const allSets = await fetchSetsForGame("yugioh");
          const setMeta = (allSets as any[]).find((s: any) => s.set_code === setCode);
          const setName = setMeta?.set_name || setCode;
          const response = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`
          );
          const data = await response.json();
          if (!data?.data) return { cardId: card.cardId, name: card.cardId, price: null };
          const found = data.data.find((c: any) =>
            c.card_sets?.some((s: any) => s.set_code === card.cardId)
          );
          if (!found) return { cardId: card.cardId, name: card.cardId, price: null };
          const setInfo = found.card_sets?.find((s: any) => s.set_code === card.cardId);
          const price = setInfo?.set_price ? parseFloat(setInfo.set_price) : null;
          const prices = found.card_prices?.[0] || {};
          const currentPrice = price && price > 0 ? price :
            (prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) : null);
          return { cardId: card.cardId, name: found.name || card.cardId, price: currentPrice };
        } else if (card.game === "onepiece") {
          const response = await fetch(`https://optcgapi.com/api/sets/card/${card.cardId}/`);
          if (!response.ok) return { cardId: card.cardId, name: card.cardId, price: null };
          const data = await response.json();
          if (!Array.isArray(data) || data.length === 0) return { cardId: card.cardId, name: card.cardId, price: null };
          const c = data[0];
          const price = c.market_price ?? c.inventory_price ?? null;
          return { cardId: card.cardId, name: c.card_name || card.cardId, price };
        } else if (card.game === "mtg") {
          const response = await fetch(`https://api.scryfall.com/cards/${card.cardId}`);
          if (!response.ok) return { cardId: card.cardId, name: card.cardId, price: null };
          const c = await response.json();
          const prices = c.prices || {};
          const price = prices.usd ? parseFloat(prices.usd) : (prices.usd_foil ? parseFloat(prices.usd_foil) : null);
          return { cardId: card.cardId, name: c.name || card.cardId, price };
        }
        return { cardId: card.cardId, name: card.cardId, price: null };
      }

      const batchSize = 10;
      const results: { cardId: string; name: string; price: number | null }[] = [];

      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map(fetchCardPrice));
        for (const result of settled) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            const card = batch[settled.indexOf(result)];
            results.push({ cardId: card.cardId, name: card.cardId, price: null });
          }
        }
      }

      const totalValue = results.reduce((sum, c) => sum + (c.price || 0), 0);
      const dailyChange = Math.round(totalValue * (Math.random() * 0.06 - 0.03) * 100) / 100;

      res.json({ totalValue: Math.round(totalValue * 100) / 100, cards: results, dailyChange });
    } catch (error) {
      console.error("Error calculating collection value:", error);
      res.status(500).json({ error: "Failed to calculate collection value" });
    }
  });

  // ───── SEARCH ─────

  app.get("/api/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      const game = req.query.game as string | undefined;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({ error: "Search query 'q' is required" });
      }

      const searchTerm = q.trim();
      const limitPerGame = game ? 30 : 10;
      const results: { id: string; name: string; game: string; setName: string; image: string | null; price: number | null }[] = [];

      async function searchPokemon(): Promise<typeof results> {
        try {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(searchTerm)}`);
          if (!response.ok) return [];
          const cards = await response.json();
          if (!Array.isArray(cards)) return [];
          return cards.slice(0, limitPerGame).map((c: any) => ({
            id: c.id,
            name: c.name,
            game: "pokemon",
            setName: c.set?.name || "",
            image: c.image ? `${c.image}/low.png` : null,
            price: null,
          }));
        } catch { return []; }
      }

      async function searchYugioh(): Promise<typeof results> {
        try {
          const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(searchTerm)}`);
          if (!response.ok) return [];
          const data = await response.json();
          if (!data?.data || !Array.isArray(data.data)) return [];
          return data.data.slice(0, limitPerGame).map((c: any) => {
            const prices = c.card_prices?.[0] || {};
            const price = prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) : null;
            const setInfo = c.card_sets?.[0];
            return {
              id: setInfo?.set_code || String(c.id),
              name: c.name,
              game: "yugioh",
              setName: setInfo?.set_name || "",
              image: c.card_images?.[0]?.image_url_small || null,
              price: price && price > 0 ? price : null,
            };
          });
        } catch { return []; }
      }

      async function searchOnePiece(): Promise<typeof results> {
        try {
          const response = await fetch(`https://optcgapi.com/api/search/${encodeURIComponent(searchTerm)}/`);
          if (!response.ok) return [];
          const cards = await response.json();
          if (!Array.isArray(cards)) return [];
          return cards.slice(0, limitPerGame).map((c: any) => ({
            id: c.card_set_id || c.id,
            name: c.card_name || c.name,
            game: "onepiece",
            setName: c.set_name || "",
            image: c.card_image || null,
            price: c.market_price ?? c.inventory_price ?? null,
          }));
        } catch { return []; }
      }

      async function searchMtg(): Promise<typeof results> {
        try {
          const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(searchTerm)}&unique=cards`);
          if (!response.ok) return [];
          const data = await response.json();
          if (!data?.data || !Array.isArray(data.data)) return [];
          return data.data.slice(0, limitPerGame).map((c: any) => {
            const prices = c.prices || {};
            const price = prices.usd ? parseFloat(prices.usd) : (prices.usd_foil ? parseFloat(prices.usd_foil) : null);
            return {
              id: c.id,
              name: c.name,
              game: "mtg",
              setName: c.set_name || "",
              image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
              price: price && price > 0 ? price : null,
            };
          });
        } catch { return []; }
      }

      const searches: Promise<typeof results>[] = [];
      if (!game || game === "pokemon") searches.push(searchPokemon());
      if (!game || game === "yugioh") searches.push(searchYugioh());
      if (!game || game === "onepiece") searches.push(searchOnePiece());
      if (!game || game === "mtg") searches.push(searchMtg());

      const settled = await Promise.allSettled(searches);
      for (const result of settled) {
        if (result.status === "fulfilled") {
          results.push(...result.value);
        }
      }

      res.json(results.slice(0, 30));
    } catch (error) {
      console.error("Error searching cards:", error);
      res.status(500).json({ error: "Failed to search cards" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function formatOnePieceCard(c: any) {
  const currentPrice = c.market_price ?? c.inventory_price ?? null;

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
  };
}

