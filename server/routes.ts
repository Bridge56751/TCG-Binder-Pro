import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { generateCode, sendVerificationEmail, sendPasswordResetEmail } from "./email";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const FREE_CARD_LIMIT = 20;

function countCollectionCards(collection: any): number {
  if (!collection || typeof collection !== "object") return 0;
  let total = 0;
  for (const game of Object.values(collection)) {
    if (game && typeof game === "object") {
      for (const cards of Object.values(game as Record<string, any>)) {
        if (Array.isArray(cards)) {
          total += cards.length;
        }
      }
    }
  }
  return total;
}

const setsCache: Record<string, any[]> = {};
const pokemonReleaseDateCache: Record<string, string | null> = {};
let pokemonReleaseDatesFetched = false;

async function fetchPokemonReleaseDates(setIds: string[], lang: string = "en"): Promise<Record<string, string | null>> {
  if (pokemonReleaseDatesFetched) return pokemonReleaseDateCache;
  const batchSize = 20;
  for (let i = 0; i < setIds.length; i += batchSize) {
    const batch = setIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          const res = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${id}`);
          if (res.ok) {
            const data = await res.json();
            return { id, releaseDate: data.releaseDate || null };
          }
          return { id, releaseDate: null };
        } catch {
          return { id, releaseDate: null };
        }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        pokemonReleaseDateCache[result.value.id] = result.value.releaseDate;
      }
    }
  }
  pokemonReleaseDatesFetched = true;
  return pokemonReleaseDateCache;
}

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
  const opPrefix = num.match(/^(OP|ST|EB|PRB)\d{1,2}-(.+)$/i);
  if (opPrefix) num = opPrefix[2];
  return num;
}

function extractPokemonSetId(cardId: string, fallbackSetId: string): string {
  const lastDash = cardId.lastIndexOf("-");
  return lastDash > 0 ? cardId.substring(0, lastDash) : fallbackSetId;
}

function namesMatch(aiName: string, dbName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = normalize(aiName);
  const b = normalize(dbName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const stripSuffix = (s: string) => s.toLowerCase().replace(/\s*(ex|gx|v|vmax|vstar|mega|m\s).*$/i, "").trim();
  const aBase = normalize(stripSuffix(aiName));
  const bBase = normalize(stripSuffix(dbName));
  if (aBase.length > 2 && bBase.length > 2 && (aBase === bBase || aBase.includes(bBase) || bBase.includes(aBase))) return true;

  const aWords = aiName.toLowerCase().split(/[\s\-]+/).filter(w => w.length > 2);
  const bWords = dbName.toLowerCase().split(/[\s\-]+/).filter(w => w.length > 2);
  if (aWords.length > 0 && bWords.length > 0) {
    const overlap = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw)));
    if (overlap.length >= Math.min(aWords.length, bWords.length) * 0.5) return true;
  }
  return false;
}

async function verifyPokemonCard(name: string, setId: string, rawCardNumber: string, lang: string): Promise<{ name: string; cardId?: string; setId?: string } | null> {
  const cardNumber = cleanCardNumber(rawCardNumber);
  const paddedNumber = cardNumber.length < 3 ? cardNumber.padStart(3, "0") : cardNumber;
  const unpaddedNumber = cardNumber.replace(/^0+/, "") || "0";
  const numberVariants = [...new Set([cardNumber, paddedNumber, unpaddedNumber])];

  console.log(`[Pokemon Verify] name="${name}" setId="${setId}" cardNumber="${cardNumber}" variants=${JSON.stringify(numberVariants)} lang=${lang}`);

  let numberOnlyFallback: { name: string; cardId?: string; setId?: string } | null = null;
  for (const num of numberVariants) {
    const directId = `${setId}-${num}`;
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(directId)}`);
      if (res.ok) {
        const card = await res.json();
        if (namesMatch(name, card.name)) {
          console.log(`[Pokemon Verify] EXACT HIT (name matches): ${directId} -> ${card.name} (${card.id})`);
          return { name: card.name, cardId: card.id, setId: extractPokemonSetId(card.id, setId) };
        } else {
          console.log(`[Pokemon Verify] Number ${directId} exists but name mismatch: AI="${name}" DB="${card.name}" - saving as fallback`);
          if (!numberOnlyFallback) {
            numberOnlyFallback = { name: card.name, cardId: card.id, setId: extractPokemonSetId(card.id, setId) };
          }
        }
      }
    } catch {}
  }

  console.log(`[Pokemon Verify] No name+number match, searching by name in set ${setId}...`);
  try {
    const setRes = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(setId)}`);
    if (setRes.ok) {
      const setData = await setRes.json();
      if (setData.cards) {
        const nameMatches = setData.cards.filter((c: any) => namesMatch(name, c.name));
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
          return { name: nameMatches[0].name, cardId: nameMatches[0].id, setId: extractPokemonSetId(nameMatches[0].id, setId) };
        }
      }
    }
  } catch {}

  console.log(`[Pokemon Verify] Not found in set ${setId}, doing global name search...`);
  try {
    const searchByName = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`);
    if (searchByName.ok) {
      const searchData = await searchByName.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        console.log(`[Pokemon Verify] Global search found ${searchData.length} results for "${name}"`);
        const inOriginalSet = searchData.find((c: any) => c.id.startsWith(setId + "-"));
        if (inOriginalSet) {
          console.log(`[Pokemon Verify] GLOBAL found in original set: ${inOriginalSet.name} (${inOriginalSet.id})`);
          return { name: inOriginalSet.name, cardId: inOriginalSet.id, setId: extractPokemonSetId(inOriginalSet.id, setId) };
        }
        for (const num of numberVariants) {
          const byNum = searchData.find((c: any) => c.localId === num);
          if (byNum) {
            console.log(`[Pokemon Verify] GLOBAL NAME+NUM HIT: ${byNum.name} (${byNum.id})`);
            return { name: byNum.name, cardId: byNum.id, setId: extractPokemonSetId(byNum.id, setId) };
          }
        }
        console.log(`[Pokemon Verify] Returning first global result: ${searchData[0].name} (${searchData[0].id})`);
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
          const matching = partialData.filter((c: any) => namesMatch(name, c.name));
          if (matching.length > 0) {
            const inSet = matching.find((c: any) => c.id.startsWith(setId + "-"));
            if (inSet) return { name: inSet.name, cardId: inSet.id, setId: extractPokemonSetId(inSet.id, setId) };
            return { name: matching[0].name, cardId: matching[0].id, setId: extractPokemonSetId(matching[0].id, setId) };
          }
          const inSet = partialData.find((c: any) => c.id.startsWith(setId + "-"));
          if (inSet) return { name: inSet.name, cardId: inSet.id, setId: extractPokemonSetId(inSet.id, setId) };
          return { name: partialData[0].name, cardId: partialData[0].id, setId: extractPokemonSetId(partialData[0].id, setId) };
        }
      }
    }
  } catch {}

  if (numberOnlyFallback) {
    console.log(`[Pokemon Verify] Using number-only fallback: ${numberOnlyFallback.cardId} (name was misread)`);
    return numberOnlyFallback;
  }

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
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const existing = await storage.getUserByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ email: email.toLowerCase(), password: hashed });
      const code = generateCode();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await storage.setVerificationCode(user.id, code, expiry);
      sendVerificationEmail(email.toLowerCase(), code).catch(e => console.error("Verification email failed:", e));
      req.session.userId = user.id;
      res.json({ id: user.id, email: user.email, isPremium: user.isPremium, isVerified: false, needsVerification: true });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not logged in" });
      }
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      if (user.isVerified) {
        return res.json({ ok: true, message: "Email already verified" });
      }
      if (!user.verificationCode || !user.verificationExpiry) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }
      if (new Date() > user.verificationExpiry) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }
      if (user.verificationCode !== code.trim()) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      await storage.verifyUser(user.id);
      res.json({ ok: true, message: "Email verified successfully" });
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not logged in" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      if (user.isVerified) {
        return res.json({ ok: true, message: "Email already verified" });
      }
      const code = generateCode();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await storage.setVerificationCode(user.id, code, expiry);
      const sent = await sendVerificationEmail(user.email, code);
      if (!sent) {
        return res.status(500).json({ error: "Failed to send verification email" });
      }
      res.json({ ok: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification code" });
    }
  });

  app.post("/api/auth/request-reset", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.json({ ok: true, message: "If an account with that email exists, a reset code has been sent." });
      }
      const code = generateCode();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await storage.setResetCode(user.id, code, expiry);
      await sendPasswordResetEmail(user.email, code);
      res.json({ ok: true, message: "If an account with that email exists, a reset code has been sent." });
    } catch (error) {
      console.error("Request reset error:", error);
      res.status(500).json({ error: "Failed to send reset code" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, code, and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(400).json({ error: "Invalid reset code" });
      }
      if (!user.resetCode || !user.resetExpiry) {
        return res.status(400).json({ error: "No reset code found. Please request a new one." });
      }
      if (new Date() > user.resetExpiry) {
        return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      }
      if (user.resetCode !== code.trim()) {
        return res.status(400).json({ error: "Invalid reset code" });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await storage.updatePassword(user.id, hashed);
      res.json({ ok: true, message: "Password reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      req.session.userId = user.id;
      if (!user.isVerified) {
        const code = generateCode();
        const expiry = new Date(Date.now() + 10 * 60 * 1000);
        await storage.setVerificationCode(user.id, code, expiry);
        sendVerificationEmail(user.email, code).catch(e => console.error("Verification email failed:", e));
      }
      res.json({ id: user.id, email: user.email, isPremium: user.isPremium, isVerified: user.isVerified });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/apple", async (req, res) => {
    try {
      const { identityToken, fullName, email: appleEmail } = req.body;
      if (!identityToken) {
        return res.status(400).json({ error: "Identity token is required" });
      }

      const parts = identityToken.split(".");
      if (parts.length !== 3) {
        return res.status(400).json({ error: "Invalid identity token" });
      }
      let payload: any;
      try {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      } catch {
        return res.status(400).json({ error: "Invalid identity token payload" });
      }

      if (payload.iss !== "https://appleid.apple.com") {
        return res.status(401).json({ error: "Invalid token issuer" });
      }
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return res.status(401).json({ error: "Token expired" });
      }

      const appleUserId = payload.sub;
      if (!appleUserId) {
        return res.status(400).json({ error: "Missing user ID in token" });
      }

      const tokenEmail = payload.email || appleEmail;
      const displayName = fullName
        ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ")
        : undefined;

      console.log(`[AppleAuth] sub=${appleUserId} email=${tokenEmail} name=${displayName || "none"}`);

      let user = await storage.getUserByAppleId(appleUserId);

      if (!user && tokenEmail) {
        const existingByEmail = await storage.getUserByEmail(tokenEmail.toLowerCase());
        if (existingByEmail) {
          await storage.linkAppleId(existingByEmail.id, appleUserId);
          user = { ...existingByEmail, appleId: appleUserId };
          console.log(`[AppleAuth] Linked Apple ID to existing account: ${user.id}`);
        }
      }

      if (!user) {
        const email = tokenEmail?.toLowerCase() || `apple_${appleUserId.slice(0, 8)}@private.appleid.com`;
        user = await storage.createAppleUser(appleUserId, email);
        console.log(`[AppleAuth] Created new Apple user: ${user.id}`);
      }

      req.session.userId = user.id;
      res.json({
        id: user.id,
        email: user.email,
        isPremium: user.isPremium,
        isVerified: true,
      });
    } catch (error) {
      console.error("Apple auth error:", error);
      res.status(500).json({ error: "Apple sign-in failed" });
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
    res.json({ id: user.id, email: user.email, isPremium: user.isPremium, isVerified: user.isVerified });
  });

  app.post("/api/auth/upgrade-premium", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    try {
      const { rcUserId } = req.body || {};
      if (!rcUserId || typeof rcUserId !== "string") {
        return res.status(400).json({ error: "RevenueCat user ID is required" });
      }

      const rcSecretKey = process.env.REVENUECAT_SECRET_API_KEY;
      if (!rcSecretKey) {
        console.error("REVENUECAT_SECRET_API_KEY not configured");
        return res.status(500).json({ error: "Payment verification not configured" });
      }

      const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`, {
        headers: {
          "Authorization": `Bearer ${rcSecretKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!rcRes.ok) {
        console.error("RevenueCat API error:", rcRes.status, await rcRes.text());
        return res.status(403).json({ error: "Could not verify purchase" });
      }

      const rcData = await rcRes.json();
      const entitlements = rcData?.subscriber?.entitlements || {};
      const premiumEntitlement = entitlements["premium"];

      if (!premiumEntitlement || new Date(premiumEntitlement.expires_date) < new Date()) {
        return res.status(403).json({ error: "No active premium subscription found" });
      }

      await storage.upgradeToPremium(req.session.userId);
      res.json({ ok: true, isPremium: true });
    } catch (err) {
      console.error("Upgrade error:", err);
      res.status(500).json({ error: "Failed to upgrade" });
    }
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

      const user = await storage.getUser(req.session.userId);
      if (user && !user.isPremium) {
        const cardCount = countCollectionCards(collection);
        if (cardCount > FREE_CARD_LIMIT) {
          return res.status(403).json({ error: `Free accounts are limited to ${FREE_CARD_LIMIT} cards. Upgrade to Premium for unlimited cards.` });
        }
      }

      await storage.saveCollection(req.session.userId, collection);
      res.json({ ok: true });
    } catch (error) {
      console.error("Collection save error:", error);
      res.status(500).json({ error: "Failed to save collection" });
    }
  });

  async function nameSearchPokemon(name: string, lang: string): Promise<any[] | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {}
    const words = name.split(/\s+/);
    if (words.length > 1) {
      for (let drop = 1; drop <= Math.min(2, words.length - 1); drop++) {
        const partial = words.slice(0, words.length - drop).join(" ");
        try {
          const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(partial)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              const filtered = data.filter((c: any) => normalize(c.name).includes(normalize(name)) || normalize(name).includes(normalize(c.name)));
              if (filtered.length > 0) return filtered;
              return data;
            }
          }
        } catch {}
      }
    }
    return null;
  }

  async function nameSearchYugioh(name: string): Promise<any | null> {
    try {
      const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.[0]) return data.data[0];
      }
    } catch {}
    try {
      const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.length > 0) {
          const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const exact = data.data.find((c: any) => normalize(c.name) === normalize(name));
          return exact || data.data[0];
        }
      }
    } catch {}
    return null;
  }

  async function nameSearchMTG(name: string, setHint?: string): Promise<any | null> {
    try {
      let query = `!"${name}"`;
      if (setHint) query += ` set:${setHint}`;
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.length > 0) return data.data;
      }
    } catch {}
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}&unique=prints`);
      if (res.ok) {
        const data = await res.json();
        if (data?.data?.length > 0) {
          const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const exact = data.data.filter((c: any) => normalize(c.name) === normalize(name));
          return exact.length > 0 ? exact : data.data;
        }
      }
    } catch {}
    return null;
  }

  async function nameSearchOnePiece(name: string, setId?: string): Promise<any[] | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedName = normalize(name);

    if (setId) {
      const setIdWithDash = setId.includes("-") ? setId : setId.replace(/(\D+)(\d+)/, "$1-$2");
      try {
        const res = await fetch(`https://optcgapi.com/api/sets/${setIdWithDash}/`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const matches = data.filter((c: any) => {
              const cardName = normalize(c.card_name || "");
              return cardName === normalizedName || cardName.includes(normalizedName) || normalizedName.includes(cardName);
            });
            if (matches.length > 0) return matches;
          }
        }
      } catch {}
    }

    const allSets = await fetchSetsForGame("onepiece");
    for (const set of allSets.slice(0, 15)) {
      try {
        const res = await fetch(`https://optcgapi.com/api/sets/${set.id}/`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const matches = data.filter((c: any) => {
              const cardName = normalize(c.card_name || "");
              return cardName === normalizedName || cardName.includes(normalizedName) || normalizedName.includes(cardName);
            });
            if (matches.length > 0) return matches;
          }
        }
      } catch {}
    }
    return null;
  }

  async function deepVerifyCard(aiResult: any): Promise<{ name: string; cardId?: string; setId?: string; verified: boolean }> {
    const { game, name, setId, cardNumber: rawCardNumber } = aiResult;
    const lang = aiResult.language === "ja" ? "ja" : "en";
    const cardNumber = cleanCardNumber(rawCardNumber || "");

    console.log(`[DeepVerify] game=${game} name="${name}" setId="${setId}" num="${cardNumber}" lang=${lang}`);

    if (game === "pokemon") {
      const directResult = await verifyPokemonCard(name, setId, rawCardNumber || "", lang);
      if (directResult) {
        console.log(`[DeepVerify] Pokemon direct verify HIT: ${directResult.cardId}`);
        return { ...directResult, verified: true };
      }

      const nameResults = await nameSearchPokemon(name, lang);
      if (nameResults && Array.isArray(nameResults)) {
        console.log(`[DeepVerify] Pokemon name search found ${nameResults.length} results for "${name}"`);
        if (cardNumber) {
          const paddedNumber = cardNumber.length < 3 ? cardNumber.padStart(3, "0") : cardNumber;
          const unpaddedNumber = cardNumber.replace(/^0+/, "") || "0";
          const numberVariants = [...new Set([cardNumber, paddedNumber, unpaddedNumber])];
          for (const num of numberVariants) {
            const match = nameResults.find((c: any) => c.localId === num);
            if (match) {
              console.log(`[DeepVerify] Pokemon NAME+NUM match: ${match.name} (${match.id})`);
              return { name: match.name, cardId: match.id, setId: extractPokemonSetId(match.id, setId), verified: true };
            }
          }
          const inSet = nameResults.find((c: any) => c.id?.startsWith(setId + "-"));
          if (inSet) {
            console.log(`[DeepVerify] Pokemon NAME+SET match: ${inSet.name} (${inSet.id})`);
            return { name: inSet.name, cardId: inSet.id, setId: extractPokemonSetId(inSet.id, setId), verified: true };
          }
        }
        if (nameResults.length === 1) {
          console.log(`[DeepVerify] Pokemon single name match: ${nameResults[0].name} (${nameResults[0].id})`);
          return { name: nameResults[0].name, cardId: nameResults[0].id, setId: extractPokemonSetId(nameResults[0].id, setId), verified: true };
        }
      }

      const allSets = await fetchSetsForGame("pokemon", lang);
      const relatedSets = allSets.filter((s: any) => {
        if (s.id === setId) return false;
        const sId = (s.id || "").toLowerCase();
        const targetId = setId.toLowerCase();
        if (sId.startsWith("sv") && targetId.startsWith("sv")) return true;
        if (sId.startsWith("swsh") && targetId.startsWith("swsh")) return true;
        if (sId.startsWith("sm") && targetId.startsWith("sm")) return true;
        return false;
      }).slice(0, 8);

      for (const alt of relatedSets) {
        const altResult = await verifyPokemonCard(name, alt.id, rawCardNumber || "", lang);
        if (altResult) {
          console.log(`[DeepVerify] Pokemon found in related set ${alt.id}: ${altResult.cardId}`);
          return { ...altResult, verified: true };
        }
      }

      console.log(`[DeepVerify] Pokemon ALL strategies failed for "${name}"`);
      return { name, verified: false };

    } else if (game === "yugioh") {
      const rarity = aiResult.rarity?.toLowerCase() || "";
      const extractSetPrefix = (code: string) => code.split("-")[0] || code;

      const card = await nameSearchYugioh(name);
      if (card) {
        console.log(`[DeepVerify] YGO found: ${card.name}, ${card.card_sets?.length || 0} sets`);
        const setsInSet = card.card_sets?.filter((s: any) => s.set_code?.startsWith(setId)) || [];
        if (setsInSet.length > 1 && rarity) {
          const rarityMatch = setsInSet.find((s: any) => s.set_rarity?.toLowerCase().includes(rarity));
          if (rarityMatch) return { name: card.name, cardId: rarityMatch.set_code, setId: extractSetPrefix(rarityMatch.set_code), verified: true };
        }
        if (setsInSet.length > 0) {
          if (cardNumber) {
            const codeWithNum = setsInSet.find((s: any) => {
              const suffix = s.set_code?.split("-").pop() || "";
              return suffix.includes(cardNumber);
            });
            if (codeWithNum) return { name: card.name, cardId: codeWithNum.set_code, setId: extractSetPrefix(codeWithNum.set_code), verified: true };
          }
          return { name: card.name, cardId: setsInSet[0].set_code, setId: extractSetPrefix(setsInSet[0].set_code), verified: true };
        }
        if (cardNumber) {
          const byCardNum = card.card_sets?.find((s: any) => {
            const suffix = s.set_code?.split("-").pop() || "";
            return suffix === cardNumber || suffix.includes(cardNumber);
          });
          if (byCardNum) return { name: card.name, cardId: byCardNum.set_code, setId: extractSetPrefix(byCardNum.set_code), verified: true };
        }
        if (card.card_sets?.[0]) {
          return { name: card.name, cardId: card.card_sets[0].set_code, setId: extractSetPrefix(card.card_sets[0].set_code), verified: true };
        }
        return { name: card.name, verified: true };
      }
      console.log(`[DeepVerify] YGO not found for "${name}"`);
      return { name, verified: false };

    } else if (game === "onepiece") {
      const cleanNum = cardNumber.replace(/^0+/, "").padStart(3, "0");
      const normalizeSetId = (sid: string) => sid.replace("-", "");
      const setIdNoDash = normalizeSetId(setId);
      const setIdWithDash = setId.includes("-") ? setId : setId.replace(/(\D+)(\d+)/, "$1-$2");
      const cardIdFormats = [
        `${setIdNoDash}-${cleanNum}`,
        `${setIdWithDash}-${cleanNum}`,
        `${setId}-${cleanNum}`,
      ];
      const tried = new Set<string>();

      for (const cid of cardIdFormats) {
        if (tried.has(cid)) continue;
        tried.add(cid);
        try {
          const res = await fetch(`https://optcgapi.com/api/sets/card/${cid}/`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              const card = data[0];
              if (namesMatch(name, card.card_name)) {
                console.log(`[DeepVerify] OP exact HIT (name matches): ${card.card_name} (${card.card_set_id})`);
                return { name: card.card_name, cardId: card.card_set_id, setId: card.set_id || setId, verified: true };
              } else {
                console.log(`[DeepVerify] OP number hit but name mismatch: AI="${name}" DB="${card.card_name}"`);
              }
            }
          }
        } catch {}
      }

      const nameResults = await nameSearchOnePiece(name, setId);
      if (nameResults) {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const exact = nameResults.find((c: any) => normalize(c.card_name) === normalize(name));
        const inSet = nameResults.find((c: any) => normalizeSetId(c.set_id || "") === setIdNoDash || (c.card_set_id || "").startsWith(setIdNoDash));
        const match = exact || inSet || nameResults[0];
        console.log(`[DeepVerify] OP name search HIT: ${match.card_name} (${match.card_set_id})`);
        return { name: match.card_name, cardId: match.card_set_id, setId: match.set_id || setId, verified: true };
      }

      console.log(`[DeepVerify] OP not found for "${name}"`);
      return { name, verified: false };

    } else if (game === "mtg") {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(setId)}/${encodeURIComponent(cardNumber)}`);
        if (res.ok) {
          const card = await res.json();
          if (namesMatch(name, card.name)) {
            console.log(`[DeepVerify] MTG exact HIT (name matches): ${card.name} (${card.set}/${card.collector_number})`);
            return { name: card.name, cardId: `${card.set}-${card.collector_number}`, setId: card.set, verified: true };
          } else {
            console.log(`[DeepVerify] MTG number hit but name mismatch: AI="${name}" DB="${card.name}"`);
          }
        }
      } catch {}

      const nameResults = await nameSearchMTG(name, setId);
      if (nameResults && Array.isArray(nameResults)) {
        console.log(`[DeepVerify] MTG name search found ${nameResults.length} prints for "${name}"`);
        const inSet = nameResults.find((c: any) => c.set === setId);
        if (inSet) {
          return { name: inSet.name, cardId: `${inSet.set}-${inSet.collector_number}`, setId: inSet.set, verified: true };
        }
        if (cardNumber) {
          const byNum = nameResults.find((c: any) => c.collector_number === cardNumber);
          if (byNum) {
            return { name: byNum.name, cardId: `${byNum.set}-${byNum.collector_number}`, setId: byNum.set, verified: true };
          }
        }
        const card = nameResults[0];
        return { name: card.name, cardId: `${card.set}-${card.collector_number}`, setId: card.set, verified: true };
      }

      const nameResultsNoSet = await nameSearchMTG(name);
      if (nameResultsNoSet && Array.isArray(nameResultsNoSet)) {
        const card = nameResultsNoSet[0];
        console.log(`[DeepVerify] MTG broad name search HIT: ${card.name} (${card.set})`);
        return { name: card.name, cardId: `${card.set}-${card.collector_number}`, setId: card.set, verified: true };
      }

      console.log(`[DeepVerify] MTG not found for "${name}"`);
      return { name, verified: false };
    }

    return { name, verified: false };
  }

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
            content: `You are an expert trading card game identifier specializing in rare, special, and hard-to-read cards. You must identify cards accurately even when they are:
- Full Art / Alternate Art cards (artwork covers the entire card, text may be small or partially hidden)
- Special Art Rare (SAR) / Illustration Rare (IR) / Art Rare (AR) cards
- Mega, EX, GX, V, VMAX, VSTAR, ex cards (Pokemon)
- Secret Rare / Ultra Rare / Hyper Rare cards (numbers ABOVE the set total, e.g., 198/165)
- Holographic / Foil cards (reflective surfaces may obscure text)
- Textured / Embossed cards
- Japanese cards with kanji/hiragana/katakana text

CRITICAL IDENTIFICATION STEPS:

STEP 1 - IDENTIFY THE GAME by visual cues:
- Pokemon: Yellow/silver/gold border, HP top right, weakness/resistance/retreat at bottom, energy symbols
- Yu-Gi-Oh!: ATK/DEF bottom right, star/level indicators, attribute icon top right (DARK/LIGHT/FIRE/WATER/EARTH/WIND)
- One Piece TCG: DON!! cost, power values, OP/ST/EB set codes printed on card
- Magic: The Gathering: Mana cost top right with colored pip symbols, type line in middle, set symbol on right of type line, P/T bottom right for creatures

STEP 2 - READ THE CARD NAME (MOST IMPORTANT):
- The name is printed at the TOP of the card
- On full art/SAR cards, the name may be in a small text box overlaid on the art — look carefully at the very top edge
- For Pokemon special cards: look for suffixes like "ex", "EX", "GX", "V", "VMAX", "VSTAR" — these are PART of the name
- For Japanese cards: read the Japanese name exactly as printed including katakana suffixes
- If the name is hard to read, use other clues (attacks, abilities, Pokemon species appearance) to identify the character

