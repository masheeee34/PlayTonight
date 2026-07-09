'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

import {
  Plus,
  Trash2,
  Share2,
  Shuffle,
  Play,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Users,
  Check,
  Gamepad2,
  Clock,
  Info,
  ChevronRight,
  FolderHeart,
  Sparkles,
  Search,
  MessageSquareShare,
  BarChart3,
  Award,
  Crown,
  Ghost,
  Save,
  HelpCircle
} from 'lucide-react';
import { SteamUser, FilteredGameResult } from '@/lib/steam';

interface Squad {
  id: string;
  name: string;
  profiles: string[];
}

function PlayTonightAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Squads state
  const [squads, setSquads] = useState<Squad[]>([]);
  const [activeSquadId, setActiveSquadId] = useState<string | null>(null);
  const [editingSquadName, setEditingSquadName] = useState('Ma Squad');
  
  // Input profiles state
  const [inputs, setInputs] = useState<string[]>(['', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; type?: string; username?: string } | null>(null);
  const [results, setResults] = useState<{ users: SteamUser[]; games: FilteredGameResult[]; missingLinkGames?: any[]; remotePlayGames?: FilteredGameResult[]; badges?: Record<string, string> } | null>(null);

  const handleExportImage = async () => {
    const dashboard = document.getElementById('export-dashboard');
    if (!dashboard) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(dashboard, { backgroundColor: '#f0f1f4', scale: 2 });
      const link = document.createElement('a');
      link.download = 'squad-summary.png';
      link.href = canvas.toDataURL();
      link.click();
    } catch (err) {
      console.error('Error capturing image:', err);
    }
  };

  
  // Navigation & filtering state
  const [activeTab, setActiveTab] = useState<'library' | 'shame' | 'stats'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'playtime' | 'alpha' | 'carry'>('playtime');

  // Interactive tools state
  const [isPicking, setIsPicking] = useState(false);
  const [pickedGame, setPickedGame] = useState<FilteredGameResult | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [discordCopied, setDiscordCopied] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newSquadNameInput, setNewSquadNameInput] = useState('');

  const hasLoadedOnMount = useRef(false);

  // Load squads from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pt_squads');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSquads(parsed);
      } else {
        // Default squad for onboarding
        const defaultSquads = [
          {
            id: 'squad-tryhard',
            name: 'Squad Tryhard (Exemple)',
            profiles: ['masheeee34', '76561198007328344']
          }
        ];
        setSquads(defaultSquads);
        localStorage.setItem('pt_squads', JSON.stringify(defaultSquads));
      }
    } catch (e) {
      console.error('Error loading squads:', e);
    }
  }, []);

  // Load from query parameters on mount
  useEffect(() => {
    if (hasLoadedOnMount.current) return;
    hasLoadedOnMount.current = true;

    const profilesParam = searchParams.get('profiles');
    if (profilesParam) {
      const parsedProfiles = profilesParam.split(',').filter(p => p.trim());
      if (parsedProfiles.length >= 2 && parsedProfiles.length <= 5) {
        setInputs(parsedProfiles);
        fetchGames(parsedProfiles);
      }
    }
  }, [searchParams]);

  const handleAddInput = () => {
    if (inputs.length < 5) {
      setInputs([...inputs, '']);
    }
  };

  const handleRemoveInput = (index: number) => {
    if (inputs.length > 2) {
      const newInputs = [...inputs];
      newInputs.splice(index, 1);
      setInputs(newInputs);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
  };

  const fetchGames = async (profilesToSearch = inputs) => {
    const activeProfiles = profilesToSearch.map(p => p.trim()).filter(Boolean);

    if (activeProfiles.length < 2) {
      setError({ message: 'Please enter at least 2 Steam profiles to compare.' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);
    setPickedGame(null);

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profiles: activeProfiles }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError({
          message: data.error || 'An unknown error occurred.',
          type: data.type,
          username: data.username
        });
      } else {
        setResults(data);
        
        // Update URL query parameters silently
        const params = new URLSearchParams();
        params.set('profiles', activeProfiles.join(','));
        router.replace(`?${params.toString()}`);
      }
    } catch (err: any) {
      console.error(err);
      setError({ message: 'Unable to contact the server. Please check your connection.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Squad management functions
  const handleLoadSquad = (squad: Squad) => {
    setActiveSquadId(squad.id);
    setEditingSquadName(squad.name);
    setInputs(squad.profiles);
    fetchGames(squad.profiles);
  };

  const handleCreateNewSquad = () => {
    const activeProfiles = inputs.map(p => p.trim()).filter(Boolean);
    if (activeProfiles.length < 2) {
      setError({ message: 'Veuillez saisir au moins 2 profils Steam avant d\'enregistrer une squad.' });
      return;
    }
    setNewSquadNameInput(activeSquadId ? editingSquadName : `Squad #${squads.length + 1}`);
    setShowSaveModal(true);
  };

  const handleSaveSquadConfirm = () => {
    if (!newSquadNameInput.trim()) return;

    const activeProfiles = inputs.map(p => p.trim()).filter(Boolean);
    const newSquad: Squad = {
      id: activeSquadId && activeSquadId !== 'squad-tryhard' ? activeSquadId : `squad-${Date.now()}`,
      name: newSquadNameInput.trim(),
      profiles: activeProfiles
    };

    let updated;
    if (squads.some(s => s.id === newSquad.id)) {
      updated = squads.map(s => s.id === newSquad.id ? newSquad : s);
    } else {
      updated = [...squads, newSquad];
    }

    setSquads(updated);
    setActiveSquadId(newSquad.id);
    setEditingSquadName(newSquad.name);
    localStorage.setItem('pt_squads', JSON.stringify(updated));
    setShowSaveModal(false);
  };

  const handleDeleteSquad = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this squad from your list?')) {
      const updated = squads.filter(s => s.id !== id);
      setSquads(updated);
      if (activeSquadId === id) {
        setActiveSquadId(null);
      }
      localStorage.setItem('pt_squads', JSON.stringify(updated));
    }
  };

  // Get current active list of games based on selected Tab
  const getFilteredGames = () => {
    if (!results) return [];

    let list = [...results.games];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q));
    }

    // Filter by Tab (Library vs. Shame)
    if (activeTab === 'shame') {
      list = list.filter(g => {
        const totalPlaytime = Object.values(g.playtimes).reduce((a, b) => a + b, 0);
        return totalPlaytime === 0;
      });
    }

    // Apply Sorting
    if (sortBy === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'playtime') {
      list.sort((a, b) => {
        const totalA = Object.values(a.playtimes).reduce((sum, curr) => sum + curr, 0);
        const totalB = Object.values(b.playtimes).reduce((sum, curr) => sum + curr, 0);
        return totalB - totalA;
      });
    } else if (sortBy === 'carry') {
      list.sort((a, b) => {
        const timesA = Object.values(a.playtimes);
        const diffA = Math.max(...timesA) - Math.min(...timesA);
        const timesB = Object.values(b.playtimes);
        const diffB = Math.max(...timesB) - Math.min(...timesB);
        return diffB - diffA;
      });
    }

    return list;
  };

  // Pick a random game using a roulette animation (respecting active tab filter)
  const handlePickForUs = () => {
    const availableGames = getFilteredGames();
    if (availableGames.length === 0 || isPicking) return;

    setIsPicking(true);
    setPickedGame(null);

    let counter = 0;
    const intervalTime = 80;
    const duration = 2400; // 2.4 seconds
    const totalSteps = duration / intervalTime;

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * availableGames.length);
      setPickedGame(availableGames[randomIndex]);
      counter++;

      if (counter >= totalSteps) {
        clearInterval(interval);
        const finalIndex = Math.floor(Math.random() * availableGames.length);
        setPickedGame(availableGames[finalIndex]);
        setIsPicking(false);
      }
    }, intervalTime);
  };

  const handleShare = () => {
    const activeProfiles = inputs.map(p => p.trim()).filter(Boolean);
    if (activeProfiles.length < 2) return;

    const url = `${window.location.origin}${window.location.pathname}?profiles=${encodeURIComponent(activeProfiles.join(','))}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  // Contextual Discord notification copy
  const handleSpamDiscord = (game?: FilteredGameResult) => {
    if (!results) return;

    let text = '';
    const selected = game || pickedGame || getFilteredGames()[0];

    if (!selected) {
      text = `@here Guys, come to PlayTonight and compare our Steam libraries! Let's find our common games tonight.\n${window.location.href}`;
    } else {
      const totalPlaytime = Object.values(selected.playtimes).reduce((a, b) => a + b, 0);
      
      if (totalPlaytime === 0) {
        text = `@here Tonight we clear our Pile of Shame! Everyone install **${selected.name}** (0 minutes played for everyone). Let's make it worth it!`;
      } else {
        let maxHours = -1;
        let carryName = '';
        results.users.forEach(user => {
          const pt = selected.playtimes[user.steamId];
          if (pt > maxHours) {
            maxHours = pt;
            carryName = user.displayName;
          }
        });
        
        const carryHours = Math.round(maxHours / 60);

        if (carryHours > 30) {
          text = `@here Tonight we play **${selected.name}**! No excuses, we all have it. Plus, **${carryName}** will carry us (already has ${carryHours}h on it).`;
        } else {
          text = `@here Tonight we play **${selected.name}**! We all have the game, no excuses, install it.`;
        }
      }
    }

    navigator.clipboard.writeText(text).then(() => {
      setDiscordCopied(true);
      setTimeout(() => setDiscordCopied(false), 2000);
    });
  };

  const formatPlaytime = (minutes: number) => {
    if (!minutes) return '0h';
    const hours = Math.round(minutes / 60);
    if (hours === 0) return `${Math.round(minutes)}m`;
    return `${hours}h`;
  };

  // Compute statistics for "Vibe Check" tab
  const getStats = () => {
    if (!results || results.games.length === 0) return null;

    const users = results.users;
    const games = results.games;

    const userTotalTimes: Record<string, number> = {};
    users.forEach(u => {
      userTotalTimes[u.steamId] = 0;
    });

    games.forEach(g => {
      users.forEach(u => {
        userTotalTimes[u.steamId] += (g.playtimes[u.steamId] || 0);
      });
    });

    let addictId = users[0].steamId;
    let maxTime = -1;
    users.forEach(u => {
      if (userTotalTimes[u.steamId] > maxTime) {
        maxTime = userTotalTimes[u.steamId];
        addictId = u.steamId;
      }
    });
    const addict = users.find(u => u.steamId === addictId);

    const shameGamesCount = games.filter(g => {
      const total = Object.values(g.playtimes).reduce((a, b) => a + b, 0);
      return total === 0;
    }).length;

    let biggestCarryGame: FilteredGameResult | null = null;
    let maxGap = -1;
    let carryName = '';

    games.forEach(g => {
      const times = Object.values(g.playtimes);
      const gap = Math.max(...times) - Math.min(...times);
      if (gap > maxGap && gap > 0) {
        maxGap = gap;
        biggestCarryGame = g;
        
        let maxUserTime = -1;
        users.forEach(u => {
          const pt = g.playtimes[u.steamId];
          if (pt > maxUserTime) {
            maxUserTime = pt;
            carryName = u.displayName;
          }
        });
      }
    });

    return {
      userTotalTimes,
      addict,
      shameGamesCount,
      biggestCarryGame,
      carryName,
      maxGap
    };
  };

  const stats = getStats();
  const filteredGames = getFilteredGames();

  return (
    <div className="flex h-screen bg-[#f3f4f6] text-[#111827] overflow-hidden p-3 gap-4 font-sans">
      
      {/* ================= LEFT SIDEBAR ================= */}
      <div className="w-[80px] md:w-[90px] bg-[#0f172a] rounded-[32px] flex flex-col items-center py-8 justify-between shadow-xl flex-shrink-0 z-20">
        <div className="flex flex-col gap-8 items-center w-full">
          <div className="w-12 h-12 bg-gradient-to-tr from-[#6366f1] to-[#818cf8] rounded-[18px] flex items-center justify-center shadow-lg shadow-[#6366f1]/20 cursor-pointer" onClick={() => fetchGames()}>
            <Gamepad2 className="w-6 h-6 text-[#0f172a]" />
          </div>

          <div className="flex flex-col gap-4 w-full px-4">
            <button onClick={() => setActiveTab('library')} className={`p-3.5 rounded-2xl transition-all flex justify-center ${activeTab === 'library' ? 'bg-[#6366f1] text-[#0f172a] shadow-md shadow-[#6366f1]/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <Gamepad2 className="w-6 h-6" />
            </button>
            <button onClick={() => setActiveTab('shame')} className={`p-3.5 rounded-2xl transition-all flex justify-center ${activeTab === 'shame' ? 'bg-[#6366f1] text-[#0f172a] shadow-md shadow-[#6366f1]/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <Ghost className="w-6 h-6" />
            </button>
            <button onClick={() => setActiveTab('stats')} className={`p-3.5 rounded-2xl transition-all flex justify-center ${activeTab === 'stats' ? 'bg-[#6366f1] text-[#0f172a] shadow-md shadow-[#6366f1]/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <BarChart3 className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 items-center w-full">
          <button onClick={handleCreateNewSquad} className="p-3 rounded-2xl text-white/40 hover:text-white hover:bg-white/5 transition-all" title="Save">
            <Save className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* ================= MAIN CONTENT ================= */}
      <div id="export-dashboard" className="flex-1 flex flex-col h-full overflow-hidden relative z-10 space-y-4 p-2 -m-2">
        
        {/* TOP BAR: Squad Area */}
        <div className="bg-white rounded-[32px] p-4 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-4 overflow-x-auto px-2 scrollbar-hide">
            {/* Add Friend Button */}
            <div className="flex flex-col items-center gap-1.5 cursor-pointer group" onClick={() => setShowSaveModal(true)}>
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-[#6366f1] group-hover:text-[#6366f1] transition-all bg-gray-50">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-700">Add Friends</span>
            </div>

            {/* Squad Members */}
            {results ? results.users.map(u => (
              <div key={u.steamId} className="flex flex-col items-center gap-1.5 group cursor-pointer">
                <div className="relative">
                  <img src={u.avatarUrl} alt="" className="w-12 h-12 rounded-full shadow-sm object-cover bg-gray-100 border border-transparent group-hover:border-[#6366f1] transition-all" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white"></div>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-gray-800">{u.displayName.substring(0,10)}</span>
                  {results.badges?.[u.steamId] && (
                     <span className="text-[8px] font-black text-[#6366f1] bg-[#818cf8]/10 px-2 py-0.5 rounded-full mt-0.5 border border-[#818cf8]/20">{results.badges[u.steamId]}</span>
                  )}
                </div>
              </div>
            )) : inputs.filter(Boolean).map((inp, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-full shadow-sm bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-gray-400">Player {idx+1}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pr-2">
            <button onClick={handlePickForUs} disabled={isPicking || !results} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm disabled:opacity-50">
              <Shuffle className="w-4 h-4" /> Pick for us
            </button>
            <button onClick={handleExportImage} disabled={!results} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm disabled:opacity-50">
              <Share2 className="w-4 h-4" /> Export
            </button>
            <button onClick={() => handleSpamDiscord()} disabled={!results} className="bg-[#6366f1] hover:bg-[#4f46e5] text-[#0f172a] px-5 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm shadow-[#6366f1]/20 disabled:opacity-50">
              <MessageSquareShare className="w-4 h-4" /> Discord
            </button>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          
          {/* Left Column */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-hide pb-10">
            
            {/* HERO CARD */}
            {pickedGame ? (
              <div className="relative w-full h-[360px] rounded-[32px] overflow-hidden flex-shrink-0 shadow-sm bg-[#0f172a]">
                <img src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${pickedGame.appId}/library_hero.jpg`} onError={(e) => { (e.target as HTMLImageElement).src = pickedGame.coverUrl; }} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent"></div>
                <div className="absolute inset-0 p-10 flex flex-col justify-center max-w-md">
                  <h2 className="text-white text-5xl font-black leading-tight mb-4 drop-shadow-lg">{pickedGame.name}</h2>
                  <p className="text-white/80 text-sm font-medium mb-8 line-clamp-3">
                    Get ready to launch this game with your squad tonight. Press the button to launch directly from Steam.
                  </p>
                  <a href={`steam://run/${pickedGame.appId}`} className="bg-[#6366f1] hover:bg-[#4f46e5] text-[#0f172a] px-8 py-4 rounded-2xl font-black text-sm inline-flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#6366f1]/20 w-max">
                    Download Now
                  </a>
                </div>
              </div>
            ) : results && results.games.length > 0 ? (
              <div className="relative w-full h-[360px] rounded-[32px] overflow-hidden flex-shrink-0 shadow-sm bg-[#0f172a]">
                <img src={`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${results.games[0].appId}/library_hero.jpg`} onError={(e) => { (e.target as HTMLImageElement).src = results.games[0].coverUrl; }} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent"></div>
                <div className="absolute inset-0 p-10 flex flex-col justify-center max-w-md">
                  <h2 className="text-white text-5xl font-black leading-tight mb-4 drop-shadow-lg">{results.games[0].name}</h2>
                  <p className="text-white/80 text-sm font-medium mb-8 line-clamp-3">
                    This is your most played common game! Everyone has it. Click "Pick for us" to choose one randomly, or launch it directly.
                  </p>
                  <a href={`steam://run/${results.games[0].appId}`} className="bg-[#6366f1] hover:bg-[#4f46e5] text-[#0f172a] px-8 py-4 rounded-2xl font-black text-sm inline-flex items-center gap-2 transition-all shadow-lg shadow-[#6366f1]/20 w-max">
                    Launch Game
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-[360px] rounded-[32px] overflow-hidden flex-shrink-0 shadow-sm bg-white border border-gray-100 flex items-center justify-center flex-col gap-4">
                 <Gamepad2 className="w-16 h-16 text-gray-200" />
                 <h2 className="text-gray-400 font-bold text-xl">No game selected</h2>
                 <p className="text-gray-400 text-sm">Add Steam profiles at the top to get started.</p>
              </div>
            )}

            
            {/* VIRAL FEATURES */}
            {results && (((results.missingLinkGames?.length ?? 0) > 0) || ((results.remotePlayGames?.length ?? 0) > 0)) && (
               <div className="flex flex-col gap-4 flex-shrink-0 mb-4">
                 {results.missingLinkGames && results.missingLinkGames.length > 0 && (
                   <div className="bg-white rounded-[32px] p-6 shadow-sm border-l-4 border-l-[#6366f1] relative overflow-hidden">
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">The Missing Link</h3>
                        {results.missingLinkGames[0].price && (
                           <span className="bg-[#818cf8]/10 text-[#6366f1] px-3 py-1 rounded-xl text-sm font-black border border-[#818cf8]/20">
                             {results.missingLinkGames[0].price.final_formatted}
                           </span>
                        )}
                     </div>
                     <p className="text-sm font-medium text-gray-500 mb-4">
                       If <b>{results.missingLinkGames[0].missingUsers[0].displayName}</b> buys this game, you can all play together tonight! Pressure them.
                     </p>
                     <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl">
                        <img src={results.missingLinkGames[0].coverUrl} className="w-16 h-8 object-cover rounded-lg shadow-sm" />
                        <span className="font-bold text-gray-800 text-sm flex-1">{results.missingLinkGames[0].name}</span>
                        <a href={`steam://store/${results.missingLinkGames[0].appId}`} className="bg-[#0f172a] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-black transition-colors">
                          Open Steam
                        </a>
                     </div>
                   </div>
                 )}

                 {results.remotePlayGames && results.remotePlayGames.length > 0 && (
                   <div className="bg-white rounded-[32px] p-6 shadow-sm border-l-4 border-l-emerald-400 relative overflow-hidden">
                     <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2 mb-2">Remote Play Hack</h3>
                     <p className="text-sm font-medium text-gray-500 mb-4">
                       It's free! Only <b>one person</b> needs to launch this game to invite the whole Squad for free.
                     </p>
                     <div className="flex items-center gap-4 bg-emerald-50 p-3 rounded-2xl">
                        <img src={results.remotePlayGames[0].coverUrl} className="w-16 h-8 object-cover rounded-lg shadow-sm" />
                        <span className="font-bold text-gray-800 text-sm flex-1">{results.remotePlayGames[0].name}</span>
                        <a href={`steam://run/${results.remotePlayGames[0].appId}`} className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-emerald-600 transition-colors">
                          Launch
                        </a>
                     </div>
                   </div>
                 )}
               </div>
            )}

            {/* LOWER STATS / GRAPHS ROW */}
            <div className="grid grid-cols-2 gap-4 flex-shrink-0">
               <div className="bg-white rounded-[32px] p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-gray-800">Highlights</h3>
                 </div>
                 <div className="flex gap-4">
                    <div className="flex-1 bg-gray-50 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
                       <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gray-200 rounded-b-2xl opacity-50"></div>
                       <span className="font-black text-2xl z-10 text-gray-800">{stats?.shameGamesCount || 0}</span>
                       <span className="text-[10px] font-bold text-gray-400 uppercase z-10 mt-1">Pile of Shame</span>
                    </div>
                    <div className="flex-1 bg-[#6366f1] rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-sm shadow-[#6366f1]/20">
                       <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-[#4f46e5] rounded-b-2xl"></div>
                       <span className="font-black text-2xl z-10 text-[#0f172a]">{results?.games.length || 0}</span>
                       <span className="text-[10px] font-bold text-[#0f172a]/70 uppercase z-10 mt-1">Total Games</span>
                    </div>
                 </div>
               </div>
               
               <div className="bg-white rounded-[32px] p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-gray-800">Top Player</h3>
                 </div>
                 {stats?.addict ? (
                   <div className="flex items-center gap-4">
                      <img src={stats.addict.avatarUrl} className="w-16 h-16 rounded-2xl shadow-sm" />
                      <div>
                        <p className="font-black text-xl text-gray-800">{stats.addict.displayName}</p>
                        <p className="text-xs font-bold text-gray-400 mt-1">{formatPlaytime(stats.userTotalTimes[stats.addict.steamId])} total playtime</p>
                      </div>
                   </div>
                 ) : (
                   <p className="text-gray-400 text-sm">No data.</p>
                 )}
               </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="w-[380px] flex flex-col gap-4 flex-shrink-0 overflow-hidden">
            
            <div className="bg-white rounded-[32px] p-6 flex-1 shadow-sm flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <h3 className="font-bold text-xl text-gray-800 w-[120px] leading-tight">
                  {activeTab === 'library' ? 'My Games Collection' : activeTab === 'shame' ? 'Pile of Shame' : 'Collection'}
                </h3>
                <div className="relative flex-1 max-w-[140px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="bg-gray-50 border-none rounded-xl pl-9 pr-3 py-2.5 text-xs text-gray-800 font-medium focus:ring-2 focus:ring-[#6366f1] outline-none w-full transition-all" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide space-y-3">
                {filteredGames.length > 0 ? filteredGames.map((game) => (
                  <div key={game.appId} className="flex items-center p-3 rounded-2xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group cursor-pointer" onClick={() => setPickedGame(game)}>
                    <img src={game.coverUrl} className="w-14 h-14 rounded-xl object-cover shadow-sm" />
                    <div className="ml-4 flex-1">
                      <h4 className="font-bold text-gray-800 text-sm line-clamp-1">{game.name}</h4>
                      <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{game.categories.find(c => c !== 'Solo' && c !== 'Single-player') || 'Multiplayer'}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-[#6366f1] group-hover:text-[#0f172a] transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                )) : (
                  <div className="text-center p-10 text-gray-400 font-medium text-sm">No games found</div>
                )}
              </div>
            </div>

            {/* Dark Profile / Carry Card */}
            {stats?.biggestCarryGame && (
              <div className="bg-[#0f172a] rounded-[32px] p-6 flex-shrink-0 shadow-lg relative overflow-hidden">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-[#1e293b] rounded-2xl flex items-center justify-center">
                    <img src={results?.users.find(u => u.displayName === stats.carryName)?.avatarUrl} className="w-full h-full rounded-2xl object-cover" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-lg">{stats.carryName}</h4>
                    <p className="text-[10px] font-semibold text-[#6366f1] flex items-center gap-1.5 mt-0.5"><span className="w-2 h-2 rounded-full bg-[#6366f1]"></span> Hard Carry</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-[#1e293b] rounded-2xl p-4 flex flex-col justify-center items-center text-center">
                     <span className="font-black text-white text-xl">{(stats.biggestCarryGame as FilteredGameResult).name.substring(0, 10)}</span>
                     <span className="text-[10px] font-bold text-gray-400 uppercase mt-1">Carry Game</span>
                   </div>
                   <div className="bg-[#6366f1] rounded-2xl p-4 flex flex-col justify-center items-center shadow-md shadow-[#6366f1]/20 text-center">
                     <span className="font-black text-[#0f172a] text-xl">{formatPlaytime(stats.maxGap)}</span>
                     <span className="text-[10px] font-bold text-[#0f172a]/70 uppercase mt-1">Ahead</span>
                   </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ================= MODALS ================= */}
      <AnimatePresence>
        {showSaveModal && (
          <div className="fixed inset-0 bg-[#f3f4f6]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="bg-white rounded-[32px] max-w-md w-full p-8 shadow-2xl relative border border-gray-100">
              <h3 className="font-black text-gray-800 text-2xl mb-2">Add Friends</h3>
              <p className="text-gray-400 text-sm font-medium mb-6">Paste your squad's Steam links below.</p>
              
              <div className="space-y-3 mb-8">
                {inputs.map((input, index) => (
                  <div key={index} className="flex gap-2">
                    <input type="text" value={input} onChange={(e) => handleInputChange(index, e.target.value)} placeholder="Steam URL or Username" className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-sm text-gray-800 font-medium focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-all" />
                    {inputs.length > 2 && (
                      <button onClick={() => handleRemoveInput(index)} className="w-[52px] h-[52px] flex flex-shrink-0 items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
                {inputs.length < 5 && (
                  <button onClick={handleAddInput} className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-sm hover:border-[#6366f1] hover:text-[#6366f1] transition-colors flex justify-center items-center gap-2">
                    <Plus className="w-5 h-5" /> Add Player
                  </button>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowSaveModal(false)} className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => { setShowSaveModal(false); fetchGames(); }} className="flex-1 py-4 rounded-2xl bg-[#6366f1] hover:bg-[#4f46e5] text-[#0f172a] font-black text-sm transition-colors shadow-lg shadow-[#6366f1]/20">
                  {isLoading ? 'Scanning...' : 'Scan Games'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <div className="fixed inset-0 bg-[#f3f4f6]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="bg-white rounded-[32px] max-w-sm w-full p-8 shadow-2xl relative text-center border border-gray-100">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="font-black text-gray-800 text-2xl mb-3">Oops!</h3>
              <p className="text-gray-500 text-sm font-medium mb-8 leading-relaxed">{error.message}</p>
              <button onClick={() => setError(null)} className="w-full py-4 rounded-2xl bg-[#0f172a] hover:bg-black text-white font-black text-sm transition-colors shadow-lg shadow-black/20">
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );

}

export default function PlayTonightApp() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 w-full h-screen bg-[#080b10] flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-steam-light-blue animate-spin" />
        </div>
      }
    >
      <PlayTonightAppContent />
    </Suspense>
  );
}
