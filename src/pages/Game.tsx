import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore, CharacterType } from '../store';
import { db, generateLocalUserId } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, onSnapshot, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, Zap, Heart, Orbit, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateChunk, GameObject } from '../lib/GameEngine';

const LobbyParrotPreview = ({ type }: { type: CharacterType }) => {
    let b = 'bg-sky-400';
    let l = 'bg-sky-500';
    let d = 'bg-sky-200';
    const e = 'bg-black';
    const w = 'bg-white';
    const k = 'bg-amber-500';
    const f = 'bg-orange-600';
    const _ = 'bg-transparent';

    if (type === 'Луша') {
        b = 'bg-lime-400'; l = 'bg-lime-500'; d = 'bg-yellow-200';
    }
    
    const grid = [
        [_,_,b,b,b,b,_,_],
        [_,b,b,w,e,b,k,_],
        [_,b,b,b,b,k,_,_],
        [l,l,b,d,d,b,_,_],
        [l,l,b,d,d,b,_,_],
        [_,_,b,b,b,_,_,_],
        [_,_,f,_,f,_,_,_],
        [_,_,_,_,_,_,_,_]
    ];

    return (
        <div className="flex flex-col w-12 h-12 pointer-events-none select-none">
           {grid.map((row, r) => (
               <div key={r} className="flex flex-1">
                  {row.map((color, c) => (
                      <div key={c} className={`flex-1 min-w-0 ${color}`} />
                  ))}
               </div>
           ))}
        </div>
    );
};

const drawPixelParrot = (ctx: CanvasRenderingContext2D, px: number, py: number, width: number, type: CharacterType, isDead: boolean, now: number) => {
    const ps = width / 8;
    const isFlap = Math.floor(now / 150) % 2 === 0;

    ctx.save();
    ctx.translate(px, py);
    if (isDead) { // draw upside down and offset back
        ctx.translate(width, width);
        ctx.rotate(Math.PI);
    }
    
    let b = '#38bdf8'; // body
    let l = '#0ea5e9'; // wing
    let d = '#bae6fd'; // belly

    if (type === 'Луша') {
        b = '#a3e635'; l = '#84cc16'; d = '#fef08a';
    }

    const e = '#000000'; // eye
    const w = '#ffffff'; // white eye
    const k = '#f59e0b'; // beak
    const f = '#ea580c'; // feet
    const _ = null;

    const pixelsIdle = [
        [_,_,b,b,b,b,_,_],
        [_,b,b,w,e,b,k,_],
        [_,b,b,b,b,k,_,_],
        [l,l,b,d,d,b,_,_],
        [l,l,b,d,d,b,_,_],
        [_,_,b,b,b,_,_,_],
        [_,_,f,_,f,_,_,_],
        [_,_,_,_,_,_,_,_],
    ];

    const pixelsFlap = [
        [_,_,_,_,_,_,_,_],
        [_,_,b,b,b,b,_,_],
        [_,b,b,w,e,b,k,_],
        [l,l,b,b,b,k,_,_],
        [l,l,b,d,d,b,_,_],
        [_,_,b,b,b,_,_,_],
        [_,_,f,_,f,_,_,_],
        [_,_,_,_,_,_,_,_],
    ];

    const grid = isDead || !isFlap ? pixelsIdle : pixelsFlap;

    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {
            if (grid[r] && grid[r][c]) {
               ctx.fillStyle = grid[r][c] as string;
               ctx.fillRect(c*ps, r*ps, ps, ps);
            }
        }
    }
    ctx.restore();
}

// --- Game Constants ---
const GRAVITY = 0.6;
const MAX_FALL_SPEED = 12;
const JUMP_FORCE = -12;
const SPEED = 5;
const FRICTION = 0.8;
const GROUND_Y = 500;
const SYNC_INTERVAL = 600;

interface PlayerNetworkState {
  userId: string;
  username: string;
  character: CharacterType;
  x: number;
  y: number;
  hp: number;
  coins: number;
  isDead: boolean;
  updatedAt: number;
}

// --- Sound Synthesis Helpers ---
let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = (): AudioContext => {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
};

const playChirpSound = () => {
    try {
        const audioCtx = getAudioContext();
        
        // A real parrot in distress makes a rapid, dual-tone screeched high-pitched "chirp-chirp!"
        // Sweet rapid chirp-up oscillation 1
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        const now = audioCtx.currentTime;
        osc1.frequency.setValueAtTime(900, now);
        osc1.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
        
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        osc1.start(now);
        osc1.stop(now + 0.15);

        // Second distress chirp for highly convincing bird plaintive feeling as requested!
        setTimeout(() => {
            try {
                const audioCtxInner = getAudioContext();
                const osc2 = audioCtxInner.createOscillator();
                const gain2 = audioCtxInner.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtxInner.destination);
                osc2.type = 'sine';
                const now2 = audioCtxInner.currentTime;
                osc2.frequency.setValueAtTime(1100, now2);
                osc2.frequency.exponentialRampToValueAtTime(2000, now2 + 0.1);
                
                gain2.gain.setValueAtTime(0.20, now2);
                gain2.gain.exponentialRampToValueAtTime(0.01, now2 + 0.12);
                
                osc2.start(now2);
                osc2.stop(now2 + 0.12);
            } catch (e) {}
        }, 70);
    } catch (e) {}
};

const playCoinSound = () => {
    try {
        const audioCtx = getAudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        
        osc.start(now);
        osc.stop(now + 0.25);
    } catch (e) {}
};

const playPowerupSound = () => {
    try {
        const audioCtx = getAudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'triangle';
        const now = audioCtx.currentTime;
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.15);
        osc.frequency.linearRampToValueAtTime(900, now + 0.3);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.3);
    } catch (e) {}
};

