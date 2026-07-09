import { getGameFromCache, saveGameToCache } from './cache';

const STEAM_API_KEY = process.env.STEAM_API_KEY;

export interface SteamUser {
  input: string;
  steamId: string;
  vanityName?: string;
  displayName: string;
  avatarUrl?: string;
  isPrivate: boolean;
}

export interface OwnedGame {
  appId: number;
  name: string;
  playtimeForever: number; // in minutes
  imgIconUrl?: string;
}

export interface FilteredGameResult {
  appId: number;
  name: string;
  coverUrl: string;
  categories: string[];
  playtimes: Record<string, number>; // steamId -> playtime in minutes
  owners: string[]; // list of steamIds who own it
}

const MULTIPLAYER_CATEGORIES = new Set([
  'Multi-player',
  'Co-op',
  'Online Co-op',
  'Shared/Split Screen Co-op',
  'Shared/Split Screen',
  'PvP',
  'Online PvP',
  'Shared/Split Screen PvP',
  'LAN Co-op',
  'LAN PvP',
  'Cross-Platform Multiplayer',
  'Multijoueur',
  'Coopération',
  'Coopération en ligne',
  'Coop locale et écran partagé',
  'Écran partagé',
  'Multijoueur multiplateforme',
  'JcJ en ligne',
  'JcJ en écran partagé',
  'Remote Play Together'
]);

/**
 * Parses user input (URL or username or raw ID) into a clean Steam input.
 */
export function parseSteamInput(input: string): { type: 'id' | 'vanity' | 'unknown'; value: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'unknown', value: '' };
  }

  // Check profiles URL: https://steamcommunity.com/profiles/76561198084700000
  const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/([0-9]+)/i);
  if (profileMatch && profileMatch[1]) {
    return { type: 'id', value: profileMatch[1] };
  }

  // Check id URL: https://steamcommunity.com/id/vanityname
  const idMatch = trimmed.match(/steamcommunity\.com\/id\/([a-zA-Z0-9_\-]+)/i);
  if (idMatch && idMatch[1]) {
    return { type: 'vanity', value: idMatch[1] };
  }

  // Raw SteamID64 (starts with 7656, 17 digits)
  if (/^7656[0-9]{13}$/.test(trimmed)) {
    return { type: 'id', value: trimmed };
  }

  // Otherwise treat as raw vanity/username
  if (/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
    return { type: 'vanity', value: trimmed };
  }

  return { type: 'unknown', value: trimmed };
}

/**
 * Resolves a Steam input to a profile SteamID64, name, and avatar.
 */
export async function resolveSteamProfile(input: string): Promise<SteamUser> {
  if (!STEAM_API_KEY) {
    throw new Error('STEAM_API_KEY is not configured on the server.');
  }

  const parsed = parseSteamInput(input);
  if (parsed.type === 'unknown') {
    throw new Error(`Le format du profil "${input}" n'est pas reconnu.`);
  }

  let steamId = parsed.value;

  // Resolve vanity URL if needed
  if (parsed.type === 'vanity') {
    const vanityUrl = `http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_API_KEY}&vanityurl=${parsed.value}`;
    const res = await fetch(vanityUrl);
    if (!res.ok) {
      throw new Error(`Erreur lors de la communication avec l'API Steam pour résoudre "${parsed.value}".`);
    }

    const data = await res.json();
    if (data?.response?.success === 1) {
      steamId = data.response.steamid;
    } else {
      throw new Error(`Le profil Steam "${parsed.value}" est introuvable.`);
    }
  }

  // Fetch player summary (name, avatar, privacy state)
  const playerSummaryUrl = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`;
  const resSummary = await fetch(playerSummaryUrl);
  if (!resSummary.ok) {
    throw new Error(`Impossible de récupérer les détails du profil pour ${steamId}.`);
  }

  const summaryData = await resSummary.json();
  const player = summaryData?.response?.players?.[0];

  if (!player) {
    throw new Error(`Aucun joueur trouvé avec l'identifiant Steam : ${steamId}.`);
  }

  // communityvisibilitystate: 3 means Public, anything else means Private/Friends only
  const isPrivate = player.communityvisibilitystate !== 3;

  return {
    input,
    steamId,
    vanityName: parsed.type === 'vanity' ? parsed.value : undefined,
    displayName: player.personaname || parsed.value,
    avatarUrl: player.avatarfull || player.avatarmedium || player.avatar,
    isPrivate,
  };
}

