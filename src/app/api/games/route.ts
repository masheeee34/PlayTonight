import { NextResponse } from 'next/server';
import {
  resolveSteamProfile,
  getOwnedGames,
  filterMultiplayerGames,
  FilteredGameResult,
  SteamUser,
  OwnedGame
} from '@/lib/steam';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { profiles } = body;

    if (!profiles || !Array.isArray(profiles) || profiles.length < 2 || profiles.length > 5) {
      return NextResponse.json(
        { error: 'Please provide between 2 and 5 Steam profiles.', type: 'invalid_inputs' },
        { status: 400 }
      );
    }

    // 1. Resolve all Steam Profiles
    const users: SteamUser[] = [];
    for (const profile of profiles) {
      if (!profile.trim()) {
        return NextResponse.json({ error: 'One of the provided profiles is empty.', type: 'invalid_inputs' }, { status: 400 });
      }
      try {
        const user = await resolveSteamProfile(profile);
        users.push(user);
      } catch (err: any) {
        return NextResponse.json(
          { error: `Unable to resolve profile "${profile}" : ${err.message || err}`, type: 'resolve_error', profile },
          { status: 400 }
        );
      }
    }

    // Check for duplicate profiles
    const uniqueIds = new Set(users.map((u) => u.steamId));
    if (uniqueIds.size !== users.length) {
      return NextResponse.json(
        { error: 'Please enter different profiles. Duplicates are not allowed.', type: 'duplicate_profiles' },
        { status: 400 }
      );
    }

    // 2. Retrieve owned games
    const userGamesMap: Record<string, OwnedGame[]> = {};
    const globalPlaytimes: Record<number, number> = {};
    const gameOwnersCount: Record<number, number> = {};
    const gameDetails: Record<number, { name: string; imgIconUrl?: string }> = {};

    for (const user of users) {
      try {
        const games = await getOwnedGames(user.steamId);
        userGamesMap[user.steamId] = games;
        
        for (const g of games) {
          globalPlaytimes[g.appId] = (globalPlaytimes[g.appId] || 0) + g.playtimeForever;
          gameOwnersCount[g.appId] = (gameOwnersCount[g.appId] || 0) + 1;
          if (!gameDetails[g.appId]) gameDetails[g.appId] = { name: g.name, imgIconUrl: g.imgIconUrl };
        }
      } catch (err: any) {
        if (err.message === 'private_profile' || user.isPrivate) {
          return NextResponse.json(
            { error: `The profile of "${user.displayName}" is private.`, type: 'private_profile', username: user.displayName },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `Error fetching games for "${user.displayName}"`, type: 'api_error', username: user.displayName },
          { status: 500 }
        );
      }
    }

    // 3. Categorize Games
    const commonAppIds = new Set<number>();
    const missingLinkAppIds = new Set<number>();
    const potentialRemotePlayAppIds = new Set<number>();

    const allAppIds = Object.keys(gameOwnersCount).map(Number);
    // Sort all games by global playtime descending to prioritize the best games
    allAppIds.sort((a, b) => globalPlaytimes[b] - globalPlaytimes[a]);

    // We will only query Steam API for top 100 games to avoid rate limits
    const topGamesToQuery = allAppIds.slice(0, 100);

    for (const appId of topGamesToQuery) {
      const count = gameOwnersCount[appId];
      if (count === users.length) {
        commonAppIds.add(appId);
      } else if (count === users.length - 1) {
        missingLinkAppIds.add(appId);
      } else if (count >= 1) {
        potentialRemotePlayAppIds.add(appId);
      }
    }

    const gamesToQueryList = topGamesToQuery.map(appId => ({ appId, name: gameDetails[appId].name }));
    const filterResults = await filterMultiplayerGames(gamesToQueryList);

    const gamesResult: FilteredGameResult[] = [];
    const missingLinkGames: (FilteredGameResult & { price?: any, missingUsers: SteamUser[] })[] = [];
    const remotePlayGames: FilteredGameResult[] = [];

    for (const game of gamesToQueryList) {
      const filterInfo = filterResults.get(game.appId);
      if (filterInfo && filterInfo.isMultiplayer) {
        const playtimes: Record<string, number> = {};
        const owners: string[] = [];
        const missingUsers: SteamUser[] = [];
        
        for (const user of users) {
          const uGame = userGamesMap[user.steamId].find((g) => g.appId === game.appId);
          playtimes[user.steamId] = uGame ? uGame.playtimeForever : 0;
          if (uGame) owners.push(user.steamId);
          else missingUsers.push(user);
        }

        const gameObj = {
          appId: game.appId,
          name: game.name,
          coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/header.jpg`,
          categories: filterInfo.categories,
          playtimes,
          owners
        };

        if (commonAppIds.has(game.appId)) {
          gamesResult.push(gameObj);
        } else if (missingLinkAppIds.has(game.appId)) {
          missingLinkGames.push({ ...gameObj, price: filterInfo.price, missingUsers });
        } else if (potentialRemotePlayAppIds.has(game.appId) && filterInfo.categories.includes('Remote Play Together')) {
          remotePlayGames.push(gameObj);
        }
      }
    }

    // If a missing link game has Remote Play, put it in Remote Play too!
    for (const g of missingLinkGames) {
       if (g.categories.includes('Remote Play Together') && !remotePlayGames.some(rg => rg.appId === g.appId)) {
           remotePlayGames.push({
               appId: g.appId, name: g.name, coverUrl: g.coverUrl, categories: g.categories, playtimes: g.playtimes, owners: g.owners
           });
       }
    }

    gamesResult.sort((a, b) => {
      const tA = Object.values(a.playtimes).reduce((s, c) => s + c, 0);
      const tB = Object.values(b.playtimes).reduce((s, c) => s + c, 0);
      return tB - tA;
    });

    
    // Calculate RPG Badges
    const badges: Record<string, string> = {};
    let maxPlaytime = 0;
    let minPlaytime = Infinity;
    let maxGames = 0;
    let maxOneTrickRatio = 0;

    let tryhardId = '';
    let casualId = '';
    let collectorId = '';
    let oneTrickId = '';

    for (const user of users) {
      const games = userGamesMap[user.steamId] || [];
      const totalPlaytime = games.reduce((sum, g) => sum + g.playtimeForever, 0);
      const totalGames = games.length;

      if (totalPlaytime > maxPlaytime) { maxPlaytime = totalPlaytime; tryhardId = user.steamId; }
      if (totalPlaytime < minPlaytime) { minPlaytime = totalPlaytime; casualId = user.steamId; }
      if (totalGames > maxGames) { maxGames = totalGames; collectorId = user.steamId; }

      if (games.length > 0 && totalPlaytime > 0) {
        const topGame = [...games].sort((a, b) => b.playtimeForever - a.playtimeForever)[0];
        const ratio = topGame.playtimeForever / totalPlaytime;
        if (ratio > maxOneTrickRatio) { maxOneTrickRatio = ratio; oneTrickId = user.steamId; }
      }
    }

    if (tryhardId) badges[tryhardId] = "The Tryhard";
    if (casualId && casualId !== tryhardId) badges[casualId] = "The Casual";
    if (collectorId && !badges[collectorId]) badges[collectorId] = "The Collector";
    if (oneTrickId && !badges[oneTrickId]) badges[oneTrickId] = "The One-Trick";

    // Fallback for others
    for (const user of users) {
       if (!badges[user.steamId]) badges[user.steamId] = "The Versatile";
    }

    return NextResponse.json({
      users,
      games: gamesResult,
      missingLinkGames,
      remotePlayGames,
      badges
    });


  } catch (error: any) {
    console.error('API /api/games error:', error);
    return NextResponse.json(
      { error: `An internal error occurred: ${error.message || error}`, type: 'internal_error' },
      { status: 500 }
    );
  }
}
