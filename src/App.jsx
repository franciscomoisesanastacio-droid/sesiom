/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from "react";
import { 
  Gamepad2, 
  Search, 
  Maximize2, 
  X, 
  Dices, 
  ArrowLeft,
  Flame,
  LayoutGrid,
  Zap,
  Github,
  User,
  Trophy,
  ShieldAlert,
  LogOut,
  Coins,
  ChevronRight,
  ShieldCheck,
  Star,
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile 
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  increment,
  where,
  getDocs
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import gamesData from "./games.json";

export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  
  // Auth & Profile State
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authModal, setAuthModal] = useState(null); // 'login' | 'signup' | null
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  
  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Admin Data (Users list)
  const [adminUsersList, setAdminUsersList] = useState([]);

  // Session points state
  const [sessionPoints, setSessionPoints] = useState(0);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Listen to profile updates
        const profileRef = doc(db, "users", u.uid);
        const unsubProfile = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            setUserProfile(snap.data());
          } else if (u.displayName) {
            // New user from Google or just created, ensure profile exists
            createProfile(u, false);
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, "users/" + u.uid));
        return () => unsubProfile();
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Leaderboard Listener
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("points", "desc"), limit(10));
    const unsubscribe = onSnapshot(q, (snap) => {
      const top = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(top);
    }, (err) => {
      // For guest users, don't throw blocking error, just log it
      if (err.code === 'permission-denied') {
        console.warn("Leaderboard restricted - sign in for full access");
      } else {
        handleFirestoreError(err, OperationType.LIST, "users");
      }
    });
    return () => unsubscribe();
  }, []);

  // Admin users list fetch (only if admin)
  useEffect(() => {
    if (userProfile?.isAdmin && showAdminPanel) {
      const q = query(collection(db, "users"), limit(50));
      const unsubscribe = onSnapshot(q, (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAdminUsersList(list);
      });
      return () => unsubscribe();
    }
  }, [userProfile, showAdminPanel]);

  // Points accumulation logic
  useEffect(() => {
    let interval;
    if (selectedGame && user) {
      interval = setInterval(() => {
        setSessionPoints(prev => prev + 1);
      }, 5000); // 1 point every 5 seconds of play
    } else {
      // Sync points when closing game
      if (sessionPoints > 0 && user) {
        syncPoints(sessionPoints);
      }
      setSessionPoints(0);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (sessionPoints > 0 && user) syncPoints(sessionPoints);
    };
  }, [selectedGame, user]);

  const syncPoints = async (pointsToAdd) => {
    if (!user) return;
    try {
      const profileRef = doc(db, "users", user.uid);
      await updateDoc(profileRef, {
        points: increment(pointsToAdd)
      });
    } catch (err) {
      console.error("Points sync failed", err);
    }
  };

  const createProfile = async (u, isBecomingAdmin) => {
    const profileRef = doc(db, "users", u.uid);
    const profileData = {
      uid: u.uid,
      displayName: u.displayName || u.email.split('@')[0],
      points: 0,
      isAdmin: isBecomingAdmin
    };
    const privateData = {
      email: u.email,
      createdAt: new Date().toISOString()
    };
    try {
      await setDoc(profileRef, profileData);
      const privateRef = doc(db, "users", u.uid, "private", "info");
      await setDoc(privateRef, privateData);
      setUserProfile({ ...profileData, ...privateData });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "users/" + u.uid);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const adminCode = e.target.adminCode?.value;
    const name = e.target.name?.value;

    try {
      if (authModal === 'signup') {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, { displayName: name });
        // Check admin code
        const isCorrectAdmin = adminCode === import.meta.env.VITE_ADMIN_SECRET_CODE;
        await createProfile(res.user, isCorrectAdmin);
        if (isCorrectAdmin) {
          // Trusted admin collection record
          await setDoc(doc(db, "admins", res.user.uid), { uid: res.user.uid });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setAuthModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const givePoints = async (targetUserId, amount) => {
    if (!userProfile?.isAdmin) return;
    try {
      const targetRef = doc(db, "users", targetUserId);
      await updateDoc(targetRef, {
        points: increment(amount)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "users/" + targetUserId);
    }
  };

  const categories = useMemo(() => {
    const cats = ["All", ...new Set(gamesData.map((g) => g.category))];
    return cats;
  }, []);

  const filteredGames = useMemo(() => {
    return gamesData.filter((game) => {
      const matchesSearch = game.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === "All" || game.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-gamer-dark selection:bg-neon-cyan selection:text-gamer-dark overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gamer-dark/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div 
            className="flex items-center gap-2 cursor-pointer shrink-0" 
            onClick={() => { 
                setSelectedGame(null); 
                setActiveCategory("All"); 
                setSearchQuery(""); 
                setShowAdminPanel(false);
                setShowRanking(false);
            }}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-neon-purple to-neon-cyan rounded-lg flex items-center justify-center neon-glow">
              <Gamepad2 className="text-gamer-dark w-6 h-6" />
            </div>
            <h1 className="text-xl font-display uppercase tracking-wider hidden md:block text-slate-200">
              Nexus <span className="text-neon-cyan">Unblocked</span>
            </h1>
          </div>

          <div className="flex-1 max-w-md relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search infinite games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-full py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:border-neon-cyan transition-all"
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user ? (
               <div className="flex items-center gap-2 sm:gap-4">
                  <div 
                    className="flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800 cursor-pointer hover:border-orange-500 transition-colors"
                    onClick={() => setShowRanking(true)}
                  >
                    <Coins className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-mono font-bold text-slate-200">{userProfile?.points || 0}</span>
                  </div>
                  
                  <div className="relative group">
                    <button className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                       <User className="w-6 h-6 text-slate-400" />
                    </button>
                    <div className="absolute right-0 top-12 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all p-2 z-[60]">
                       <div className="px-3 py-2 border-b border-slate-800 mb-2">
                          <p className="text-xs font-bold text-white truncate">{userProfile?.displayName}</p>
                          <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                       </div>
                       {userProfile?.isAdmin && (
                         <button 
                          onClick={() => { setShowAdminPanel(true); setShowRanking(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-orange-400 hover:bg-orange-400/10 flex items-center gap-2"
                         >
                            <ShieldCheck className="w-4 h-4" /> Admin Panel
                         </button>
                       )}
                       <button 
                        onClick={() => setShowRanking(true)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                       >
                          <Trophy className="w-4 h-4" /> Rankings
                       </button>
                       <button 
                        onClick={() => signOut(auth)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-red-400 hover:bg-red-400/10 flex items-center gap-2"
                       >
                          <LogOut className="w-4 h-4" /> Sign Out
                       </button>
                    </div>
                  </div>
               </div>
            ) : (
               <button 
                onClick={() => setAuthModal('login')}
                className="bg-neon-cyan text-gamer-dark px-4 py-2 rounded-full text-xs font-bold uppercase hover:scale-105 transition-transform"
               >
                 Sign In
               </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full relative">
        <AnimatePresence mode="wait">
          {showAdminPanel ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-display uppercase text-white flex items-center gap-3">
                    <ShieldCheck className="text-orange-500" /> Control Center
                  </h2>
                  <p className="text-slate-500 text-sm">Empower users with points and manage the nexus.</p>
                </div>
                <button onClick={() => setShowAdminPanel(false)} className="p-2 border border-slate-800 rounded-lg hover:bg-slate-800">
                  <X />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {adminUsersList.map(u => (
                   <div key={u.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                         <p className="font-bold text-white truncate">{u.displayName}</p>
                         <p className="text-xs text-slate-500 font-mono truncate">{u.points} PTS</p>
                      </div>
                      <div className="flex items-center gap-2">
                         <button 
                          onClick={() => givePoints(u.id, 100)}
                          className="px-2 py-1 bg-neon-cyan/10 text-neon-cyan rounded text-[10px] font-bold hover:bg-neon-cyan hover:text-gamer-dark transition-colors"
                         >
                           +100
                         </button>
                         <button 
                          onClick={() => givePoints(u.id, 500)}
                          className="px-2 py-1 bg-neon-purple/10 text-neon-purple rounded text-[10px] font-bold hover:bg-neon-purple hover:text-white transition-colors"
                         >
                           +500
                         </button>
                      </div>
                   </div>
                 ))}
              </div>
            </motion.div>
          ) : showRanking ? (
            <motion.div
              key="ranking"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-display uppercase tracking-tighter text-white flex items-center gap-4">
                  <Trophy className="text-orange-500 w-8 h-8" /> Worldwide <span className="text-neon-cyan">Elite</span>
                </h2>
                <button onClick={() => setShowRanking(false)} className="p-2 bg-slate-900 rounded-full hover:bg-slate-800">
                  <X />
                </button>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md">
                <div className="p-4 border-b border-slate-800 bg-black/20 flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  <span>Player</span>
                  <span>Karma Points</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {leaderboard.map((u, i) => (
                    <div key={u.id} className={`p-4 flex items-center justify-between ${user?.uid === u.id ? 'bg-neon-cyan/5' : ''}`}>
                      <div className="flex items-center gap-4 min-w-0">
                        <span className={`w-6 text-sm font-mono ${i < 3 ? 'text-neon-cyan' : 'text-slate-600'}`}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                           <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <span className={`font-bold truncate ${user?.uid === u.id ? 'text-neon-cyan' : 'text-slate-200'}`}>
                          {u.displayName}
                        </span>
                        {u.isAdmin && <ShieldCheck className="w-3 h-3 text-orange-500 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white text-sm">{u.points.toLocaleString()}</span>
                        <Coins className="w-4 h-4 text-orange-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : !selectedGame ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 sm:space-y-8"
            >
              {/* Mobile Hero Small or Desktop Hero */}
              <div className="relative h-48 sm:h-64 rounded-2xl overflow-hidden bg-slate-900 brutal-border group">
                <div className="absolute inset-0 bg-gradient-to-r from-gamer-dark via-transparent to-transparent z-10" />
                <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/cyber/1200/400')] bg-cover bg-center grayscale group-hover:grayscale-0 transition-all duration-700" />
                <div className="relative z-20 h-full flex flex-col justify-center px-6 sm:px-8 max-w-lg">
                  <span className="flex items-center gap-2 text-neon-purple text-[10px] font-mono mb-2">
                    <Zap className="w-3 h-3 animate-pulse" />
                    BEYOND THE FIREWALL
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-display uppercase leading-none mb-3 sm:mb-4 text-white">
                    Nexus <span className="text-neon-cyan italic">Prime</span>
                  </h2>
                  <p className="text-slate-400 text-[10px] sm:text-sm mb-4 sm:mb-6 leading-relaxed line-clamp-2 sm:line-clamp-none">
                    Fastest unblocked node in the network. Play anywhere, save your progress, 
                    and climb the global leaderboard.
                  </p>
                  <div className="flex gap-4">
                    {!user && (
                      <button 
                        onClick={() => setAuthModal('signup')}
                        className="bg-neon-cyan text-gamer-dark px-4 sm:px-6 py-2 rounded-full font-bold text-xs uppercase hover:scale-105 transition-transform"
                      >
                        Join Circuit
                      </button>
                    )}
                    <button 
                      onClick={() => setShowRanking(true)}
                      className="bg-white/5 border border-white/10 text-white px-4 sm:px-6 py-2 rounded-full font-bold text-xs uppercase hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                      <Trophy className="w-3 h-3" /> Hall of Fame
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation / Filters */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide w-full sm:w-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                        activeCategory === cat
                          ? "bg-neon-purple text-white shadow-lg shadow-neon-purple/20"
                          : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {activeCategory === cat && <Zap className="w-3 h-3 fill-current" />}
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[10px] font-mono uppercase tracking-widest bg-slate-900/50 px-3 py-1 rounded">
                  <LayoutGrid className="w-3 h-3" />
                  {filteredGames.length} Portals
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {filteredGames.map((game, idx) => (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group"
                  >
                    <div 
                      onClick={() => setSelectedGame(game)}
                      className="relative aspect-[4/3] sm:aspect-[4/3] rounded-xl overflow-hidden brutal-border bg-slate-900 cursor-pointer mb-2 sm:mb-3"
                    >
                      <img
                        src={game.thumbnail}
                        alt={game.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 grayscale sm:grayscale-0 group-hover:grayscale-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end h-1/2 transition-opacity">
                         <span className="text-[9px] text-neon-cyan font-mono uppercase tracking-tighter mb-1">
                           {game.category}
                         </span>
                         <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-neon-cyan transition-colors">
                           {game.title}
                         </h3>
                      </div>
                      <div className="absolute inset-0 bg-neon-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-neon-cyan text-gamer-dark flex items-center justify-center shadow-2xl scale-50 group-hover:scale-100 transition-transform">
                          <Zap className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {filteredGames.length === 0 && (
                <div className="py-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center text-slate-700">
                    <Dices className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white">No portals found</h3>
                    <p className="text-slate-500 text-sm">Try adjusting your search or category filters.</p>
                  </div>
                  <button 
                    onClick={() => { setActiveCategory("All"); setSearchQuery(""); }}
                    className="text-neon-purple text-sm font-bold uppercase tracking-widest hover:underline"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="player"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-4 sm:gap-6"
            >
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setSelectedGame(null)}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider">Back to Nexus</span>
                </button>
                <div className="flex items-center gap-2 sm:gap-4">
                   {user && (
                     <div className="flex items-center gap-2 px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/20 rounded-full animate-pulse">
                        <Zap className="w-3 h-3 text-neon-cyan" />
                        <span className="text-[10px] font-mono font-bold text-neon-cyan">+{sessionPoints} XP</span>
                     </div>
                   )}
                   <button 
                    className="p-2 text-slate-400 hover:text-neon-purple transition-colors hidden sm:block"
                    title="Add to Favorites"
                   >
                    <Flame className="w-5 h-5" />
                   </button>
                   <button 
                    className="p-2 text-slate-400 hover:text-neon-cyan transition-colors"
                    title="Full Screen"
                    onClick={() => {
                        const iframe = document.querySelector("iframe");
                        if (iframe?.requestFullscreen) iframe.requestFullscreen();
                    }}
                   >
                    <Maximize2 className="w-5 h-5" />
                   </button>
                   <button 
                    onClick={() => setSelectedGame(null)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                   >
                    <X className="w-5 h-5" />
                   </button>
                </div>
              </div>

              <div className="relative aspect-video sm:aspect-video w-full rounded-2xl overflow-hidden bg-black brutal-border shadow-2xl shadow-neon-cyan/5">
                <iframe
                  src={selectedGame.url}
                  className="w-full h-full border-none"
                  title={selectedGame.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              <div className="flex flex-col md:flex-row gap-6 sm:gap-8 py-2 sm:py-4">
                <div className="flex-1 space-y-3 sm:space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-neon-purple/20 text-neon-purple text-[8px] sm:text-[10px] font-mono rounded">
                      {selectedGame.category.toUpperCase()}
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-display uppercase text-white">{selectedGame.title}</h2>
                  </div>
                  <p className="text-slate-400 text-sm sm:leading-relaxed max-w-2xl">
                    {selectedGame.description}
                  </p>
                  {!user && (
                    <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl flex items-center justify-between gap-4">
                       <div className="flex items-center gap-3 text-orange-500">
                          <ShieldAlert className="w-5 h-5" />
                          <p className="text-xs font-bold uppercase">Sign in to save points and join the ranking!</p>
                       </div>
                       <button 
                        onClick={() => setAuthModal('signup')}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold"
                       >
                         Create Account
                       </button>
                    </div>
                  )}
                </div>
                
                <div className="w-full md:w-64 space-y-4">
                   <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 space-y-3">
                      <h4 className="text-xs font-mono text-slate-500 uppercase">Related Portals</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {gamesData.filter(g => g.id !== selectedGame.id).slice(0, 3).map((g) => (
                          <div 
                            key={g.id}
                            onClick={() => setSelectedGame(g)}
                            className="flex items-center gap-3 cursor-pointer group"
                          >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded bg-slate-800 overflow-hidden shrink-0">
                               <img 
                                src={g.thumbnail} 
                                alt={g.title} 
                                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                                referrerPolicy="no-referrer"
                               />
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-slate-300 group-hover:text-neon-cyan transition-colors line-clamp-1">{g.title}</span>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Auth Modals */}
      <AnimatePresence>
        {authModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setAuthModal(null)}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm"
             />
             <motion.div
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6"
             >
                <div className="flex items-center justify-between">
                   <h2 className="text-2xl font-display uppercase text-white">
                     {authModal === 'login' ? 'Welcome Back' : 'Join the Nexus'}
                   </h2>
                   <button onClick={() => setAuthModal(null)} className="p-2 text-slate-500 hover:text-white">
                      <X className="w-5 h-5" />
                   </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authModal === 'signup' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Full Name</label>
                      <input 
                        name="name"
                        type="text" 
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors"
                        placeholder="Master Gamer"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Email Address</label>
                    <input 
                      name="email"
                      type="email" 
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors"
                      placeholder="player@nexus.net"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Password</label>
                    </div>
                    <input 
                      name="password"
                      type="password" 
                      required
                      minLength={6}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-cyan transition-colors"
                      placeholder="••••••••"
                    />
                  </div>

                  {authModal === 'signup' && (
                    <div className="space-y-2 bg-neon-purple/5 p-4 rounded-xl border border-neon-purple/20">
                      <div className="flex items-center gap-2 text-neon-purple mb-2">
                        <ShieldAlert className="w-4 h-4" />
                        <label className="text-[10px] font-mono uppercase tracking-widest">Admin Authorization (Optional)</label>
                      </div>
                      <input 
                        name="adminCode"
                        type="text" 
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-neon-purple transition-colors"
                        placeholder="Enter secret code..."
                      />
                    </div>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-3 bg-neon-cyan text-gamer-dark font-bold uppercase tracking-widest rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-neon-cyan/20"
                  >
                    {authModal === 'login' ? 'Authorize Access' : 'Create Identity'}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button 
                    onClick={() => setAuthModal(authModal === 'login' ? 'signup' : 'login')}
                    className="text-xs text-slate-400 hover:text-neon-cyan transition-colors"
                  >
                    {authModal === 'login' ? "Don't have an identity yet? Sign up" : "Already registered? Sign in"}
                  </button>
                </div>
                
                <p className="text-[9px] text-slate-600 text-center leading-relaxed">
                  * Note: For this prototype, ensure Email/Password auth is enabled in your Firebase console.
                </p>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-slate-900 bg-black/40 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
            <Gamepad2 className="w-5 h-5 text-slate-200" />
            <span className="text-sm font-display tracking-widest uppercase text-slate-200">Nexus Unblocked</span>
          </div>
          <p className="text-slate-600 text-[10px] font-mono uppercase tracking-widest text-center">
            &copy; 2026 NEXUS CORE SYSTEMS // {user ? `SESSION: ${user.uid.slice(0, 8)}` : 'GUEST MODE'}
          </p>
          <div className="flex items-center gap-6">
            <button onClick={() => setShowRanking(true)} className="text-slate-600 hover:text-slate-400 text-[10px] font-mono uppercase">Global Stats</button>
            <a href="#" className="text-slate-600 hover:text-slate-400 text-[10px] font-mono uppercase">Privacy</a>
            <a href="#" className="text-slate-600 hover:text-slate-400 text-[10px] font-mono uppercase">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