export function Game() {
  const { gameId } = useParams();
  const { userId, username, character } = useGameStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  
  const [players, setPlayers] = useState<Record<string, PlayerNetworkState>>({});
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(true);
  
  const [localHp, setLocalHp] = useState(3);
  const [localCoins, setLocalCoins] = useState(0);
  const [localDead, setLocalDead] = useState(false);
  const [localStarted, setLocalStarted] = useState(false);

  // Guest bird chooser overlay state
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestBird, setGuestBird] = useState<CharacterType>('Кеша');
  const [joiningGuest, setJoiningGuest] = useState(false);
  const [guestError, setGuestError] = useState('');

  // Invite link copying state helpers
  const [copied, setCopied] = useState(false);
  const handleCopyLink = () => {
      const inviteUrl = window.location.origin + `/#/game/${gameId}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      }).catch(err => {
          console.error('Failed to copy link:', err);
      });
  };

  // Mobile customizable preferences saved in localStorage
  const [controlPosition, setControlPosition] = useState<'fullscreen' | 'left' | 'right'>(() => {
      return (localStorage.getItem('parrot_pref_pos') as any) || 'fullscreen';
  });
  const [controlSize, setControlSize] = useState<'medium' | 'large' | 'giant'>(() => {
      return (localStorage.getItem('parrot_pref_size') as any) || 'medium';
  });
  const [controlOpacity, setControlOpacity] = useState<'low' | 'medium' | 'high'>(() => {
      return (localStorage.getItem('parrot_pref_opacity') as any) || 'medium';
  });
  const [showMobileSettings, setShowMobileSettings] = useState(false);

  // Save changes to localStorage on adjustments
  useEffect(() => {
      localStorage.setItem('parrot_pref_pos', controlPosition);
  }, [controlPosition]);

  useEffect(() => {
      localStorage.setItem('parrot_pref_size', controlSize);
  }, [controlSize]);

  useEffect(() => {
      localStorage.setItem('parrot_pref_opacity', controlOpacity);
  }, [controlOpacity]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);
  const gameStateRef = useRef(gameState);
  const seedRef = useRef(0);

  // Sync caches
  const playersRef = useRef<Record<string, PlayerNetworkState>>({});
  const renderCoordsRef = useRef<Record<string, { x: number, y: number }>>({});
  const collectedGlobalRef = useRef<Record<string, number>>({});

  // Local physics state
  const physicsRef = useRef({
    x: 100, y: 300, vx: 0, vy: 0, 
    hp: 3, coins: 0, isDead: false, started: false,
    speedBoostUntil: 0, slowUntil: 0,
    collectedObjects: new Set<string>(),
    invincibleUntil: 0,
    onPlatform: false
  });

  // Input states
  const keys = useRef({ left: false, right: false, up: false });

  // Network Sync Setup - Handles direct access, setting NAMELESS as first fallback name
  useEffect(() => {
    if (!gameId) { navigate('/'); return; }

    const activeUserId = userId || generateLocalUserId();
    if (!userId) {
        useGameStore.getState().setUserId(activeUserId);
    }
    const activeUsername = username || 'NAMELESS';
    if (!username) {
        useGameStore.getState().setUsername(activeUsername);
    }
    const activeCharacter = character || 'Кеша';

    const initGame = async () => {
      const gRef = doc(db, 'games', gameId);
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) { navigate('/'); return; }
      
      const gData = gSnap.data();
      const hostIsUser = gData.hostId === activeUserId;
      setIsHost(hostIsUser);
      setGameState(gData.status);
      gameStateRef.current = gData.status;
      seedRef.current = gData.seed || 12345;

      try {
          const pRef = doc(db, 'games', gameId, 'players', activeUserId);
          const pSnap = await getDoc(pRef);
          
          if (hostIsUser) {
              if (!pSnap.exists()) {
                 await setDoc(pRef, {
                   userId: activeUserId, 
                   username: activeUsername, 
                   character: activeCharacter,
                   x: 100, y: 300, hp: 3, coins: 0, isDead: false, updatedAt: Date.now()
                 });
              } else {
                 await updateDoc(pRef, {
                    x: 100, y: 300, hp: 3, isDead: false, updatedAt: Date.now()
                 });
              }
              setHasJoinedRoom(true);
          } else {
              // Guest players join automatically! No mandatory selection screen.
              let guestUsername = activeUsername;
              if (guestUsername === 'NAMELESS') {
                  guestUsername = `GUEST_${Math.floor(100 + Math.random() * 900)}`;
                  useGameStore.getState().setUsername(guestUsername);
              }
              const guestChar = activeCharacter || 'Кеша';
              
              if (!pSnap.exists()) {
                  await setDoc(pRef, {
                      userId: activeUserId,
                      username: guestUsername,
                      character: guestChar,
                      x: 100, y: 300, hp: 3, coins: 0, isDead: false, updatedAt: Date.now()
                  });
              } else {
                  // Already registered
                  const pData = pSnap.data();
                  if (pData?.username) {
                      guestUsername = pData.username;
                      useGameStore.getState().setUsername(guestUsername);
                  }
                  if (pData?.character) {
                      useGameStore.getState().setCharacter(pData.character);
                  }
                  await updateDoc(pRef, {
                      x: 100, y: 300, hp: 3, isDead: false, updatedAt: Date.now()
                  });
              }
              setHasJoinedRoom(true);
          }
      } catch (e) {
          console.error(e);
      }
      setLoading(false);
    };

    initGame();

    const unsubGame = onSnapshot(doc(db, 'games', gameId), (doc) => {
        if (doc.exists()) {
            setGameState(doc.data()?.status);
            gameStateRef.current = doc.data()?.status;
            // Capture global respawning items
            collectedGlobalRef.current = doc.data()?.collected || {};
        }
    });

    const unsubPlayers = onSnapshot(collection(db, 'games', gameId, 'players'), (snapshot) => {
      const pData: Record<string, PlayerNetworkState> = {};
      let allDead = true;
      let hasPlayers = false;

      snapshot.forEach(d => {
          hasPlayers = true;
          const data = d.data() as PlayerNetworkState;
          if (data.userId !== activeUserId) { // Don't override local predictable state
              pData[data.userId] = data;
          }
          if (!data.isDead) allDead = false;
      });
      playersRef.current = pData; // Update ref for 60FPS canvas loop
      if (gameStateRef.current !== 'playing') {
          setPlayers(pData);
      }

      // Check if host status demands finishing game status
      const checkFinish = async () => {
         const gRef = doc(db, 'games', gameId);
         const gSnap = await getDoc(gRef);
         if (gSnap.exists()) {
              const gData = gSnap.data();
              if (hasPlayers && allDead && gData.hostId === activeUserId && gameStateRef.current === 'playing') {
                  await updateDoc(gRef, { status: 'finished' });
              }
         }
      };
      checkFinish().catch(console.error);
    });

    return () => {
        unsubGame();
        unsubPlayers();
        cancelAnimationFrame(requestRef.current);
    }
  }, [userId, username, character, gameId, navigate]);

  const startGame = async () => {
      if (isHost && gameId) {
          await updateDoc(doc(db, 'games', gameId), { status: 'playing' });
      }
  }

  // Periodically sync playersRef.current to players state during gameplay to avoid React overloading
  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
        setPlayers({ ...playersRef.current });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // --- GAME LOOP ---
  useEffect(() => {
    if (gameState !== 'playing' || !userId || !gameId || loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let chunks: Record<number, GameObject[]> = {};
    const phys = physicsRef.current;

    const resize = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const aspect = window.innerWidth / window.innerHeight;
        canvas.height = 600;
        canvas.width = 600 * aspect;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
    window.addEventListener('resize', resize);
    resize();

    // Input listening
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
         if (!phys.started) {
             phys.started = true;
             setLocalStarted(true);
         }
         keys.current.up = true;
         if (phys.onPlatform) {
             phys.vy = JUMP_FORCE;
         }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') keys.current.up = false;
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Sync to network
    const syncState = () => {
        const now = Date.now();
        if (now - lastSyncRef.current > SYNC_INTERVAL) {
            updateDoc(doc(db, 'games', gameId, 'players', userId), {
                x: phys.x, y: phys.y, hp: phys.hp, coins: phys.coins, isDead: phys.isDead, updatedAt: now
            });
            lastSyncRef.current = now;
        }
    }

    const loop = (time: number) => {
        const now = Date.now();

        // Physics
        let currentChunk = Math.floor(phys.x / 1000);
        let onPlatform = false;

        if (!phys.isDead && phys.started) {
            let currentSpeed = SPEED;
            if (now < phys.speedBoostUntil) currentSpeed *= 1.5;
            if (now < phys.slowUntil) currentSpeed *= 0.6; // Puddles temporarily slow down to 60% speed

            phys.vx = currentSpeed; // Auto run

            phys.vy += GRAVITY;
            if (phys.vy > MAX_FALL_SPEED) phys.vy = MAX_FALL_SPEED;

            phys.x += phys.vx;
            phys.y += phys.vy;

            // Ground collision
            if (phys.y > GROUND_Y - 40) {
                phys.y = GROUND_Y - 40;
                phys.vy = 0;
                onPlatform = true;
            }

            // Chunks and solid platform / object collisions
            currentChunk = Math.floor(phys.x / 1000);
            for (let i = currentChunk - 1; i <= currentChunk + 1; i++) {
                if (!chunks[i]) chunks[i] = generateChunk(i, seedRef.current);
                
                // Track solid pass-through platform landings (Mario Style)
                chunks[i].forEach(obj => {
                    if (obj.type === 'platform') {
                        // Check horizontal intersection boundaries
                        const isXIntersect = phys.x + 32 > obj.x && phys.x + 8 < obj.x + obj.width;
                        
                        const prevBottom = phys.y + 40 - phys.vy;
                        const currBottom = phys.y + 40;
                        
                        // We land if feet crossed the platform top while descending
                        const isAboveBefore = prevBottom <= obj.y + 8;
                        const crossedOrOnPlatform = currBottom >= obj.y;

                        if (isXIntersect && isAboveBefore && crossedOrOnPlatform && phys.vy >= 0) {
                            phys.y = obj.y - 40;
                            phys.vy = 0;
                            onPlatform = true;
                        }
                    }
                });

                // Helper item and obstacle collisions
                chunks[i].forEach(obj => {
                    if (obj.type === 'platform') return; // Handled separately above

                    // Skip locally/globally collected respawning items
                    const isCollectedGlobally = collectedGlobalRef.current[obj.id] && now < collectedGlobalRef.current[obj.id];
                    if (isCollectedGlobally) return;

                    const isHit = phys.x < obj.x + obj.width && phys.x + 40 > obj.x &&
                                  phys.y < obj.y + obj.height && phys.y + 40 > obj.y;

                    if (isHit) {
                        if (obj.type === 'coin') {
                            phys.coins++;
                            playCoinSound();
                            setLocalCoins(phys.coins);
                            updateDoc(doc(db, 'games', gameId, 'players', userId), {
                                 hp: phys.hp, coins: phys.coins, updatedAt: now
                            });
                            // Store global respawn time of 5-10s randomly for excitement
                            updateDoc(doc(db, 'games', gameId), {
                                 [`collected.${obj.id}`]: now + (6000 + Math.floor(Math.random() * 4000))
                            });
                        } else if (obj.type === 'carrot') {
                            phys.speedBoostUntil = now + 10000; // 10 seconds speed boost as requested!
                            playPowerupSound();
                            updateDoc(doc(db, 'games', gameId), {
                                 [`collected.${obj.id}`]: now + (8000 + Math.floor(Math.random() * 4000))
                            });
                        } else if (obj.type === 'health') {
                            phys.hp = Math.min(3, phys.hp + 1);
                            playPowerupSound();
                            setLocalHp(phys.hp);
                            updateDoc(doc(db, 'games', gameId, 'players', userId), {
                                 hp: phys.hp, updatedAt: now
                            });
                            updateDoc(doc(db, 'games', gameId), {
                                 [`collected.${obj.id}`]: now + (8000 + Math.floor(Math.random() * 4000))
                            });
                        } else if (obj.type === 'obstacle') {
                            // Only trigger hazard hit if not invincible
                            if (!phys.invincibleUntil || now >= phys.invincibleUntil) {
                                phys.hp--;
                                playChirpSound(); // Plaintive chirp sound !
                                setLocalHp(phys.hp);
                                phys.vy = -6; // knockback bounce back up
                                phys.vx = -8;
                                phys.invincibleUntil = now + 1200; // 1.2s safety flash

                                if (phys.hp <= 0) {
                                    phys.isDead = true;
                                    setLocalDead(true);
                                }
                                updateDoc(doc(db, 'games', gameId, 'players', userId), {
                                     hp: phys.hp, isDead: phys.isDead, updatedAt: now
                                });
                            }
                        } else if (obj.type === 'slow') {
                            phys.slowUntil = now + 5000; // Slow down for 5 seconds as requested!
                        }
                    }
                });
            }
        }

        // Cache persistent state on ref to support jumping actions from other event listeners
        phys.onPlatform = onPlatform;

        // Draw Sky
        ctx.fillStyle = '#38bdf8'; // sky blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let targetCameraX = phys.x;
        if (phys.isDead) { // Follow fastest player
            let fastX = phys.x;
            Object.values(playersRef.current).forEach((p: PlayerNetworkState) => {
                if (!p.isDead && p.x > fastX) fastX = p.x;
            });
            targetCameraX = fastX;
        }
        
        let targetChunk = Math.floor(targetCameraX / 1000);
        for (let i = targetChunk - 1; i <= targetChunk + 2; i++) {
            if (!chunks[i]) chunks[i] = generateChunk(i, seedRef.current);
        }

        const cameraX = Math.max(0, targetCameraX - canvas.width * 0.3); // Follow player
        ctx.save();
        ctx.translate(-cameraX, 0);

        // Draw Clouds (parallax scrolling)
        ctx.fillStyle = '#ffffff';
        for (let i = targetChunk - 1; i <= targetChunk + 2; i++) {
            const cx = i * 1000 + (Math.abs((seedRef.current + i * 777) % 500));
            ctx.fillRect(cx - cameraX * 0.5, 100, 100, 30);
            ctx.fillRect(cx + 20 - cameraX * 0.5, 80, 60, 20);
        }

        // Ground top line and mud layer
        ctx.fillStyle = '#4ade80'; // grass top
        ctx.fillRect(cameraX, GROUND_Y, canvas.width, 20);
        ctx.fillStyle = '#a3e635'; // grass body
        ctx.fillRect(cameraX, GROUND_Y + 20, canvas.width, canvas.height - GROUND_Y - 20);

        // Draw Chunks
        for (let i = targetChunk - 1; i <= targetChunk + 2; i++) {
            if (!chunks[i]) continue;
            chunks[i].forEach(obj => {
                // Check globally collected status before rendering
                const isCollectedGlobally = collectedGlobalRef.current[obj.id] && now < collectedGlobalRef.current[obj.id];
                if (isCollectedGlobally) return;

                if (obj.x < cameraX - 100 || obj.x > cameraX + canvas.width + 100) return;

                if (obj.type === 'coin') {
                    // Gold Coin
                    ctx.beginPath();
                    ctx.arc(obj.x + 10, obj.y + 10, 10, 0, Math.PI * 2);
                    ctx.fillStyle = '#eab308'; // darker gold outline
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(obj.x + 10, obj.y + 10, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#fef08a'; // bright gold center
                    ctx.fill();
                } else if (obj.type === 'carrot') {
                    // Draw a cute retro carrot item
                    ctx.fillStyle = '#f97316'; // orange carrot core
                    ctx.beginPath();
                    ctx.moveTo(obj.x + 6, obj.y + 4);
                    ctx.lineTo(obj.x + 18, obj.y + 4);
                    ctx.lineTo(obj.x + 12, obj.y + 22);
                    ctx.closePath();
                    ctx.fill();
                    // Green leafy carrot plume
                    ctx.fillStyle = '#22c55e';
                    ctx.fillRect(obj.x + 10, obj.y - 2, 4, 6);
                } else if (obj.type === 'platform') {
                    // Drawn as sturdy clay-colored retro bricks
                    ctx.fillStyle = '#b45309'; 
                    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
                    
                    // Luminous green moss/grass top layer
                    ctx.fillStyle = '#4ade80'; 
                    ctx.fillRect(obj.x, obj.y, obj.width, 6);
                    
                    // Sleek pixel grid outlines
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
                } else if (obj.type === 'health') { // Apple
                    ctx.beginPath();
                    ctx.arc(obj.x + 15, obj.y + 18, 12, 0, Math.PI * 2);
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();
                    ctx.fillStyle = '#22c55e'; // leaf
                    ctx.fillRect(obj.x + 15, obj.y + 2, 8, 8);
                    ctx.fillStyle = '#78350f'; // stem
                    ctx.fillRect(obj.x + 12, obj.y + 2, 4, 8);
                } else if (obj.type === 'obstacle') { // Cactus or Spike or Bird
                    if (obj.y < 400) { // Bird (Pixel Art Style)
                         ctx.fillStyle = '#1e40af'; ctx.fillRect(obj.x + 10, obj.y + 10, 20, 15); // body main
                         ctx.fillStyle = '#1e3a8a'; ctx.fillRect(obj.x + 5, obj.y + 15, 5, 5); // tail
                         // Wing flapping
                         if (Math.floor(now / 150) % 2 === 0) {
                             ctx.fillStyle = '#60a5fa'; ctx.fillRect(obj.x + 15, obj.y + 5, 10, 5); // wing up
                         } else {
                             ctx.fillStyle = '#60a5fa'; ctx.fillRect(obj.x + 15, obj.y + 20, 10, 5); // wing down
                         }
                         ctx.fillStyle = '#f59e0b'; ctx.fillRect(obj.x - 5, obj.y + 15, 10, 5); // beak
                         ctx.fillStyle = 'white'; ctx.fillRect(obj.x + 5, obj.y + 10, 5, 5); // eye
                         ctx.fillStyle = 'black'; ctx.fillRect(obj.x + 5, obj.y + 12, 2, 2); // pupil
                    } else { // Cactus (Detailed)
                         ctx.fillStyle = '#15803d'; // main stalk back
                         ctx.fillRect(obj.x + 12, obj.y, 16, obj.height);
                         ctx.fillStyle = '#22c55e'; // main stalk front detail
                         ctx.fillRect(obj.x + 15, obj.y, 10, obj.height);
                         // left arm
                         ctx.fillStyle = '#16a34a'; ctx.fillRect(obj.x + 2, obj.y + 15, 10, 8);
                         ctx.fillRect(obj.x + 2, obj.y + 5, 8, 15);
                         // right arm
                         ctx.fillStyle = '#16a34a'; ctx.fillRect(obj.x + 28, obj.y + 20, 12, 8);
                         ctx.fillRect(obj.x + 32, obj.y + 10, 8, 15);
                    }
                } else if (obj.type === 'slow') { // Mud
                    // Mud puddle
                    ctx.fillStyle = '#451a03'; ctx.beginPath(); ctx.ellipse(obj.x + obj.width/2, obj.y + 15, obj.width/2, 10, 0, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.ellipse(obj.x + obj.width/2 - 10, obj.y + 15, obj.width/2 - 5, 8, 0, 0, Math.PI*2); ctx.fill();
                }
            });
        }

        // Draw Other Players with Smooth Interpolation Lerp
        Object.values(playersRef.current).forEach((p: PlayerNetworkState) => {
             if (p.isDead || p.userId === userId) return;
             if (p.x < cameraX - 100 || p.x > cameraX + canvas.width + 100) return;
             
             // Initialize smoother tracking positions
             if (!renderCoordsRef.current[p.userId]) {
                 renderCoordsRef.current[p.userId] = { x: p.x, y: p.y };
             }
             const rc = renderCoordsRef.current[p.userId];
             rc.x += (p.x - rc.x) * 0.15; // Smooth horizontal slide
             rc.y += (p.y - rc.y) * 0.15; // Smooth vertical glide

             drawPixelParrot(ctx, rc.x, rc.y, 40, p.character, p.isDead, now);
             // Nicknames for others
             ctx.font = 'bold 14px "VT323", monospace';
             const textWidth = ctx.measureText(p.username).width;
             ctx.fillStyle = 'rgba(0,0,0,0.5)';
             ctx.fillRect(rc.x + 20 - textWidth/2 - 4, rc.y - 18, textWidth + 8, 14);
             ctx.fillStyle = '#fbbf24';
             ctx.textAlign = 'center';
             ctx.fillText(p.username, rc.x + 20, rc.y - 6);
             ctx.textAlign = 'left';
        });

        // Draw Local Player
        if (!phys.isDead) {
            // Blink if currently invincible (damage cooldown)
            const isInvincible = phys.invincibleUntil && now < phys.invincibleUntil;
            const skipPulse = isInvincible && Math.floor(now / 100) % 2 === 0;

            if (!skipPulse) {
                drawPixelParrot(ctx, phys.x, phys.y, 40, character, phys.isDead, now);
            }
            
            // Name tag for local player
            ctx.font = 'bold 14px "VT323", monospace';
            const textWidth = ctx.measureText(username).width;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(phys.x + 20 - textWidth/2 - 4, phys.y - 18, textWidth + 8, 14);
            ctx.fillStyle = '#a3e635'; // distinct light green color
            ctx.textAlign = 'center';
            ctx.fillText(username, phys.x + 20, phys.y - 6);
            ctx.textAlign = 'left';
            
            // Aura overlay for active boosts/debuffs
            if (now < phys.speedBoostUntil) {
                ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 4; ctx.strokeRect(phys.x-4, phys.y-4, 48, 48);
            }
            if (now < phys.slowUntil) {
                ctx.fillStyle = 'rgba(120, 53, 15, 0.5)'; ctx.fillRect(phys.x, phys.y, 40, 40);
            }
        }

        ctx.restore();

        syncState();
        requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(requestRef.current);
    }
  }, [gameState, userId, gameId, isHost, character, loading]);

  const buySpeed = () => {
      if (physicsRef.current.coins >= 10 && !physicsRef.current.isDead) {
          physicsRef.current.coins -= 10;
          physicsRef.current.speedBoostUntil = Date.now() + 30000;
          setLocalCoins(physicsRef.current.coins);
      }
  };

  const buyTeleport = () => {
      if (physicsRef.current.coins >= 20 && !physicsRef.current.isDead) {
          physicsRef.current.coins -= 20;
          setLocalCoins(physicsRef.current.coins);

          // Find fast/slow
          let fastX = physicsRef.current.x;
          let slowX = physicsRef.current.x;
          Object.values(playersRef.current).forEach((p: PlayerNetworkState) => {
              if (p.isDead) return;
              if (p.x > fastX) fastX = p.x;
              if (p.x < slowX) slowX = p.x;
          });

          // "teleport to a random location... no more than 10 units away from fastest, no less than 10 away from slowest"
          // This constraint means somewhere between slowX + 10 and fastX + 10.
          const min = slowX + 10;
          const max = fastX + 10;
          const newX = min + Math.random() * Math.max(0, max - min);
          
          physicsRef.current.x = newX;
          physicsRef.current.y = 100; // Drop from sky
          physicsRef.current.vy = 0;
      }
  }

  // Mobile inputs integration
  const handleStart = () => {
      physicsRef.current.started = true;
      setLocalStarted(true);
  };

  const hDown = (dir: 'up') => { 
      // Auto start on jump tap
      if (!physicsRef.current.started) handleStart();

      keys.current[dir] = true; 
      if(dir==='up' && physicsRef.current.onPlatform) physicsRef.current.vy = JUMP_FORCE; 
  }
  const hUp = (dir: 'up') => { keys.current[dir] = false; }

  return (
    <div className="w-full h-full relative bg-sky-900 overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-50">Loading...</div>}
        
        {/* Debug / Score UI */}
        <div className="absolute top-4 left-4 z-10 flex gap-6 text-white font-mono bg-black/80 px-4 py-2 border-4 border-black pointer-events-none">
            <div className="flex items-center gap-2 text-2xl uppercase"><Heart className="text-red-500 fill-red-500" size={24}/> {localHp}</div>
            <div className="flex items-center gap-2 text-2xl uppercase text-yellow-400"><Coins className="fill-yellow-400" size={24}/> {localCoins}</div>
        </div>

        {/* Floating Mobile Controls Customizer Button */}
        <div className="absolute top-4 right-4 z-40 select-none">
            <button 
                onClick={() => setShowMobileSettings(!showMobileSettings)} 
                className="bg-yellow-400 hover:bg-yellow-300 text-black border-4 border-black p-3 shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] uppercase font-bold tracking-widest text-lg flex items-center gap-2 cursor-pointer"
            >
                ⚙️ CONTROLS
            </button>
        </div>

        {/* Mobile Settings Modal Overlay */}
        {showMobileSettings && (
            <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <div className="bg-white border-4 border-black text-black p-6 w-full max-w-md shadow-[8px_8px_0_0_#000] font-mono relative">
                    <h3 className="text-3xl font-bold uppercase tracking-widest border-b-4 border-black pb-3 mb-4 flex justify-between items-center">
                        <span>⚙️ CONTROLS</span>
                        <button onClick={() => setShowMobileSettings(false)} className="text-red-600 font-bold hover:scale-110 active:scale-90 text-2xl px-2">X</button>
                    </h3>
                    
                    <div className="space-y-6">
                        {/* 1. BUTTON PLACE */}
                        <div>
                            <span className="block text-base font-bold uppercase mb-2 text-slate-700">📌 BUTTON POSITION</span>
                            <div className="grid grid-cols-3 gap-2">
                                {(['fullscreen', 'left', 'right'] as const).map((pos) => (
                                    <button
                                        key={pos}
                                        type="button"
                                        onClick={() => setControlPosition(pos)}
                                        className={cn(
                                            "border-2 border-black p-2 text-xs font-bold uppercase tracking-tight cursor-pointer",
                                            controlPosition === pos ? "bg-sky-400 text-black shadow-[2px_2px_0_0_#000]" : "bg-slate-100 text-slate-500"
                                        )}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. BUTTON SIZE */}
                        <div>
                            <span className="block text-base font-bold uppercase mb-2 text-slate-700">📏 TOUCH BUTTON SIZE</span>
                            <div className="grid grid-cols-3 gap-2">
                                {(['medium', 'large', 'giant'] as const).map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setControlSize(size)}
                                        className={cn(
                                            "border-2 border-black p-2 text-xs font-bold uppercase tracking-tight cursor-pointer",
                                            controlSize === size ? "bg-amber-400 text-black shadow-[2px_2px_0_0_#000]" : "bg-slate-100 text-slate-500"
                                        )}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3. OPACITY */}
                        <div>
                            <span className="block text-base font-bold uppercase mb-2 text-slate-700">🔅 BUTTON OPACITY</span>
                            <div className="grid grid-cols-3 gap-2">
                                {(['low', 'medium', 'high'] as const).map((op) => (
                                    <button
                                        key={op}
                                        type="button"
                                        onClick={() => setControlOpacity(op)}
                                        className={cn(
                                            "border-2 border-black p-2 text-xs font-bold uppercase tracking-tight cursor-pointer",
                                            controlOpacity === op ? "bg-lime-400 text-black shadow-[2px_2px_0_0_#000]" : "bg-slate-100 text-slate-500"
                                        )}
                                    >
                                        {op === 'low' ? '30%' : op === 'medium' ? '65%' : '95%'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button 
                        type="button"
                        onClick={() => setShowMobileSettings(false)} 
                        className="mt-6 w-full bg-green-400 hover:bg-green-300 border-4 border-black text-black py-3 font-bold text-xl uppercase shadow-[4px_4px_0_0_#000] cursor-pointer"
                    >
                        ✓ APPLY PREFERENCES
                    </button>
                </div>
            </div>
        )}

        {/* Guest Onboarding Choice Dialog */}
        {gameState === 'waiting' && !loading && !hasJoinedRoom && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-sky-450 z-50 p-4" style={{ backgroundImage: 'radial-gradient(#38bdf8 20%, transparent 20%)', backgroundSize: '20px 20px' }}>
                <div className="bg-white border-4 border-black p-8 w-full max-w-lg shadow-[8px_8px_0_0_#000] relative z-50 text-black font-mono">
                    <h2 className="text-3xl font-black text-center uppercase tracking-wider mb-2 text-transparent" style={{ WebkitTextStroke: '1.5px black' }}>
                         <span className="text-yellow-405">P</span><span className="text-orange-400">R</span><span className="text-red-400">E</span><span className="text-pink-400">P</span><span className="text-purple-400">A</span><span className="text-blue-400">R</span>E FOR RACE
                    </h2>
                    <p className="text-center text-sm font-bold text-slate-600 uppercase mb-6">Enter name & choose your flight feather!</p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-black uppercase mb-1 text-slate-700">✍ YOUR PILOT NAME</label>
                            <input
                                maxLength={12}
                                type="text"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value.toUpperCase())}
                                className="w-full bg-slate-100 border-4 border-black px-4 py-2 text-xl font-bold uppercase focus:outline-none placeholder:text-slate-400"
                                placeholder="PILOT NAME"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-black uppercase mb-2 text-slate-700">🎨 SELECT BIRD CHARACTER</label>
                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { id: 'Кеша', name: 'Kesha', color: 'bg-sky-200' },
                                    { id: 'Луша', name: 'Lusha', color: 'bg-lime-200' }
                                ] as const).map((bird) => (
                                    <button
                                        key={bird.id}
                                        type="button"
                                        onClick={() => setGuestBird(bird.id)}
                                        className={cn(
                                            "p-4 border-2 border-black flex flex-col items-center gap-2 transition-all cursor-pointer",
                                            guestBird === bird.id ? bird.color + " shadow-[4px_4px_0_0_#000] ring-4 ring-black" : "bg-slate-50 opacity-60 hover:opacity-100"
                                        )}
                                    >
                                        <div className="scale-100 pointer-events-none origin-center p-1">
                                            <LobbyParrotPreview type={bird.id} />
                                        </div>
                                        <span className="text-sm font-black uppercase text-center text-black">{bird.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {guestError && (
                            <div className="bg-red-200 border-4 border-red-500 p-2 text-center text-red-700 font-bold text-xs uppercase font-mono">
                                {guestError}
                            </div>
                        )}
                        
                        <button
                            type="button"
                            disabled={joiningGuest}
                            onClick={async () => {
                                if (!guestName.trim()) {
                                    setGuestError('Enter your pilot name first!');
                                    return;
                                }
                                setJoiningGuest(true);
                                setGuestError('');
                                try {
                                    const activeUserId = userId || generateLocalUserId();
                                    useGameStore.getState().setUsername(guestName.toUpperCase());
                                    useGameStore.getState().setCharacter(guestBird);
                                    
                                    const pRef = doc(db, 'games', gameId!, 'players', activeUserId);
                                    await setDoc(pRef, {
                                        userId: activeUserId,
                                        username: guestName.toUpperCase(),
                                        character: guestBird,
                                        x: 100, y: 300, hp: 3, coins: 0, isDead: false, updatedAt: Date.now()
                                    });
                                    setHasJoinedRoom(true);
                                } catch (e: any) {
                                    setGuestError(e.message || 'Error configuring pilot package');
                                } finally {
                                    setJoiningGuest(false);
                                }
                            }}
                            className="w-full bg-green-400 hover:bg-green-300 border-4 border-black text-black py-4 font-black text-xl uppercase shadow-[4px_4px_0_0_#000] active:translate-y-0.5 transition-all text-center cursor-pointer"
                        >
                            {joiningGuest ? 'REGISTERING...' : '✓ JOIN LOBBY & RACE!'}
                        </button>
                    </div>
                </div>
             </div>
        )}

        {gameState === 'waiting' && !loading && hasJoinedRoom && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-sky-400 z-20 p-4" style={{ backgroundImage: 'radial-gradient(#38bdf8 20%, transparent 20%)', backgroundSize: '20px 20px' }}>
                <div className="bg-white pixel-box p-8 w-[95%] max-w-4xl flex flex-col items-center relative z-10 before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmM2Y0ZjYiPjwvcmVjdD4KPHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2YzZjRmNiI+PC9yZWN0Pgo8L3N2Zz4=')] before:opacity-50 before:pointer-events-none overflow-y-auto max-h-full">
                    
                    <h1 className="text-4xl md:text-5xl font-bold mb-1 uppercase text-black text-center tracking-widest relative z-10">Room Status</h1>
                    
                    {/* Shareable Invite parameters display */}
                    <div className="mb-8 flex flex-col items-center gap-1.5 bg-slate-50 border-4 border-dashed border-slate-300 p-4 w-full max-w-xl relative z-10">
                        <span className="text-slate-600 font-bold uppercase tracking-wider text-xs">🔗 QUICK JOIN LINK (SHARE TO FRIENDS)</span>
                        <div className="flex gap-2 w-full">
                            <input 
                                readOnly 
                                value={window.location.origin + `/#/game/${gameId}`} 
                                className="bg-slate-200 border-2 border-black p-2 font-mono text-xs text-slate-700 flex-1 truncate select-all"
                            />
                            <button 
                                onClick={handleCopyLink}
                                className={cn("px-4 py-2 border-2 border-black font-bold uppercase text-xs select-none transition-all active:translate-y-0.5", copied ? "bg-green-400" : "bg-yellow-400 hover:bg-yellow-300")}
                            >
                                {copied ? 'COPIED!' : 'COPY'}
                            </button>
                        </div>
                    </div>
                    
                    {/* Character colors map */}
                    {(() => {
                        const birdBgColors: Record<CharacterType, string> = {
                            'Кеша': 'bg-sky-300',
                            'Луша': 'bg-lime-300'
                        };

                        return (
                            <div className="flex flex-wrap justify-center gap-5 mb-8 w-full relative z-10">
                                {/* Interactive Local Player Card (Customize nickname/bird inside room) */}
                                <div className="flex flex-col items-center bg-slate-100 p-4 pixel-box hover:shadow-[10px_10px_0_0_#3b82f6] transition-all w-52 border-4 border-blue-500 relative text-black">
                                    <span className="text-blue-600 text-xs font-black uppercase tracking-widest bg-blue-100 px-3 py-0.5 border-2 border-blue-600 rounded-full mb-3 select-none">YOU</span>
                                    
                                    <button 
                                        type="button"
                                        onClick={async () => {
                                            const chars: CharacterType[] = ['Кеша', 'Луша'];
                                            const nextIdx = (chars.indexOf(character) + 1) % chars.length;
                                            const nextChar = chars[nextIdx];
                                            useGameStore.getState().setCharacter(nextChar);
                                            if (gameId && userId) {
                                                await updateDoc(doc(db, 'games', gameId, 'players', userId), {
                                                    character: nextChar
                                                });
                                            }
                                        }}
                                        title="Click to cycle bird character!"
                                        className={cn("w-24 h-24 border-4 border-black mb-3 flex items-center justify-center relative overflow-hidden group cursor-pointer active:scale-95 transition-transform", birdBgColors[character] || "bg-sky-200 animate-pulse")}
                                    >
                                        <div className="scale-125 mb-1.5">
                                            <LobbyParrotPreview type={character} />
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 bg-black/75 text-[10px] uppercase font-black text-white tracking-widest py-1 select-none z-10">SWAP BIRD</div>
                                    </button>
                                    
                                    <span className="text-sm font-black text-black uppercase mb-2 select-none">BIRD: {character === 'Кеша' ? 'KESHA' : 'LUSHA'}</span>
                                    
                                    {/* Editable Nickname Input in real-time */}
                                    <input
                                        type="text"
                                        maxLength={12}
                                        value={username || ''}
                                        onChange={async (e) => {
                                            const newName = e.target.value.toUpperCase();
                                            useGameStore.getState().setUsername(newName);
                                            if (gameId && userId) {
                                                await updateDoc(doc(db, 'games', gameId, 'players', userId), {
                                                    username: newName
                                                });
                                            }
                                        }}
                                        className="w-full text-center text-lg font-extrabold uppercase text-black bg-white border-2 border-dashed border-slate-400 px-1 py-1 font-mono focus:outline-none focus:border-blue-500 mb-1"
                                        placeholder="NAMELESS"
                                    />
                                    
                                    <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Touch name to rewrite</span>
                                </div>

                                {/* Other Remote Players */}
                                {Object.values(players).map((p: PlayerNetworkState) => (
                                    <div key={p.userId} className="flex flex-col items-center bg-slate-100 p-4 pixel-box hover:-translate-y-1 hover:shadow-[10px_10px_0_0_#10b981] transition-all w-52 text-black">
                                        <span className="text-emerald-600 text-xs font-black uppercase tracking-widest bg-emerald-100 px-3 py-0.5 border-2 border-emerald-600 rounded-full mb-3">FRIEND</span>
                                        <div className={cn("w-24 h-24 border-4 border-black mb-3 flex items-center justify-center relative overflow-hidden", birdBgColors[p.character] || "bg-sky-200")}>
                                            <div className="scale-125 mb-1.5">
                                                <LobbyParrotPreview type={p.character} />
                                            </div>
                                            <div className="absolute inset-0 bg-black/5"></div>
                                        </div>
                                        <span className="text-sm font-black text-black uppercase mb-1">{p.character === 'Кеша' ? 'KESHA' : 'LUSHA'}</span>
                                        <span className="text-xl font-black uppercase text-black text-center truncate w-full px-2" title={p.username}>{p.username}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {isHost ? (
                        <button onClick={startGame} className="bg-lime-400 hover:bg-lime-300 w-full max-w-sm px-8 py-5 pixel-box font-black text-3xl uppercase tracking-widest text-black relative z-10 group overflow-hidden hover:scale-105 transition-transform active:scale-95 cursor-pointer">
                            <span className="relative z-10 flex items-center justify-center gap-3">START GAME <ArrowRight size={32} className="group-hover:translate-x-2 transition-transform stroke-[3px]"/></span>
                        </button>
                    ) : (
                        <div className="bg-amber-200 p-5 pixel-box w-full max-w-sm text-center relative z-10">
                            <p className="text-black text-2xl font-black uppercase flex items-center justify-center gap-3">
                                <span className="w-4 h-4 bg-black rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                                Waiting for Host
                                <span className="w-4 h-4 bg-black rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                            </p>
                        </div>
                    )}
                </div>
             </div>
        )}

        {gameState === 'playing' && !localStarted && !localDead && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 cursor-pointer backdrop-blur-sm" onClick={handleStart}>
                <div className="border-4 border-black bg-white shadow-[8px_8px_0_0_#000] p-8 text-center animate-bounce">
                    <h2 className="text-5xl text-black font-bold uppercase mb-4 tracking-widest px-8">Run!</h2>
                    <p className="text-xl font-mono text-slate-600 uppercase">Tap anywhere to run</p>
                </div>
            </div>
        )}

        {localDead && gameState === 'playing' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/85 text-white p-8 border-4 border-black z-30 flex flex-col items-center text-center shadow-[8px_8px_0_0_#000] font-mono">
                <h2 className="text-4xl font-bold text-red-500 mb-2 uppercase">You Died!</h2>
                <p className="text-lg uppercase">Spectating remaining players...</p>
            </div>
        )}

        {gameState === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 text-white font-mono">
                <h1 className="text-6xl font-black mb-4 text-red-500 uppercase tracking-wider">Game Over</h1>
                <p className="text-2xl mb-8 border-b-4 border-slate-700 pb-6 px-12 uppercase tracking-widest text-slate-300">All players have perished</p>
                <div className="flex gap-2 mt-4">
                     <button onClick={() => navigate('/lobby')} className="bg-sky-400 hover:bg-sky-300 text-black px-8 py-4 border-4 border-black font-black text-2xl uppercase shadow-[4px_4px_0_0_#000] active:translate-y-0.5 cursor-pointer">Return to Lobby</button>
                </div>
            </div>
        )}

        {gameState === 'playing' && !localDead && (
            <div className="absolute top-20 left-4 z-40 flex flex-col gap-3 select-none">
                <button onClick={buySpeed} className="w-48 bg-sky-200 hover:bg-sky-300 px-3 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] flex items-center justify-between group cursor-pointer">
                    <span className="font-bold text-base uppercase flex items-center gap-1"><Zap className="text-blue-600 fill-blue-500" size={16} /> SPEED</span>
                    <span className="font-bold text-base text-black flex items-center gap-1">10 <Coins className="text-yellow-600 fill-yellow-400" size={12}/></span>
                </button>
                <button onClick={buyTeleport} className="w-48 bg-purple-200 hover:bg-purple-300 px-3 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] flex items-center justify-between group cursor-pointer">
                    <span className="font-bold text-base uppercase flex items-center gap-1"><Orbit className="text-purple-600 fill-purple-500" size={16} /> RNDMZR</span>
                    <span className="font-bold text-base text-black flex items-center gap-1">20 <Coins className="text-yellow-600 fill-yellow-400" size={12}/></span>
                </button>
            </div>
        )}

        {/* Live Leaderboard HUD (Who's in the lead & how far ahead) */}
        {gameState === 'playing' && (
             <div className="absolute top-16 md:top-20 right-2 md:right-4 z-40 select-none font-mono flex flex-col items-end gap-2 max-w-[240px] md:max-w-xs pointer-events-none">
                 {!isLeaderboardOpen ? (
                     <button 
                         onClick={() => setIsLeaderboardOpen(true)}
                         className="bg-black/95 hover:bg-black border-2 border-yellow-400 text-yellow-400 px-3 py-1.5 shadow-[2px_2px_0_0_#000] text-xs font-black uppercase tracking-wider pointer-events-auto cursor-pointer flex items-center gap-1.5 touch-manipulation active:scale-95 transition-transform"
                     >
                         <span>🏆 STANDINGS</span>
                     </button>
                 ) : (
                     <div className="bg-black/85 border-2 md:border-4 border-black text-white p-2.5 md:p-3 shadow-[2px_2px_0_0_#000] md:shadow-[4px_4px_0_0_#000] w-56 md:w-64 pointer-events-auto rounded-none">
                         <h3 className="text-sm md:text-xl font-black border-b border-slate-700 pb-1 mb-1.5 uppercase text-yellow-400 tracking-wider flex items-center justify-between">
                             <span className="flex items-center gap-1">🏆 LEADERBOARD</span>
                             <div className="flex items-center gap-1.5">
                                 <span className="text-[9px] bg-yellow-500 text-black px-1.5 py-0.2 md:py-0.5 border border-black font-bold hidden sm:inline-block">LIVE</span>
                                 <button 
                                     onClick={() => setIsLeaderboardOpen(false)}
                                     className="text-white hover:text-red-400 text-xs font-bold font-sans bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 border border-slate-600 cursor-pointer touch-manipulation active:scale-90 select-none"
                                 >
                                     ✕
                                 </button>
                             </div>
                         </h3>
                         <div className="space-y-1 max-h-36 md:max-h-48 overflow-y-auto pr-1">
                             {(() => {
                                 // Join local and remote players
                                 const items = [
                                     {
                                         userId: userId || 'local',
                                         username: username || 'YOU',
                                         x: physicsRef.current.x,
                                         isDead: physicsRef.current.isDead,
                                         character: character
                                     },
                                     ...Object.values(players).map((p: any) => ({
                                         userId: p.userId,
                                         username: p.username,
                                         x: p.x,
                                         isDead: p.isDead,
                                         character: p.character
                                     }))
                                 ]
                                 .sort((a, b) => b.x - a.x); // Sort descending based on X coordinate!

                                 const leadPositionX = items[0]?.x || 0;

                                 return items.map((player, idx) => {
                                     const distMeters = Math.floor(player.x / 10);
                                     const lagMeters = Math.floor((leadPositionX - player.x) / 10);
                                     const isLeader = idx === 0 && !player.isDead;

                                     return (
                                         <div key={player.userId} className={cn("flex justify-between items-center text-xs md:text-sm py-0.5 md:py-1 border-b border-slate-800/50 last:border-0", player.isDead && "opacity-40 line-through")}>
                                             <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                                 <span className="font-bold text-slate-500">#{idx + 1}</span>
                                                 <span className={cn("font-black uppercase truncate", player.userId === (userId || 'local') ? "text-lime-400" : "text-yellow-100")}>
                                                     {player.username}
                                                 </span>
                                             </div>
                                             <div className="flex flex-col items-end shrink-0 pl-1.5">
                                                 <span className="font-bold text-[10px] md:text-xs">
                                                     {distMeters}m
                                                 </span>
                                                 {player.isDead ? (
                                                     <span className="text-[8px] md:text-[10px] text-red-500 font-bold uppercase">💀 DEAD</span>
                                                 ) : isLeader ? (
                                                     <span className="text-[8px] md:text-[10px] text-yellow-500 font-bold uppercase">👑 LEAD</span>
                                                 ) : (
                                                     <span className="text-[8px] md:text-[10px] text-sky-400 font-semibold font-mono">-{lagMeters}m</span>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 });
                             })()}
                         </div>
                     </div>
                 )}
             </div>
        )}

        {/* Global/Customized Mobile Jump Control Action */}
        {gameState === 'playing' && localStarted && !localDead && (
            <>
                {/* 1. Fullscreen Tap Target */}
                {controlPosition === 'fullscreen' && (
                    <div className="absolute inset-0 z-20 pointer-events-none touch-none">
                        <button 
                            onPointerDown={(e)=>{e.preventDefault(); hDown('up')}} onPointerUp={(e)=>{e.preventDefault(); hUp('up')}} onPointerLeave={() => hUp('up')}
                            className="absolute inset-x-0 bottom-0 top-32 w-full outline-none pointer-events-auto bg-transparent border-none cursor-pointer"
                        />
                        <div 
                            className={cn(
                                "absolute bottom-6 right-6 pointer-events-none bg-white border-4 border-black p-4 shadow-[4px_4px_0_0_#000] rotate-12 transition-all",
                                controlOpacity === 'low' ? "opacity-25" : controlOpacity === 'medium' ? "opacity-60" : "opacity-90"
                            )}
                        >
                            <span className="text-2xl font-bold uppercase tracking-widest flex items-center gap-2 text-black"><ArrowUp size={32} className="fill-black"/> JUMP</span>
                        </div>
                    </div>
                )}

                {/* 2. Positioned Custom Circle Touch Target */}
                {controlPosition !== 'fullscreen' && (
                    <div className="absolute inset-x-0 bottom-0 top-32 z-20 pointer-events-none select-none">
                        <button 
                            onPointerDown={(e)=>{e.preventDefault(); hDown('up')}} onPointerUp={(e)=>{e.preventDefault(); hUp('up')}} onPointerLeave={() => hUp('up')}
                            className={cn(
                                "absolute border-8 border-black rounded-full bg-rose-500 text-white font-black uppercase tracking-wider flex flex-col items-center justify-center shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-[2px_2px_0_0_#000] transition-all pointer-events-auto cursor-pointer",
                                controlPosition === 'left' ? "bottom-6 left-6" : "bottom-6 right-6",
                                controlSize === 'medium' ? "w-24 h-24 text-sm" : controlSize === 'large' ? "w-32 h-32 text-xl" : "w-40 h-40 text-2xl",
                                controlOpacity === 'low' ? "opacity-30" : controlOpacity === 'medium' ? "opacity-65" : "opacity-95"
                            )}
                        >
                            <ArrowUp size={controlSize === 'medium' ? 24 : controlSize === 'large' ? 36 : 48} className="fill-white" />
                            <span>JUMP</span>
                        </button>
                    </div>
                )}
            </>
        )}

        <canvas 
            ref={canvasRef} 
            className="w-full h-full block font-bold"
        />
    </div>
  );
}

