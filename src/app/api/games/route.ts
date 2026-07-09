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
        { error: 'Veuillez fournir entre 2 et 5 profils Steam.', type: 'invalid_inputs' },
        { status: 400 }
      );
    }

    // 1. Resolve all Steam Profiles
    const users: SteamUser[] = [];
    for (const profile of profiles) {
      if (!profile.trim()) {
        return NextResponse.json(
          { error: 'Un des profils saisis est vide.', type: 'invalid_inputs' },
          { status: 400 }
        );
      }

      try {
        const user = await resolveSteamProfile(profile);
        users.push(user);
      } catch (err: any) {
        return NextResponse.json(
          {
            error: `Impossible de résoudre le profil "${profile}" : ${err.message || err}`,
            type: 'resolve_error',
            profile
          },
          { status: 400 }
        );
      }
    }

    // Check for duplicate profiles
    const uniqueIds = new Set(users.map((u) => u.steamId));
    if (uniqueIds.size !== users.length) {
      return NextResponse.json(
        { error: 'Veuillez saisir des profils différents. Les doublons ne sont pas autorisés.', type: 'duplicate_profiles' },
        { status: 400 }
      );
    }

    // 2. Retrieve owned games for each resolved user
    const userGamesMap: Record<string, OwnedGame[]> = {};
    for (const user of users) {
      try {
        const games = await getOwnedGames(user.steamId);
        userGamesMap[user.steamId] = games;
      } catch (err: any) {
        if (err.message === 'private_profile' || user.isPrivate) {
          return NextResponse.json(
            {
              error: `Le profil de "${user.displayName}" est privé ou ses détails de jeux sont cachés. Demandez-lui de rendre ses détails de jeux publics dans ses paramètres Steam (Profil > Modifier le profil > Paramètres de confidentialité).`,
              type: 'private_profile',
              username: user.displayName
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            error: `Erreur lors de la récupération des jeux pour "${user.displayName}" : ${err.message || err}`,
            type: 'api_error',
            username: user.displayName
          },
          { status: 500 }
        );
      }
    }

    // 3. Intersect games libraries
    const firstUserGames = userGamesMap[users[0].steamId];
    const firstUserGameIds = new Set(firstUserGames.map((g) => g.appId));
    const commonAppIds = new Set<number>();

    for (const appId of firstUserGameIds) {
      let ownedByAll = true;
      for (let i = 1; i < users.length; i++) {
        const userGames = userGamesMap[users[i].steamId];
        const ownsGame = userGames.some((g) => g.appId === appId);
        if (!ownsGame) {
          ownedByAll = false;
          break;
        }
      }
      if (ownedByAll) {
        commonAppIds.add(appId);
      }
    }

    // Map common app IDs back to their details (using first user's list as source of names)
    const commonGamesList: { appId: number; name: string }[] = [];
    for (const appId of commonAppIds) {
      const g = firstUserGames.find((game) => game.appId === appId);
      if (g) {
        commonGamesList.push({ appId, name: g.name });
      }
    }

    if (commonGamesList.length === 0) {
      return NextResponse.json({
        users,
        games: []
      });
    }

    // 4. Filter intersection list to keep only multiplayer games
    // Note: filterMultiplayerGames takes care of cache + sequential store details lookup
    const filterResults = await filterMultiplayerGames(commonGamesList);
    
    const gamesResult: FilteredGameResult[] = [];
    for (const game of commonGamesList) {
      const filterInfo = filterResults.get(game.appId);
      if (filterInfo && filterInfo.isMultiplayer) {
        const playtimes: Record<string, number> = {};
        
        // Collate playtimes for each user
        for (const user of users) {
          const uGame = userGamesMap[user.steamId].find((g) => g.appId === game.appId);
          playtimes[user.steamId] = uGame ? uGame.playtimeForever : 0;
        }

        gamesResult.push({
          appId: game.appId,
          name: game.name,
          coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/header.jpg`,
          categories: filterInfo.categories,
          playtimes,
          owners: users.map((u) => u.steamId)
        });
      }
    }

    // 5. Sort games by total squad playtime (descending)
    gamesResult.sort((a, b) => {
      const totalPlaytimeA = Object.values(a.playtimes).reduce((sum, current) => sum + current, 0);
      const totalPlaytimeB = Object.values(b.playtimes).reduce((sum, current) => sum + current, 0);
      return totalPlaytimeB - totalPlaytimeA;
    });

    return NextResponse.json({
      users,
      games: gamesResult
    });

  } catch (error: any) {
    console.error('API /api/games error:', error);
    return NextResponse.json(
      { error: `Une erreur interne est survenue : ${error.message || error}`, type: 'internal_error' },
      { status: 500 }
    );
  }
}