STEP 3 - READ THE COLLECTOR NUMBER (CRITICAL FOR VERIFICATION):
- Located at the BOTTOM of the card, usually bottom-left or bottom-right
- Format examples: "025/165", "198/165" (secret rare), "TG05/TG30", "GG01/GG70", "SV024/SV122", "OP01-001"
- For full art/secret rares, the number is often HIGHER than the total (e.g., 200/165 means card 200 in a 165-card set)
- Read the EXACT number — do NOT round, truncate, or modify it
- Include ALL prefixes (TG, GG, SV, K, etc.)
- If there's a slash, include both parts: "198/165" not just "198"
- Japanese Pokemon cards: number format is typically "123/456" at the bottom

STEP 4 - IDENTIFY THE SET:
- Look for set codes printed on the card (usually near the collector number)
- Pokemon English set codes: sv01 through sv08, sv03.5, sv04.5, sv06.5, swsh1-swsh12, sm1-sm12, xy1-xy12, base1, etc.
- Pokemon Japanese set codes: SV1a, SV2a, SV3, SV4a, SV4K, SV5a, SV5K, SV6, SV7, SV8, etc.
- Yu-Gi-Oh! set codes: LOB, MRD, PSV, DUEA, BODE, etc. (printed in card code like "LOB-EN001")
- One Piece set codes: OP01-OP09, ST01-ST18, EB01, PRB01 (printed on card)
- MTG: Set symbol on the type line, set code is 3-4 letters (FDN, DSK, BLB, MH3, etc.)