/**
 * Fetches the list of games owned by a resolved Steam User.
 */
export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  if (!STEAM_API_KEY) {
    throw new Error('STEAM_API_KEY is not configured.');
  }

  const ownedGamesUrl = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&format=json`;
  
  const res = await fetch(ownedGamesUrl);
  if (!res.ok) {
    throw new Error(`Erreur lors de la récupération des jeux du joueur ${steamId}.`);
  }

  const data = await res.json();
  const response = data?.response;

  // If the games array is missing, the profile is private or game details are hidden
  if (!response || !response.games) {
    throw new Error(`private_profile`);
  }

  return response.games.map((g: any) => ({
    appId: g.appid,
    name: g.name,
    playtimeForever: g.playtime_forever || 0,
    imgIconUrl: g.img_icon_url,
  }));
}

/**
 * Helper delay function.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if a single game is multiplayer by querying Steam Store API, using cache if available.
 */
export async function checkGameMultiplayer(appId: number, gameName: string): Promise<{ isMultiplayer: boolean; categories: string[] }> {
  // 1. Check cache first
  const cached = await getGameFromCache(appId);
  if (cached) {
    return { isMultiplayer: cached.isMultiplayer, categories: cached.categories };
  }

  // 2. Fetch from Steam Store API
  const storeUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=categories&l=french`;
  
  try {
    const res = await fetch(storeUrl);
    if (res.status === 429) {
      console.warn(`Steam API Rate Limit hit for AppID ${appId}. Waiting...`);
      // Thrown to trigger retry or fallback
      throw new Error('rate_limit');
    }

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    const gameData = data?.[appId];

    if (gameData?.success && gameData?.data) {
      const categoriesList: any[] = gameData.data.categories || [];
      const categories = categoriesList.map((c) => c.description);
      
      // Determine if it matches any multiplayer category
      const isMultiplayer = categories.some((c) => MULTIPLAYER_CATEGORIES.has(c));

      // Save to cache
      await saveGameToCache(appId, gameName, isMultiplayer, categories);
      return { isMultiplayer, categories };
    } else {
      // Game details not found or failed success check (e.g. game removed from store or DLC/bundle type)
      // We'll cache as false to avoid repeated calls
      await saveGameToCache(appId, gameName, false, []);
      return { isMultiplayer: false, categories: [] };
    }
  } catch (error: any) {
    if (error.message === 'rate_limit') {
      throw error;
    }
    console.error(`Error checking Steam Store for AppID ${appId} (${gameName}):`, error);
    // Return fallback instead of failing completely, but don't cache so we retry later
    return { isMultiplayer: false, categories: [] };
  }
}

/**
 * Process a batch of app IDs, with throttling and rate-limit handling.
 */
export async function filterMultiplayerGames(
  games: { appId: number; name: string }[]
): Promise<Map<number, { isMultiplayer: boolean; categories: string[] }>> {
  const results = new Map<number, { isMultiplayer: boolean; categories: string[] }>();
  
  // To avoid hammering Steam, we will do sequential requests with a delay for cache misses.
  // Cache hits will be instant.
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        const check = await getGameFromCache(game.appId);
        if (check) {
          results.set(game.appId, { isMultiplayer: check.isMultiplayer, categories: check.categories });
          success = true;
          break;
        }

        // Cache miss: introduce a delay before hitting the store API
        await delay(250); // 250ms spacing
        const result = await checkGameMultiplayer(game.appId, game.name);
        results.set(game.appId, result);
        success = true;
      } catch (error: any) {
        attempts++;
        if (error.message === 'rate_limit') {
          const waitTime = attempts * 1000;
          console.warn(`Throttling Steam Store requests. Retrying in ${waitTime}ms...`);
          await delay(waitTime);
        } else {
          // Non-rate limit error, just skip and record as non-multiplayer
          results.set(game.appId, { isMultiplayer: false, categories: [] });
          success = true;
        }
      }
    }

    if (!success) {
      // Fallback
      results.set(game.appId, { isMultiplayer: false, categories: [] });
    }
  }

  return results;
}
