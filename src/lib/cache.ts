import fs from 'fs';
import path from 'path';

export interface GameCacheEntry {
  appId: number;
  name: string;
  isMultiplayer: boolean;
  categories: string[];
  lastUpdated: number;
}

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'game-cache.json');

// In-memory cache for ultra-fast lookup
let memoryCache: Record<number, GameCacheEntry> = {};
let isCacheLoaded = false;
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Ensures that the cache file and directory exist, and loads it into memory.
 */
async function ensureCacheLoaded(): Promise<void> {
  if (isCacheLoaded) return;

  try {
    if (!fs.existsSync(CACHE_DIR)) {
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    }

    if (fs.existsSync(CACHE_FILE)) {
      const data = await fs.promises.readFile(CACHE_FILE, 'utf-8');
      memoryCache = JSON.parse(data || '{}');
    } else {
      await fs.promises.writeFile(CACHE_FILE, '{}', 'utf-8');
      memoryCache = {};
    }
  } catch (error) {
    console.error('Error loading game cache from file:', error);
    memoryCache = {};
  } finally {
    isCacheLoaded = true;
  }
}

/**
 * Persists the memory cache to the JSON file, queued to prevent concurrent write issues.
 */
async function persistCache(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      }
      await fs.promises.writeFile(CACHE_FILE, JSON.stringify(memoryCache, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing game cache to file:', error);
    }
  });
  return writeQueue;
}

/**
 * Retrieves a game details entry from the cache.
 */
export async function getGameFromCache(appId: number): Promise<GameCacheEntry | null> {
  await ensureCacheLoaded();
  return memoryCache[appId] || null;
}

/**
 * Saves a game's details to both memory and the persistent file.
 */
export async function saveGameToCache(
  appId: number,
  name: string,
  isMultiplayer: boolean,
  categories: string[]
): Promise<GameCacheEntry> {
  await ensureCacheLoaded();

  const entry: GameCacheEntry = {
    appId,
    name,
    isMultiplayer,
    categories,
    lastUpdated: Date.now(),
  };

  memoryCache[appId] = entry;
  // Trigger file save in the background without blocking the request thread
  persistCache().catch((err) => console.error('Background cache persist failed:', err));

  return entry;
}

/**
 * Utility to clear the cache (useful for debugging).
 */
export async function clearCache(): Promise<void> {
  memoryCache = {};
  await persistCache();
}
