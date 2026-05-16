import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore, CharacterType } from '../store';
import { db, generateLocalUserId } from '../lib/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { Play } from 'lucide-react';
import { motion } from 'motion/react';

const PixelParrot = ({ type }: { type: CharacterType }) => {
    const b = type === 'Кеша' ? 'bg-sky-400' : 'bg-lime-400';
    const l = type === 'Кеша' ? 'bg-sky-500' : 'bg-lime-500';
    const d = type === 'Кеша' ? 'bg-sky-200' : 'bg-yellow-200';
    const e = 'bg-black';
    const w = 'bg-white';
    const k = 'bg-amber-500';
    const f = 'bg-orange-600';
    const _ = 'bg-transparent';
    
    // 8x8 pixel grid for the parrot idle frame
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
        <div className="flex flex-col w-16 h-16 pointer-events-none">
           {grid.map((row, r) => (
               <div key={r} className="flex flex-1">
                  {row.map((color, c) => (
                      <div key={c} className={`flex-1 min-w-0 ${color}`} />
                  ))}
               </div>
           ))}
        </div>
    );
}

export function Home() {
  const [localUsername, setLocalUsername] = useState('');
  const [selectedChar, setSelectedChar] = useState<CharacterType>('Кеша');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUserId, setUsername, setCharacter, userId } = useGameStore();

  useEffect(() => {
    const uid = generateLocalUserId();
    setUserId(uid);
    const fetchUser = async () => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.username) {
             setLocalUsername(data.username);
             setUsername(data.username);
          }
        }
    };
    fetchUser();
  }, [setUserId, setUsername]);

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!localUsername.trim() || localUsername.length > 12) {
      setError('Username must be 1-12 characters long');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      let uid = userId || generateLocalUserId();
      setUserId(uid);

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
         await updateDoc(userRef, { username: localUsername });
      } else {
         await setDoc(userRef, {
           uid,
           username: localUsername,
           createdAt: Date.now()
         });
      }

      setUsername(localUsername);
      setCharacter(selectedChar);
      
      navigate('/lobby');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to setup profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-sky-400 overflow-y-auto w-full h-full p-4 relative" style={{ backgroundImage: 'radial-gradient(#38bdf8 20%, transparent 20%)', backgroundSize: '20px 20px' }}>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white pixel-box p-8 mx-auto relative z-10"
      >
        <h1 className="text-5xl font-bold text-center mb-2 tracking-widest text-transparent" style={{ WebkitTextStroke: '2px black' }}>
          <span className="text-yellow-400">P</span><span className="text-orange-400">A</span><span className="text-red-400">R</span><span className="text-pink-400">R</span><span className="text-purple-400">O</span><span className="text-blue-400">T</span>
          <br/>RUN
        </h1>

        <form onSubmit={handleStart} className="space-y-6 mt-8">
          <div>
            <label className="block text-xl font-bold text-black mb-2 uppercase">Username</label>
            <input
              maxLength={12}
              type="text"
              value={localUsername}
              onChange={(e) => setLocalUsername(e.target.value.toUpperCase())}
              className="w-full bg-slate-100 border-4 border-black px-4 py-3 text-2xl font-bold uppercase focus:outline-none focus:bg-white placeholder:text-slate-400"
              placeholder="PLAYER 1"
              required
            />
          </div>

          <div>
            <label className="block text-xl font-bold text-black mb-4 uppercase">Select Bird</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSelectedChar('Кеша')}
                className={cn(
                  "p-4 pixel-box transition-all flex flex-col items-center gap-3 relative overflow-hidden",
                  selectedChar === 'Кеша' ? "bg-sky-200" : "bg-slate-100"
                )}
              >
                <PixelParrot type="Кеша" />
                <span className="text-xl font-bold uppercase drop-shadow-md">Kesha</span>
              </button>
              
              <button
                type="button"
                onClick={() => setSelectedChar('Луша')}
                className={cn(
                  "p-4 pixel-box transition-all flex flex-col items-center gap-3 relative overflow-hidden",
                  selectedChar === 'Луша' ? "bg-lime-200" : "bg-slate-100"
                )}
              >
                <PixelParrot type="Луша" />
                <span className="text-xl font-bold uppercase drop-shadow-md">Lusha</span>
              </button>
            </div>
          </div>

          {error && <div className="bg-red-200 border-4 border-red-500 p-4"><p className="text-red-600 font-bold text-center leading-snug">{error}</p></div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-400 hover:bg-green-300 text-black pixel-box font-bold py-4 text-3xl uppercase flex items-center justify-center gap-2 transition-colors group"
          >
            {loading ? "..." : <><Play className="fill-black group-hover:scale-125 transition-transform" size={24} /> START</>}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
