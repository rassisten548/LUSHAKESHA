import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore, CharacterType } from '../store';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, onSnapshot, updateDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Coins, Zap, Heart, Orbit, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateChunk, GameObject } from '../lib/GameEngine';

const drawPixelParrot = (ctx: CanvasRenderingContext2D, px: number, py: number, width: number, type: CharacterType, isDead: boolean, now: number) => {
    const ps = width / 8;
    const isFlap = Math.floor(now / 150) % 2 === 0;

    ctx.save();
    ctx.translate(px, py);
    if (isDead) { // draw upside down and offset back
        ctx.translate(width, width);
        ctx.rotate(Math.PI);
    }
    
    const b = type === 'Кеша' ? '#38bdf8' : '#a3e635'; // body
    const l = type === 'Кеша' ? '#0ea5e9' : '#84cc16'; // wing
    const d = type === 'Кеша' ? '#bae6fd' : '#fef08a'; // belly
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
const SYNC_INTERVAL = 300;

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

export function Game() {
  const { gameId } = useParams();
  const { userId, username, character } = useGameStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  
  const [players, setPlayers] = useState<Record<string, PlayerNetworkState>>({});
  
  const [localHp, setLocalHp] = useState(3);
  const [localCoins, setLocalCoins] = useState(0);
  const [localDead, setLocalDead] = useState(false);
  const [localStarted, setLocalStarted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);
  const gameStateRef = useRef(gameState);
  const seedRef = useRef(0);

  // Local physics state
  const physicsRef = useRef({
    x: 100, y: 300, vx: 0, vy: 0, 
    hp: 3, coins: 0, isDead: false, started: false,
    speedBoostUntil: 0, slowUntil: 0,
    collectedObjects: new Set<string>()
  });

  // Input states
  const keys = useRef({ left: false, right: false, up: false });

  // Network Sync Setup
  useEffect(() => {
    if (!userId || !gameId) { navigate('/'); return; }

    const initGame = async () => {
      const gRef = doc(db, 'games', gameId);
      const gSnap = await getDoc(gRef);
      if (!gSnap.exists()) { navigate('/'); return; }
      
      const gData = gSnap.data();
      if (gData.hostId === userId) setIsHost(true);
      setGameState(gData.status);
      gameStateRef.current = gData.status;
      seedRef.current = gData.seed || 12345;

      try {
          const pRef = doc(db, 'games', gameId, 'players', userId);
          const pSnap = await getDoc(pRef);
          if (!pSnap.exists()) {
             await setDoc(pRef, {
               userId, username, character,
               x: 100, y: 300, hp: 3, coins: 0, isDead: false, updatedAt: Date.now()
             });
          } else {
             await updateDoc(pRef, {
                x: 100, y: 300, hp: 3, isDead: false, updatedAt: Date.now()
             });
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
        }
    });

    const unsubPlayers = onSnapshot(collection(db, 'games', gameId, 'players'), (snapshot) => {
      const pData: Record<string, PlayerNetworkState> = {};
      let allDead = true;
      let hasPlayers = false;

      snapshot.forEach(d => {
          hasPlayers = true;
          const data = d.data() as PlayerNetworkState;
          if (data.userId !== userId) { // Don't override local predictable state
              pData[data.userId] = data;
          }
          if (!data.isDead) allDead = false;
      });
      setPlayers(pData);

      if (hasPlayers && allDead && isHost && gameStateRef.current === 'playing') {
         updateDoc(doc(db, 'games', gameId), { status: 'finished' }).catch(console.error);
      }
    });

    return () => {
        unsubGame();
        unsubPlayers();
        cancelAnimationFrame(requestRef.current);
    }
  }, [userId, gameId, navigate, username, character, isHost]);

  const startGame = async () => {
      if (isHost && gameId) {
          await updateDoc(doc(db, 'games', gameId), { status: 'playing' });
      }
  }

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
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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
         if (phys.y >= GROUND_Y - 40) phys.vy = JUMP_FORCE;
         keys.current.up = true;
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
        if (!phys.isDead && phys.started) {
            let currentSpeed = SPEED;
            if (now < phys.speedBoostUntil) currentSpeed *= 1.5;
            if (now < phys.slowUntil) currentSpeed *= 0.8;

            phys.vx = currentSpeed; // Auto run

            phys.vy += GRAVITY;
            if (phys.vy > MAX_FALL_SPEED) phys.vy = MAX_FALL_SPEED;

            phys.x += phys.vx;
            phys.y += phys.vy;

            // Ground collision
            if (phys.y > GROUND_Y - 40) {
                phys.y = GROUND_Y - 40;
                phys.vy = 0;
            }

            // Chunks and Collisions
            currentChunk = Math.floor(phys.x / 1000);
            for (let i = currentChunk - 1; i <= currentChunk + 1; i++) {
                if (!chunks[i]) chunks[i] = generateChunk(i, seedRef.current);
                
                // Collisions
                chunks[i].forEach(obj => {
                    if (phys.collectedObjects.has(obj.id)) return;
                    
                    const isHit = phys.x < obj.x + obj.width && phys.x + 40 > obj.x &&
                                  phys.y < obj.y + obj.height && phys.y + 40 > obj.y;

                    if (isHit) {
                        if (obj.type === 'coin') {
                            phys.coins++;
                            phys.collectedObjects.add(obj.id);
                            setLocalCoins(phys.coins);
                        } else if (obj.type === 'health') {
                            phys.hp = Math.min(3, phys.hp + 1);
                            phys.collectedObjects.add(obj.id);
                            setLocalHp(phys.hp);
                        } else if (obj.type === 'obstacle') {
                            phys.hp--;
                            phys.collectedObjects.add(obj.id);
                            setLocalHp(phys.hp);
                            phys.vy = -5; // knockback
                            phys.vx = -10;
                            if (phys.hp <= 0) {
                                phys.isDead = true;
                                setLocalDead(true);
                            }
                        } else if (obj.type === 'slow') {
                            phys.slowUntil = now + 2000;
                        }
                    }
                });
            }
        }

        // Draw
        ctx.fillStyle = '#38bdf8'; // sky blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let targetCameraX = phys.x;
        if (phys.isDead) { // Follow fastest player
            let fastX = phys.x;
            Object.values(players).forEach((p: PlayerNetworkState) => {
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

        // Draw Clouds (parallax)
        ctx.fillStyle = '#ffffff';
        for (let i = targetChunk - 1; i <= targetChunk + 2; i++) {
            const cx = i * 1000 + (Math.abs((seedRef.current + i * 777) % 500));
            ctx.fillRect(cx - cameraX * 0.5, 100, 100, 30);
            ctx.fillRect(cx + 20 - cameraX * 0.5, 80, 60, 20);
        }

        // Ground
        ctx.fillStyle = '#4ade80'; // grass top
        ctx.fillRect(cameraX, GROUND_Y, canvas.width, 20);
        ctx.fillStyle = '#a3e635'; // grass body
        ctx.fillRect(cameraX, GROUND_Y + 20, canvas.width, canvas.height - GROUND_Y - 20);

        // Draw Chunks
        for (let i = targetChunk - 1; i <= targetChunk + 2; i++) {
            if (!chunks[i]) continue;
            chunks[i].forEach(obj => {
                if (phys.collectedObjects.has(obj.id)) return;
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

        // Draw Other Players
        Object.values(players).forEach((p: PlayerNetworkState) => {
             if (p.isDead || p.userId === userId) return;
             if (p.x < cameraX - 100 || p.x > cameraX + canvas.width + 100) return;
             
             drawPixelParrot(ctx, p.x, p.y, 40, p.character, p.isDead, now);
             // Nicknames for others
             ctx.font = 'bold 14px "VT323", monospace';
             const textWidth = ctx.measureText(p.username).width;
             ctx.fillStyle = 'rgba(0,0,0,0.5)';
             ctx.fillRect(p.x + 20 - textWidth/2 - 4, p.y - 18, textWidth + 8, 14);
             ctx.fillStyle = '#fbbf24';
             ctx.textAlign = 'center';
             ctx.fillText(p.username, p.x + 20, p.y - 6);
             ctx.textAlign = 'left';
        });

        // Draw Local Player
        if (!phys.isDead) {
            drawPixelParrot(ctx, phys.x, phys.y, 40, character, phys.isDead, now);
            
            // Name tag for local player
            ctx.font = 'bold 14px "VT323", monospace';
            const textWidth = ctx.measureText(username).width;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(phys.x + 20 - textWidth/2 - 4, phys.y - 18, textWidth + 8, 14);
            ctx.fillStyle = '#a3e635'; // distinct color
            ctx.textAlign = 'center';
            ctx.fillText(username, phys.x + 20, phys.y - 6);
            ctx.textAlign = 'left';
            
            // Aura for buffs/debuffs
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
  }, [gameState, userId, gameId, isHost, players, character, loading]);

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
          Object.values(players).forEach((p: PlayerNetworkState) => {
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
      if(dir==='up' && physicsRef.current.y >= GROUND_Y - 40) physicsRef.current.vy = JUMP_FORCE; 
  }
  const hUp = (dir: 'up') => { keys.current[dir] = false; }

  return (
    <div className="w-full h-full relative bg-sky-900 overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white z-50">Loading...</div>}
        
        {/* Debug UI */}
        <div className="absolute top-4 left-4 z-10 flex gap-6 text-white font-mono bg-black/80 px-4 py-2 border-4 border-black pointer-events-none">
            <div className="flex items-center gap-2 text-2xl uppercase"><Heart className="text-red-500 fill-red-500" size={24}/> {localHp}</div>
            <div className="flex items-center gap-2 text-2xl uppercase text-yellow-400"><Coins className="fill-yellow-400" size={24}/> {localCoins}</div>
        </div>

        {gameState === 'waiting' && !loading && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-sky-400 z-20 p-4" style={{ backgroundImage: 'radial-gradient(#38bdf8 20%, transparent 20%)', backgroundSize: '20px 20px' }}>
                <div className="bg-white pixel-box p-8 w-[90%] max-w-4xl flex flex-col items-center relative z-10 before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmM2Y0ZjYiPjwvcmVjdD4KPHJlY3QgeD0iNCIgeT0iNCIgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2YzZjRmNiI+PC9yZWN0Pgo8L3N2Zz4=')] before:opacity-50 before:pointer-events-none overflow-hidden">
                    <h1 className="text-6xl font-bold mb-2 uppercase text-black text-center tracking-widest relative z-10">Room: <span className="text-white drop-shadow-[4px_4px_0_#2563eb]">{gameId}</span></h1>
                    <h2 className="text-2xl mb-10 text-slate-500 uppercase text-center relative z-10 tracking-widest font-bold">Waiting for players to join...</h2>
                    
                    <div className="flex flex-wrap justify-center gap-6 mb-12 w-full relative z-10">
                        {/* Local player */}
                        <div className="flex flex-col items-center bg-slate-100 p-4 pixel-box hover:-translate-y-2 hover:shadow-[10px_10px_0_0_#000] transition-all w-48">
                            <div className={cn("w-24 h-24 border-4 border-black mb-4 relative overflow-hidden", character === 'Кеша' ? "bg-sky-400" : "bg-lime-400")}>
                                <div className="absolute inset-0 bg-black/10"></div>
                            </div>
                            <span className="text-3xl font-bold uppercase text-black text-center leading-none truncate w-full px-2" title={username}>{username}</span>
                            <span className="text-blue-600 text-xl font-bold mt-2 bg-blue-100 px-3 py-1 border-2 border-blue-600 rounded-full leading-none">You</span>
                        </div>
                        {Object.values(players).map((p: PlayerNetworkState) => (
                            <div key={p.userId} className="flex flex-col items-center bg-slate-100 p-4 pixel-box hover:-translate-y-2 hover:shadow-[10px_10px_0_0_#000] transition-all w-48">
                                <div className={cn("w-24 h-24 border-4 border-black mb-4 relative overflow-hidden", p.character === 'Кеша' ? "bg-sky-400" : "bg-lime-400")}>
                                    <div className="absolute inset-0 bg-black/10"></div>
                                </div>
                                <span className="text-3xl font-bold uppercase text-black text-center leading-none truncate w-full px-2" title={p.username}>{p.username}</span>
                                <span className="text-slate-500 text-xl font-bold mt-2 bg-slate-200 px-3 py-1 border-2 border-slate-400 rounded-full leading-none">Player</span>
                            </div>
                        ))}
                    </div>
                    {isHost ? (
                        <button onClick={startGame} className="bg-lime-400 hover:bg-lime-300 w-full max-w-sm px-8 py-6 pixel-box font-bold text-4xl uppercase tracking-widest text-black relative z-10 group overflow-hidden hover:scale-105 transition-transform active:scale-95">
                            <span className="relative z-10 flex items-center justify-center gap-3">START <ArrowRight size={36} className="group-hover:translate-x-2 transition-transform stroke-[3px]"/></span>
                        </button>
                    ) : (
                        <div className="bg-amber-200 p-6 pixel-box w-full max-w-sm text-center relative z-10">
                            <p className="text-black text-3xl font-bold uppercase flex items-center justify-center gap-3">
                                <span className="w-5 h-5 bg-black rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                                Waiting
                                <span className="w-5 h-5 bg-black rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                            </p>
                        </div>
                    )}
                </div>
             </div>
        )}

        {gameState === 'playing' && !localStarted && !localDead && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 cursor-pointer backdrop-blur-sm" onClick={handleStart}>
                <div className="border-4 border-black bg-white shadow-[8px_8px_0_0_#000] p-8 text-center animate-bounce">
                    <h2 className="text-6xl text-black font-bold uppercase mb-4 tracking-widest px-8">Run!</h2>
                    <p className="text-2xl font-mono text-slate-600 uppercase">Tap to start running</p>
                </div>
            </div>
        )}

        {localDead && gameState === 'playing' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white p-8 border-4 border-black z-30 flex flex-col items-center text-center shadow-[8px_8px_0_0_#000]">
                <h2 className="text-5xl font-bold text-red-500 mb-2 uppercase">You Died!</h2>
                <p className="text-xl uppercase">Spectating remaining players...</p>
            </div>
        )}

        {gameState === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 text-white">
                <h1 className="text-7xl font-bold mb-6 text-red-500 uppercase text-shadow-md">Game Over</h1>
                <p className="text-3xl mb-8 border-b-4 border-slate-700 pb-8 px-12 uppercase font-mono tracking-widest text-slate-300">All players have perished</p>
                <div className="flex gap-2 mt-4">
                     <button onClick={() => navigate('/lobby')} className="bg-sky-400 hover:bg-sky-300 text-black px-8 py-4 pixel-box font-bold text-3xl uppercase">Return to Lobby</button>
                </div>
            </div>
        )}

        {gameState === 'playing' && !localDead && (
            <div className="absolute top-20 left-4 z-40 flex flex-col gap-3">
                <button onClick={buySpeed} className="w-48 bg-sky-200 hover:bg-sky-300 px-3 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] flex items-center justify-between group">
                    <span className="font-bold text-lg uppercase flex items-center gap-1"><Zap className="text-blue-600 fill-blue-500" size={18} /> SPEED</span>
                    <span className="font-bold text-lg text-black flex items-center gap-1">10 <Coins className="text-yellow-600 fill-yellow-400" size={12}/></span>
                </button>
                <button onClick={buyTeleport} className="w-48 bg-purple-200 hover:bg-purple-300 px-3 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] flex items-center justify-between group">
                    <span className="font-bold text-lg uppercase flex items-center gap-1"><Orbit className="text-purple-600 fill-purple-500" size={18} /> RNDMZR</span>
                    <span className="font-bold text-lg text-black flex items-center gap-1">20 <Coins className="text-yellow-600 fill-yellow-400" size={12}/></span>
                </button>
            </div>
        )}

        {/* Mobile Controls */}
        {gameState === 'playing' && !localDead && (
            <div className="absolute inset-x-0 bottom-8 z-20 flex justify-center px-4 md:hidden select-none pointer-events-none">
                <button 
                    onPointerDown={(e)=>{e.preventDefault(); hDown('up')}} onPointerUp={(e)=>{e.preventDefault(); hUp('up')}} onPointerLeave={() => hUp('up')}
                    className="w-full h-32 bg-white/70 active:bg-white/90 border-4 border-black shadow-[4px_4px_0_0_#000] active:translate-y-1 active:shadow-[0_0_0_0] flex items-center justify-center text-black pointer-events-auto"
                ><span className="text-4xl font-bold uppercase tracking-widest text-shadow-sm flex items-center gap-2"><ArrowUp size={40} className="fill-black"/> JUMP</span></button>
            </div>
        )}

        <canvas 
            ref={canvasRef} 
            className="w-full h-full block"
        />
    </div>
  );
}