STEP 5 - DETERMINE RARITY:
- Pokemon: Common, Uncommon, Rare, Holo Rare, Ultra Rare, Full Art, Alt Art, SAR (Special Art Rare), IR (Illustration Rare), AR (Art Rare), Secret Rare, Hyper Rare, Trainer Gallery
- For Pokemon, rarity symbols at bottom: circle=Common, diamond=Uncommon, star=Rare, star-H=Holo
- Yu-Gi-Oh!: Common, Rare, Super Rare, Ultra Rare, Secret Rare, Ghost Rare, Starlight Rare
- MTG: Black=Common, Silver=Uncommon, Gold=Rare, Orange/Mythic=Mythic Rare
- One Piece: Common (C), Uncommon (UC), Rare (R), Super Rare (SR), Secret Rare (SEC), Leader (L), Special (SP)

STEP 6 - LANGUAGE:
- Japanese text (katakana/hiragana/kanji) → "ja"
- Otherwise → "en"

Return ONLY valid JSON (no markdown, no backticks):
{
  "game": "pokemon" | "yugioh" | "onepiece" | "mtg",
  "name": "exact card name as printed",
  "setName": "full set/expansion name",
  "setId": "set code",
  "cardNumber": "exact collector number as printed (e.g. 198/165, TG05, OP01-001)",
  "rarity": "rarity level",
  "estimatedValue": estimated USD value as number,
  "language": "en" or "ja"
}

If you truly cannot identify it, return: {"error": "Could not identify card"}`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" },
              },
              { type: "text", text: "Identify this trading card. Carefully read the card name at the top and the collector number at the bottom. This may be a full art, special art rare, or holographic card — look closely at the edges and corners for small text. Tell me exactly what is printed on the card." },
            ],
          },
        ],
        max_completion_tokens: 600,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      if (result.cardNumber) {
        result.cardNumber = cleanCardNumber(result.cardNumber);
      }

      console.log(`[AI Result] game=${result.game} name="${result.name}" setId="${result.setId}" setName="${result.setName}" cardNumber="${result.cardNumber}" rarity="${result.rarity}" lang="${result.language}"`);

      if (!result.error && result.language && result.language !== "en") {
        return res.json({
          error: `${result.language === "ja" ? "Japanese" : "Non-English"} card support coming soon! We detected a ${result.language === "ja" ? "Japanese" : result.language} ${result.game ? result.game.charAt(0).toUpperCase() + result.game.slice(1) : ""} card. Currently only English cards are supported.`,
          languageNotSupported: true,
          detectedLanguage: result.language,
        });
      }

      if (!result.error && result.game) {
        const lang = result.language === "ja" ? "ja" : "en";

        if (result.setId) {
          try {
            const resolvedSetId = await resolveSetId(result.game, result.setId, result.setName, lang);
            if (resolvedSetId) {
              console.log(`[SetResolve] ${result.setId} -> ${resolvedSetId}`);
              result.setId = resolvedSetId;
            }
          } catch (e) {
            console.error("Error resolving set ID:", e);
          }
        }

        result.verified = false;
        try {
          const deepResult = await deepVerifyCard(result);
          console.log(`[DeepVerify Result] verified=${deepResult.verified} name="${deepResult.name}" cardId="${deepResult.cardId}" setId="${deepResult.setId}"`);

          result.verified = deepResult.verified;
          result.name = deepResult.name || result.name;
          if (deepResult.cardId) result.verifiedCardId = deepResult.cardId;
          if (deepResult.setId && deepResult.verified) {
            result.setId = deepResult.setId;
            const sets = await fetchSetsForGame(result.game, lang);
            let setName: string | null = null;
            if (result.game === "pokemon") {
              const s = sets.find((s: any) => s.id === deepResult.setId);
              if (s) setName = s.name;
            } else if (result.game === "yugioh") {
              const s = sets.find((s: any) => s.set_code === deepResult.setId);
              if (s) setName = s.set_name;
            } else if (result.game === "onepiece") {
              const s = sets.find((s: any) => s.id === deepResult.setId || s.set_id === deepResult.setId);
              if (s) setName = s.name || s.set_name;
            } else if (result.game === "mtg") {
              const s = sets.find((s: any) => s.code === deepResult.setId);
              if (s) setName = s.name;
            }
            if (setName) result.setName = setName;
          }

          if (result.language === "ja" && result.game === "pokemon" && deepResult.verified && deepResult.cardId) {
            try {
              const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${deepResult.cardId}`);
              if (enRes.ok) {
                const enCard = await enRes.json();
                if (enCard.name) result.englishName = enCard.name;
                if (enCard.set?.name) result.englishSetName = enCard.set.name;
              }
            } catch {}
            if (!result.englishName) {
              const jaToEnSetMap: Record<string, string> = {
                "SV2a": "sv03.5", "SV1a": "sv01", "SV1s": "sv01", "SV1v": "sv01",
                "SV3": "sv02", "SV3a": "sv02", "SV4": "sv03", "SV4a": "sv03",
                "SV4K": "sv04", "SV5a": "sv04.5", "SV5K": "sv04", "SV5M": "sv04",
                "SV6": "sv05", "SV6a": "sv05", "SV7": "sv06", "SV7a": "sv06",
                "SV8": "sv07", "SV8a": "sv07",
              };
              const enSetId = jaToEnSetMap[deepResult.setId || result.setId];
              if (enSetId && result.cardNumber) {
                const cleanNum = cleanCardNumber(result.cardNumber);
                const paddedNum = cleanNum.length < 3 ? cleanNum.padStart(3, "0") : cleanNum;
                try {
                  const enMappedRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${enSetId}-${paddedNum}`);
                  if (enMappedRes.ok) {
                    const enMappedCard = await enMappedRes.json();
                    if (enMappedCard.name) result.englishName = enMappedCard.name;
                    if (enMappedCard.set?.name) result.englishSetName = enMappedCard.set.name;
                  }
                } catch {}
              }
            }
          }
        } catch (e) {
          console.error("Error in deep verify:", e);
        }
      }

      if (!result.verified && !result.error && result.game) {
        console.log(`[Retry] First pass failed verification for "${result.name}" (${result.game}), attempting second pass...`);
        try {
          const retryResponse = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: [
              {
                role: "system",
                content: `You are an expert TCG card identifier. A previous attempt to identify this card produced: name="${result.name}", game="${result.game}", setId="${result.setId}", cardNumber="${result.cardNumber}". However, this could NOT be verified in the card database.

The card might be a special variant (full art, SAR, alt art, secret rare, mega, ex, GX, V, VMAX, VSTAR, etc.) where the name or number was misread.

LOOK AGAIN very carefully:
1. RE-READ THE CARD NAME at the top — look at every letter. For full art cards, the name box is small and may be at the very top edge. Include any suffix (ex, EX, GX, V, VMAX, VSTAR, etc.)
2. RE-READ THE COLLECTOR NUMBER at the bottom — zoom in mentally on the bottom-left or bottom-right area. The number might be hard to see against the art. Read ALL digits exactly.
3. RECONSIDER THE SET — could the set code be different? Look for any set marking near the collector number.
4. Check if you may have confused similar-looking characters (e.g., 8 vs 6, 1 vs 7, 5 vs S)

Return ONLY valid JSON with your corrected identification:
{
  "game": "pokemon" | "yugioh" | "onepiece" | "mtg",
  "name": "corrected card name",
  "setName": "set name",
  "setId": "corrected set code",
  "cardNumber": "corrected collector number",
  "rarity": "rarity",
  "estimatedValue": number,
  "language": "en" or "ja"
}`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" },
                  },
                  { type: "text", text: `Re-examine this card. The first read got name="${result.name}" number="${result.cardNumber}" set="${result.setId}" but it could not be verified. Please look again very carefully at the name, collector number, and set code. Pay special attention to any text that might be obscured by artwork or holographic effects.` },
                ],
              },
            ],
            max_completion_tokens: 600,
          });

          const retryContent = retryResponse.choices[0]?.message?.content || "{}";
          const retryCleaned = retryContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const retryResult = JSON.parse(retryCleaned);

          if (retryResult.cardNumber) {
            retryResult.cardNumber = cleanCardNumber(retryResult.cardNumber);
          }

          console.log(`[Retry AI] name="${retryResult.name}" setId="${retryResult.setId}" num="${retryResult.cardNumber}"`);

          const nameChanged = retryResult.name && retryResult.name !== result.name;
          const numChanged = retryResult.cardNumber && retryResult.cardNumber !== result.cardNumber;
          const setChanged = retryResult.setId && retryResult.setId !== result.setId;

          if (nameChanged || numChanged || setChanged) {
            const retryMerged = { ...result, ...retryResult };
            const lang = retryMerged.language === "ja" ? "ja" : "en";

            if (retryMerged.setId) {
              try {
                const resolvedSetId = await resolveSetId(retryMerged.game, retryMerged.setId, retryMerged.setName, lang);
                if (resolvedSetId) retryMerged.setId = resolvedSetId;
              } catch {}
            }

            try {
              const retryDeep = await deepVerifyCard(retryMerged);
              console.log(`[Retry DeepVerify] verified=${retryDeep.verified} name="${retryDeep.name}" cardId="${retryDeep.cardId}"`);

              if (retryDeep.verified) {
                result.verified = true;
                result.name = retryDeep.name || retryMerged.name;
                result.setId = retryDeep.setId || retryMerged.setId;
                result.setName = retryMerged.setName || result.setName;
                result.cardNumber = retryMerged.cardNumber || result.cardNumber;
                result.rarity = retryMerged.rarity || result.rarity;
                if (retryDeep.cardId) result.verifiedCardId = retryDeep.cardId;

                if (result.language === "ja" && result.game === "pokemon" && retryDeep.cardId) {
                  try {
                    const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${retryDeep.cardId}`);
                    if (enRes.ok) {
                      const enCard = await enRes.json();
                      if (enCard.name) result.englishName = enCard.name;
                      if (enCard.set?.name) result.englishSetName = enCard.set.name;
                    }
                  } catch {}
                }
              }
            } catch (e) {
              console.error("Retry deep verify error:", e);
            }
          }
        } catch (e) {
          console.error("Retry identification error:", e);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error identifying card:", error);
      res.status(500).json({ error: "Failed to identify card" });
    }
  });

  app.post("/api/correct-card", async (req, res) => {
    try {
      const { game, name, cardNumber, setId, language } = req.body;
      if (!game) {
        return res.status(400).json({ error: "Game is required" });
      }

      const lang = language === "ja" ? "ja" : "en";
      console.log(`[Correct] game=${game} name="${name}" num="${cardNumber}" setId="${setId}" lang=${lang}`);

      const correctionInput: any = {
        game,
        name: name || "",
        setId: setId || "",
        cardNumber: cardNumber ? cleanCardNumber(cardNumber) : "",
        language: lang,
      };

      if (correctionInput.setId) {
        try {
          const resolvedSetId = await resolveSetId(game, correctionInput.setId, "", lang);
          if (resolvedSetId) {
            console.log(`[Correct SetResolve] ${correctionInput.setId} -> ${resolvedSetId}`);
            correctionInput.setId = resolvedSetId;
          }
        } catch {}
      }

      const deepResult = await deepVerifyCard(correctionInput);
      console.log(`[Correct DeepVerify] verified=${deepResult.verified} name="${deepResult.name}" cardId="${deepResult.cardId}" setId="${deepResult.setId}"`);

      if (deepResult.verified) {
        const result: any = {
          game,
          name: deepResult.name,
          setId: deepResult.setId || correctionInput.setId,
          cardNumber: correctionInput.cardNumber,
          verified: true,
          verifiedCardId: deepResult.cardId,
          language: lang,
        };

        if (deepResult.setId) {
          const sets = await fetchSetsForGame(game, lang);
          let setName: string | null = null;
          if (game === "pokemon") {
            const s = sets.find((s: any) => s.id === deepResult.setId);
            if (s) setName = s.name;
          } else if (game === "yugioh") {
            const s = sets.find((s: any) => s.set_code === deepResult.setId);
            if (s) setName = s.set_name;
          } else if (game === "onepiece") {
            const s = sets.find((s: any) => s.id === deepResult.setId || s.set_id === deepResult.setId);
            if (s) setName = s.name || s.set_name;
          } else if (game === "mtg") {
            const s = sets.find((s: any) => s.code === deepResult.setId);
            if (s) setName = s.name;
          }
          if (setName) result.setName = setName;
        }

        if (lang === "ja" && game === "pokemon" && deepResult.cardId) {
          try {
            const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${deepResult.cardId}`);
            if (enRes.ok) {
              const enCard = await enRes.json();
              if (enCard.name) result.englishName = enCard.name;
              if (enCard.set?.name) result.englishSetName = enCard.set.name;
            }
          } catch {}
        }

        res.json(result);
      } else {
        res.json({ verified: false, error: "Could not find a matching card with the provided details" });
      }
    } catch (error) {
      console.error("Error correcting card:", error);
      res.status(500).json({ error: "Failed to search for card" });
    }
  });

  app.post("/api/search-cards", async (req, res) => {
    try {
      const { game, query, setName, cardNumber } = req.body;
      if (!game) {
        return res.status(400).json({ error: "Game is required" });
      }
      if (!query && !cardNumber) {
        return res.status(400).json({ error: "Card name or card number is required" });
      }

      const cleanNumber = cardNumber ? cardNumber.replace(/^0+/, "").split("/")[0].replace(/^0+/, "") : "";

      console.log(`[SearchCards] game=${game} query="${query || ""}" setName="${setName || ""}" cardNumber="${cardNumber || ""}"`);
      const results: any[] = [];
      const limit = 20;

      const matchesNumber = (localId: string) => {
        if (!cleanNumber) return true;
        const cleanLocal = (localId || "").replace(/^0+/, "");
        return cleanLocal === cleanNumber;
      };

      if (game === "pokemon") {
        const lang = "en";
        let cards: any[] = [];
        if (query) {
          try {
            const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(query)}`);
            if (r.ok) cards = await r.json();
          } catch {}
          if ((!cards || cards.length === 0) && query.split(/\s+/).length > 1) {
            const partial = query.split(/\s+/).slice(0, -1).join(" ");
            try {
              const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(partial)}`);
              if (r.ok) cards = await r.json();
            } catch {}
          }
        } else if (cleanNumber) {
          try {
            const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?localId=${encodeURIComponent(cardNumber.split("/")[0])}`);
            if (r.ok) cards = await r.json();
          } catch {}
        }
        if (Array.isArray(cards)) {
          const sets = await fetchSetsForGame("pokemon", lang);
          const setMap: Record<string, string> = {};
          for (const s of sets) setMap[s.id] = s.name;

          for (const c of cards.slice(0, 100)) {
            if (!matchesNumber(c.localId)) continue;
            const cardSetId = extractPokemonSetId(c.id, "");
            const cardSetName = setMap[cardSetId] || cardSetId;
            if (setName) {
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (!norm(cardSetName).includes(norm(setName)) && !norm(setName).includes(norm(cardSetName))) continue;
            }
            results.push({
              game: "pokemon",
              name: c.name,
              cardId: c.id,
              localId: c.localId,
              setId: cardSetId,
              setName: cardSetName,
              image: c.image ? `${c.image}/high.png` : null,
            });
            if (results.length >= limit) break;
          }
        }
      } else if (game === "yugioh") {
        let cards: any[] = [];
        if (query) {
          try {
            const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}&num=20&offset=0`);
            if (r.ok) {
              const data = await r.json();
              if (data?.data) cards = data.data;
            }
          } catch {}
        }
        const sets = await fetchSetsForGame("yugioh");
        const setMap: Record<string, string> = {};
        for (const s of sets) setMap[s.set_code] = s.set_name;

        for (const card of cards.slice(0, limit)) {
          if (card.card_sets && card.card_sets.length > 0) {
            const seenSets = new Set<string>();
            for (const cs of card.card_sets) {
              const setCode = cs.set_code?.split("-")[0] || "";
              const localId = cs.set_code?.split("-").pop() || "";
              if (!matchesNumber(localId)) continue;
              if (seenSets.has(setCode)) continue;
              seenSets.add(setCode);
              const cardSetName = setMap[setCode] || cs.set_name || setCode;
              if (setName) {
                const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (!norm(cardSetName).includes(norm(setName)) && !norm(setName).includes(norm(cardSetName))) continue;
              }
              results.push({
                game: "yugioh",
                name: card.name,
                cardId: cs.set_code,
                localId,
                setId: setCode,
                setName: cardSetName,
                rarity: cs.set_rarity,
                image: card.card_images?.[0]?.image_url_small || null,
              });
              if (results.length >= limit) break;
            }
          } else {
            results.push({
              game: "yugioh",
              name: card.name,
              cardId: card.id?.toString(),
              localId: "",
              setId: "",
              setName: "Unknown Set",
              image: card.card_images?.[0]?.image_url_small || null,
            });
          }
          if (results.length >= limit) break;
        }
      } else if (game === "onepiece") {
        let found: any[] = [];
        if (query) {
          try {
            const r = await fetch(`https://optcgapi.com/api/cards/search/${encodeURIComponent(query)}/`);
            if (r.ok) {
              const data = await r.json();
              if (Array.isArray(data)) found = data;
            }
          } catch {}
        }
        const sets = await fetchSetsForGame("onepiece");
        const setMap: Record<string, string> = {};
        for (const s of sets) setMap[s.id] = s.name;

        for (const c of found.slice(0, limit)) {
          const localId = c.card_set_id?.split("-").pop() || "";
          if (!matchesNumber(localId)) continue;
          const cardSetId = c.set_id || c.card_set_id?.split("-").slice(0, -1).join("-") || "";
          const cardSetName = setMap[cardSetId] || cardSetId;
          if (setName) {
            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!norm(cardSetName).includes(norm(setName)) && !norm(setName).includes(norm(cardSetName))) continue;
          }
          results.push({
            game: "onepiece",
            name: c.card_name,
            cardId: c.card_set_id,
            localId,
            setId: cardSetId,
            setName: cardSetName,
            image: c.image_url || null,
          });
        }
      } else if (game === "mtg") {
        let cards: any[] = [];
        let scryfallQuery = query || "";
        if (cleanNumber) {
          scryfallQuery += ` number:${cardNumber.split("/")[0]}`;
        }
        scryfallQuery = scryfallQuery.trim();
        if (scryfallQuery) {
          try {
            const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&unique=prints&order=released&dir=desc`);
            if (r.ok) {
              const data = await r.json();
              if (data?.data) cards = data.data;
            }
          } catch {}
        }
        for (const card of cards.slice(0, limit)) {
          const cardSetName = card.set_name || card.set || "";
          if (setName) {
            const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!norm(cardSetName).includes(norm(setName)) && !norm(setName).includes(norm(cardSetName))) continue;
          }
          results.push({
            game: "mtg",
            name: card.name,
            cardId: card.id,
            localId: card.collector_number || "",
            setId: card.set,
            setName: cardSetName,
            image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
          });
        }
      }

      console.log(`[SearchCards] Returning ${results.length} results`);
      res.json({ results: results.slice(0, limit) });
    } catch (error) {
      console.error("Search cards error:", error);
      res.status(500).json({ error: "Failed to search for cards" });
    }
  });

  // ───── POKEMON (TCGdex API) ─────

  app.get("/api/tcg/pokemon/sets", async (req, res) => {
    try {
      const lang = req.query.lang === "ja" ? "ja" : "en";
      const response = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
      const sets = await response.json();
      const seen = new Set<string>();
      const phantomSets = new Set(["wp", "jumbo"]);
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
          if (phantomSets.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });

      const setIds = formatted.map((s: any) => s.id);
      const releaseDates = await fetchPokemonReleaseDates(setIds, lang);
      for (const s of formatted) {
        if (!s.releaseDate && releaseDates[s.id]) {
          s.releaseDate = releaseDates[s.id];
        }
      }

      formatted.sort((a: any, b: any) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
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

      let englishNameMap: Record<string, string> = {};
      if (lang === "ja") {
        try {
          const enResponse = await fetch(`https://api.tcgdex.net/v2/en/sets/${id}`);
          if (enResponse.ok) {
            const enData = await enResponse.json();
            if (enData?.cards) {
              for (const c of enData.cards) {
                englishNameMap[c.localId] = c.name;
              }
            }
          }
        } catch {}
        if (Object.keys(englishNameMap).length === 0) {
          const jaToEnSetMap: Record<string, string> = {
            "SV2a": "sv03.5", "SV1a": "sv01", "SV1s": "sv01", "SV1v": "sv01",
            "SV3": "sv02", "SV3a": "sv02", "SV4": "sv03", "SV4a": "sv03",
            "SV4K": "sv04", "SV5a": "sv04.5", "SV5K": "sv04", "SV5M": "sv04",
            "SV6": "sv05", "SV6a": "sv05", "SV7": "sv06", "SV7a": "sv06",
            "SV8": "sv07", "SV8a": "sv07",
          };
          const enSetId = jaToEnSetMap[id];
          if (enSetId) {
            try {
              const enMappedRes = await fetch(`https://api.tcgdex.net/v2/en/sets/${enSetId}`);
              if (enMappedRes.ok) {
                const enMappedData = await enMappedRes.json();
                if (enMappedData?.cards) {
                  for (const c of enMappedData.cards) {
                    englishNameMap[c.localId] = c.name;
                  }
                }
              }
            } catch {}
          }
        }
      }

      const cards = setData.cards.map((c: any) => ({
        id: c.id,
        localId: c.localId,
        name: c.name,
        englishName: lang === "ja" ? (englishNameMap[c.localId] || null) : null,
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
      formatted.sort((a: any, b: any) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
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

      const cards = allCards.map((c: any) => {
        const prices = c.prices || {};
        const price = prices.usd ? parseFloat(prices.usd)
          : (prices.usd_foil ? parseFloat(prices.usd_foil)
          : (prices.eur ? Math.round(parseFloat(prices.eur) * 108) / 100 : null));
        return {
          id: c.id,
          localId: c.collector_number || "0",
          name: c.name,
          image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
          price,
        };
      });

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

  // ───── SET PRICES ENDPOINT ─────

  const setPriceCache = new Map<string, { prices: Record<string, number | null>; ts: number }>();
  const SET_PRICE_CACHE_TTL = 30 * 60 * 1000;

  app.get("/api/tcg/:game/sets/:id/prices", async (req, res) => {
    try {
      const { game, id } = req.params;
      const lang = req.query.lang === "ja" ? "ja" : "en";
      const forceRefresh = req.query.forceRefresh === "true";
      const cacheKey = `${game}:${id}:${lang}`;
      if (!forceRefresh) {
        const cached = setPriceCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < SET_PRICE_CACHE_TTL) {
          return res.json({ prices: cached.prices });
        }
      }

      const prices: Record<string, number | null> = {};

      if (game === "pokemon") {
        const setRes = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${id}`);
        if (!setRes.ok) return res.json({ prices: {} });
        const setData = await setRes.json();
        const cardIds = (setData.cards || []).map((c: any) => c.id);
        const batchSize = 5;
        for (let i = 0; i < cardIds.length; i += batchSize) {
          const batch = cardIds.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map(async (cid: string) => {
              const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(cid)}`);
              if (!r.ok) return { id: cid, price: null };
              const c = await r.json();
              const tcgPrice = c.pricing?.tcgplayer;
              const cmPrice = c.pricing?.cardmarket;
              const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
              const usdPrice = priceData?.marketPrice ?? priceData?.midPrice ?? null;
              const price = usdPrice ?? (cmPrice?.trend ? Math.round(cmPrice.trend * 108) / 100
                : (cmPrice?.avg ? Math.round(cmPrice.avg * 108) / 100 : null));
              return { id: cid, price };
            })
          );
          for (const r of results) {
            if (r.status === "fulfilled") prices[r.value.id] = r.value.price;
          }
          if (i + batchSize < cardIds.length) await new Promise(r => setTimeout(r, 100));
        }
      } else if (game === "yugioh") {
        const allSets = await fetchSetsForGame("yugioh");
        const setMeta = (allSets as any[]).find((s: any) => s.set_code === id);
        const setName = setMeta?.set_name || id;
        const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`);
        const data = await response.json();
        if (data?.data) {
          for (const card of data.data) {
            if (!card.card_sets) continue;
            for (const cs of card.card_sets) {
              if (cs.set_code?.startsWith(id)) {
                const setPrice = cs.set_price ? parseFloat(cs.set_price) : null;
                const tcgPrice = card.card_prices?.[0]?.tcgplayer_price ? parseFloat(card.card_prices[0].tcgplayer_price) : null;
                prices[cs.set_code] = (setPrice && setPrice > 0) ? setPrice : tcgPrice;
              }
            }
          }
        }
      } else if (game === "onepiece") {
        const setRes = await fetch(`https://optcgapi.com/api/sets/card-list/?set_id=${id}`);
        if (setRes.ok) {
          const data = await setRes.json();
          if (Array.isArray(data)) {
            for (const c of data) {
              const cardId = c.card_id || c.id;
              if (cardId) prices[cardId] = c.market_price ?? c.inventory_price ?? null;
            }
          }
        }
      } else if (game === "mtg") {
        const allCards: any[] = [];
        let url: string | null = `https://api.scryfall.com/cards/search?order=set&q=set:${encodeURIComponent(id)}&unique=prints`;
        while (url) {
          const pageRes: Response = await fetch(url);
          if (!pageRes.ok) break;
          const pageData: any = await pageRes.json();
          if (pageData.data) {
            for (const c of pageData.data) {
              const p = c.prices || {};
              const price = p.usd ? parseFloat(p.usd)
                : (p.usd_foil ? parseFloat(p.usd_foil)
                : (p.eur ? Math.round(parseFloat(p.eur) * 108) / 100 : null));
              prices[c.id] = price;
            }
          }
          url = pageData.has_more ? pageData.next_page : null;
          if (url) await new Promise(r => setTimeout(r, 100));
        }
      }

      setPriceCache.set(cacheKey, { prices, ts: Date.now() });
      res.json({ prices });
    } catch (error) {
      console.error("Error fetching set prices:", error);
      res.json({ prices: {} });
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

      let englishName: string | null = null;
      let englishSetName: string | null = null;
      let englishDescription: string | null = null;
      let enCard: any = null;

      if (lang === "ja") {
        const jaToEnSetMap: Record<string, string> = {
          "SV2a": "sv03.5", "SV1a": "sv01", "SV1s": "sv01", "SV1v": "sv01",
          "SV3": "sv02", "SV3a": "sv02", "SV4": "sv03", "SV4a": "sv03",
          "SV4K": "sv04", "SV5a": "sv04.5", "SV5K": "sv04", "SV5M": "sv04",
          "SV6": "sv05", "SV6a": "sv05", "SV7": "sv06", "SV7a": "sv06",
          "SV8": "sv07", "SV8a": "sv07",
        };
        try {
          const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${cardId}`);
          if (enRes.ok) {
            enCard = await enRes.json();
          }
        } catch {}
        if (!enCard?.name) {
          const jaSetId = c.set?.id || "";
          const enSetId = jaToEnSetMap[jaSetId];
          if (enSetId && c.localId) {
            try {
              const enMappedRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${enSetId}-${c.localId}`);
              if (enMappedRes.ok) {
                enCard = await enMappedRes.json();
              }
            } catch {}
          }
        }
        if (enCard) {
          englishName = enCard.name || null;
          englishSetName = enCard.set?.name || null;
          englishDescription = enCard.attacks?.map((a: any) => `${a.name}: ${a.effect || `${a.damage} damage`}`).join("\n") ||
            enCard.abilities?.map((a: any) => `${a.name}: ${a.effect}`).join("\n") || null;
        }
      }

      const sourceCard = (lang === "ja" && enCard?.pricing) ? enCard : c;
      const tcgPrice = sourceCard.pricing?.tcgplayer;
      const cmPrice = sourceCard.pricing?.cardmarket;
      const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
      const currentPrice = priceData?.marketPrice ?? priceData?.midPrice
        ?? (cmPrice?.trend ? Math.round(cmPrice.trend * 108) / 100
        : (cmPrice?.avg ? Math.round(cmPrice.avg * 108) / 100
        : (cmPrice?.avg30 ? Math.round(cmPrice.avg30 * 108) / 100 : null)));
      const priceLow = priceData?.lowPrice ?? (cmPrice?.low ? Math.round(cmPrice.low * 108) / 100 : null);
      const priceHigh = priceData?.highPrice ?? null;

      const jaDescription = c.attacks?.map((a: any) => `${a.name}: ${a.effect || `${a.damage} damage`}`).join("\n") ||
        c.abilities?.map((a: any) => `${a.name}: ${a.effect}`).join("\n") || null;

      res.json({
        id: c.id,
        localId: c.localId,
        name: c.name,
        englishName,
        image: c.image ? `${c.image}/high.png` : null,
        game: "pokemon",
        setId: c.set?.id || "",
        setName: c.set?.name || "",
        englishSetName,
        rarity: c.rarity || null,
        cardType: c.stage || (c.types ? c.types.join(", ") : null),
        hp: c.hp || null,
        description: englishDescription || jaDescription,
        artist: c.illustrator || null,
        currentPrice,
        priceUnit: "USD",
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
      const currentPrice = prices.usd ? parseFloat(prices.usd)
        : (prices.usd_foil ? parseFloat(prices.usd_foil)
        : (prices.eur ? Math.round(parseFloat(prices.eur) * 108) / 100
        : (prices.eur_foil ? Math.round(parseFloat(prices.eur_foil) * 108) / 100 : null)));
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

  // ───── COLLECTION CARD METADATA (batch) ─────

  const cardMetaCache = new Map<string, { name: string; image: string | null; setName: string; rarity: string | null; game: string; ts: number }>();
  const CARD_META_CACHE_TTL = 60 * 60 * 1000;

  app.post("/api/collection/cards-meta", async (req, res) => {
    try {
      const { cards } = req.body;
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "Cards array is required" });
      }

      const limited = cards.slice(0, 200);
      const results: { cardId: string; game: string; name: string; image: string | null; setName: string; rarity: string | null }[] = [];

      async function fetchMeta(card: { game: string; cardId: string }) {
        const cacheKey = `${card.game}:${card.cardId}`;
        const cached = cardMetaCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CARD_META_CACHE_TTL) {
          return { cardId: card.cardId, game: card.game, name: cached.name, image: cached.image, setName: cached.setName, rarity: cached.rarity };
        }

        let name = card.cardId;
        let image: string | null = null;
        let setName = "";
        let rarity: string | null = null;

        try {
          if (card.game === "pokemon") {
            const r = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.cardId)}`);
            if (r.ok) {
              const c = await r.json();
              name = c.name || card.cardId;
              image = c.image ? `${c.image}/high.png` : null;
              setName = c.set?.name || "";
              rarity = c.rarity || null;
            }
          } else if (card.game === "yugioh") {
            const parts = card.cardId.split("-");
            const ygId = parts.length > 1 ? parts[1] : card.cardId;
            const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(ygId)}`);
            if (r.ok) {
              const data = await r.json();
              const c = data.data?.[0];
              if (c) {
                name = c.name || card.cardId;
                image = c.card_images?.[0]?.image_url || null;
                rarity = c.card_sets?.[0]?.set_rarity_code || null;
                setName = c.card_sets?.[0]?.set_name || "";
              }
            }
          } else if (card.game === "onepiece") {
            const r = await fetch(`https://apitcg.com/api/one-piece/cards/${encodeURIComponent(card.cardId)}`);
            if (r.ok) {
              const c = await r.json();
              name = c.name || card.cardId;
              image = c.image || null;
              rarity = c.rarity || null;
              setName = c.set?.name || "";
            }
          } else if (card.game === "mtg") {
            const r = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(card.cardId)}`);
            if (r.ok) {
              const c = await r.json();
              name = c.name || card.cardId;
              image = c.image_uris?.normal || c.image_uris?.small || (c.card_faces?.[0]?.image_uris?.normal) || null;
              rarity = c.rarity || null;
              setName = c.set_name || "";
            }
          }
        } catch {}

        cardMetaCache.set(cacheKey, { name, image, setName, rarity, game: card.game, ts: Date.now() });
        return { cardId: card.cardId, game: card.game, name, image, setName, rarity };
      }

      const CONCURRENCY = 8;
      for (let i = 0; i < limited.length; i += CONCURRENCY) {
        const batch = limited.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(fetchMeta));
        results.push(...batchResults);
      }

      res.json({ cards: results });
    } catch (error) {
      console.error("Error fetching card metadata:", error);
      res.status(500).json({ error: "Failed to fetch card metadata" });
    }
  });

  // ───── COLLECTION VALUE ─────

  const priceCache = new Map<string, { name: string; price: number | null; ts: number }>();
  const PRICE_CACHE_TTL = 30 * 60 * 1000;

  app.post("/api/collection/value", async (req, res) => {
    try {
      const { cards, forceRefresh } = req.body;
      if (forceRefresh) {
        priceCache.clear();
      }
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "Cards array is required" });
      }

      const jaToEnSetMap: Record<string, string> = {
        "SV2a": "sv03.5", "SV1a": "sv01", "SV1s": "sv01", "SV1v": "sv01",
        "SV3": "sv02", "SV3a": "sv02", "SV4": "sv03", "SV4a": "sv03",
        "SV4K": "sv04", "SV5a": "sv04.5", "SV5K": "sv04", "SV5M": "sv04",
        "SV6": "sv05", "SV6a": "sv05", "SV7": "sv06", "SV7a": "sv06",
        "SV8": "sv07", "SV8a": "sv07",
      };

      function extractPokemonPrice(c: any): number | null {
        const tcgPrice = c.pricing?.tcgplayer;
        const cmPrice = c.pricing?.cardmarket;
        const priceData = tcgPrice?.holofoil || tcgPrice?.normal || tcgPrice?.reverseHolofoil;
        const usdPrice = priceData?.marketPrice ?? priceData?.midPrice ?? null;
        if (usdPrice != null) return usdPrice;
        if (cmPrice?.trend) return Math.round(cmPrice.trend * 108) / 100;
        if (cmPrice?.avg) return Math.round(cmPrice.avg * 108) / 100;
        if (cmPrice?.avg30) return Math.round(cmPrice.avg30 * 108) / 100;
        return null;
      }

      async function fetchMtgBatch(mtgCards: { game: string; cardId: string }[]): Promise<{ cardId: string; name: string; price: number | null }[]> {
        if (mtgCards.length === 0) return [];
        const identifiers = mtgCards.map(c => ({ id: c.cardId }));
        const chunkSize = 75;
        const allResults: { cardId: string; name: string; price: number | null }[] = [];
        for (let i = 0; i < identifiers.length; i += chunkSize) {
          const chunk = identifiers.slice(i, i + chunkSize);
          const chunkCards = mtgCards.slice(i, i + chunkSize);
          try {
            const response = await fetch("https://api.scryfall.com/cards/collection", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ identifiers: chunk }),
            });
            if (response.ok) {
              const data = await response.json();
              const foundMap = new Map<string, any>();
              for (const c of (data.data || [])) {
                foundMap.set(c.id, c);
              }
              for (const card of chunkCards) {
                const c = foundMap.get(card.cardId);
                if (c) {
                  const prices = c.prices || {};
                  const price = prices.usd ? parseFloat(prices.usd) : (prices.usd_foil ? parseFloat(prices.usd_foil) : (prices.eur ? Math.round(parseFloat(prices.eur) * 108) / 100 : null));
                  allResults.push({ cardId: card.cardId, name: c.name || card.cardId, price });
                } else {
                  allResults.push({ cardId: card.cardId, name: card.cardId, price: null });
                }
              }
            } else {
              for (const card of chunkCards) {
                allResults.push({ cardId: card.cardId, name: card.cardId, price: null });
              }
            }
          } catch {
            for (const card of chunkCards) {
              allResults.push({ cardId: card.cardId, name: card.cardId, price: null });
            }
          }
          if (i + chunkSize < identifiers.length) await new Promise(r => setTimeout(r, 100));
        }
        return allResults;
      }

      async function fetchCardPrice(card: { game: string; cardId: string }): Promise<{ cardId: string; name: string; price: number | null }> {
        const cacheKey = `${card.game}:${card.cardId}`;
        const cached = priceCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) {
          return { cardId: card.cardId, name: cached.name, price: cached.price };
        }

        let result: { cardId: string; name: string; price: number | null } = { cardId: card.cardId, name: card.cardId, price: null };

        if (card.game === "pokemon") {
          const response = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.cardId)}`);
          if (response.ok) {
            const c = await response.json();
            const price = extractPokemonPrice(c);
            if (price != null) {
              result = { cardId: card.cardId, name: c.name || card.cardId, price };
            } else if (c.name) {
              result = { cardId: card.cardId, name: c.name, price: null };
            }
          }
          if (result.price == null) {
            const parts = card.cardId.split("-");
            if (parts.length >= 2) {
              const setCode = parts.slice(0, -1).join("-");
              const localId = parts[parts.length - 1];
              const enSetId = jaToEnSetMap[setCode];
              if (enSetId) {
                try {
                  const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${enSetId}-${localId}`);
                  if (enRes.ok) {
                    const c = await enRes.json();
                    const price = extractPokemonPrice(c);
                    if (price != null) result = { cardId: card.cardId, name: c.name || result.name, price };
                    else if (c.name && result.name === card.cardId) result.name = c.name;
                  }
                } catch (_) {}
              }
              if (result.price == null) {
                try {
                  const setRes = await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(setCode)}`);
                  if (setRes.ok) {
                    const setData = await setRes.json();
                    const match = setData.cards?.find((c: any) => c.localId === localId);
                    if (match) {
                      if (result.name === card.cardId && match.name) result.name = match.name;
                      const cardRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(match.id)}`);
                      if (cardRes.ok) {
                        const c = await cardRes.json();
                        const price = extractPokemonPrice(c);
                        if (price != null) result = { cardId: card.cardId, name: c.name || result.name, price };
                        else if (c.name) result.name = c.name;
                      }
                    }
                  }
                } catch (_) {}
              }
            }
          }
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
          if (data?.data) {
            const found = data.data.find((c: any) =>
              c.card_sets?.some((s: any) => s.set_code === card.cardId)
            );
            if (found) {
              const setInfo = found.card_sets?.find((s: any) => s.set_code === card.cardId);
              const price = setInfo?.set_price ? parseFloat(setInfo.set_price) : null;
              const prices = found.card_prices?.[0] || {};
              const currentPrice = price && price > 0 ? price :
                (prices.tcgplayer_price ? parseFloat(prices.tcgplayer_price) : null);
              result = { cardId: card.cardId, name: found.name || card.cardId, price: currentPrice };
            }
          }
        } else if (card.game === "onepiece") {
          const response = await fetch(`https://optcgapi.com/api/sets/card/${card.cardId}/`);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              const c = data[0];
              const price = c.market_price ?? c.inventory_price ?? null;
              result = { cardId: card.cardId, name: c.card_name || card.cardId, price };
            }
          }
        }

        priceCache.set(cacheKey, { name: result.name, price: result.price, ts: Date.now() });
        return result;
      }

      const mtgCards = cards.filter(c => c.game === "mtg");
      const otherCards = cards.filter(c => c.game !== "mtg");

      const mtgResults = await fetchMtgBatch(mtgCards);
      for (const r of mtgResults) {
        priceCache.set(`mtg:${r.cardId}`, { name: r.name, price: r.price, ts: Date.now() });
      }

      const batchSize = 5;
      const otherResults: { cardId: string; name: string; price: number | null }[] = [];
      for (let i = 0; i < otherCards.length; i += batchSize) {
        const batch = otherCards.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map(fetchCardPrice));
        for (let j = 0; j < settled.length; j++) {
          const result = settled[j];
          if (result.status === "fulfilled") {
            otherResults.push(result.value);
          } else {
            otherResults.push({ cardId: batch[j].cardId, name: batch[j].cardId, price: null });
          }
        }
        if (i + batchSize < otherCards.length) await new Promise(r => setTimeout(r, 100));
      }

      const resultMap = new Map<string, { cardId: string; name: string; price: number | null }>();
      for (const r of [...mtgResults, ...otherResults]) {
        resultMap.set(r.cardId, r);
      }
      const results = cards.map(c => resultMap.get(c.cardId) || { cardId: c.cardId, name: c.cardId, price: null });

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

