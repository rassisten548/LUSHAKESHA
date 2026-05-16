import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Users, User, ArrowRight } from 'lucide-react';

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export function Lobby() {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { userId, username } = useGameStore();

  useEffect(() => {
    if (!userId) {
      navigate('/');
    }
  }, [userId, navigate]);

  const createGame = async () => {
    if (!userId) return;
    setLoading(true);
    let code = generateRoomCode();
    // In a real app we'd collision check, but for MVP it's OK
    try {
      await setDoc(doc(db, 'games', code), {
        hostId: userId,
        status: 'waiting', // host launches it
        seed: Math.floor(Math.random() * 1000000),
        createdAt: Date.now()
      });
      navigate(`/game/${code}`);
    } catch (err) {
      console.error(err);
      setError('Failed to create game room.');
      setLoading(false);
    }
  };

  const joinGame = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode || !userId) return;
    setLoading(true);
    setError('');
    
    try {
      const gameRef = doc(db, 'games', joinCode.toUpperCase());
      const gameSnap = await getDoc(gameRef);
      
      if (!gameSnap.exists()) {
        setError('ROOM NOT FOUND.');
        setLoading(false);
        return;
      }
      
      const gameData = gameSnap.data();
      if (gameData.status === 'playing') {
        setError('GAME ALREADY IN PROGRESS.');
        setLoading(false);
        return;
      }
      if (gameData.status === 'finished') {
          setError('GAME HAS FINISHED.');
          setLoading(false);
          return;
      }
      
      navigate(`/game/${joinCode.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      setError('Failed to join room.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center min-h-screen bg-sky-400 overflow-y-auto w-full h-full p-6 gap-8 relative" style={{ backgroundImage: 'radial-gradient(#38bdf8 20%, transparent 20%)', backgroundSize: '20px 20px' }}>
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-sm bg-white pixel-box p-8 z-10"
      >
        <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-amber-400 border-4 border-black flex items-center justify-center text-black">
                <User size={40} className="fill-black" />
            </div>
        </div>
        <h2 className="text-3xl font-bold text-center text-black mb-4 uppercase">Play Alone</h2>
        <p className="text-slate-600 text-center mb-8 text-xl leading-snug">START AN ENDLESS RUN ON YOUR OWN.</p>
        <button
            onClick={createGame}
            disabled={loading}
            className="w-full bg-amber-400 hover:bg-amber-300 text-black font-bold text-2xl py-4 pixel-box uppercase disabled:opacity-50"
          >
            SOLO GAME
        </button>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full max-w-sm bg-white pixel-box p-8 z-10"
      >
        <form onSubmit={joinGame}>
            <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-lime-400 border-4 border-black flex items-center justify-center text-black">
                    <Users size={40} className="fill-black" />
                </div>
            </div>
            <h2 className="text-3xl font-bold text-center text-black mb-4 uppercase">Play With Friends</h2>
            <p className="text-slate-600 text-center mb-6 text-xl leading-snug">JOIN A ROOM USING A 4-LETTER FRIEND CODE.</p>
            
            <div className="flex gap-2">
                <input
                    maxLength={4}
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-100 border-4 border-black px-4 py-3 text-black text-2xl text-center uppercase focus:outline-none placeholder:text-slate-300"
                    placeholder="CODE"
                    required
                />
                <button
                    type="submit"
                    disabled={loading || !joinCode}
                    className="bg-lime-400 hover:bg-lime-300 text-black font-bold py-3 px-6 pixel-box uppercase flex items-center justify-center disabled:opacity-50"
                >
                    <ArrowRight size={32} className="fill-black" />
                </button>
            </div>
            {error && <div className="mt-4 bg-red-200 border-2 border-red-500 p-2"><p className="text-red-700 font-bold text-center">{error}</p></div>}
        </form>

        <div className="mt-8 pt-8 border-t-4 border-dashed border-slate-300">
             <button
                onClick={createGame}
                disabled={loading}
                className="w-full bg-sky-300 hover:bg-sky-200 text-black font-bold text-2xl py-4 pixel-box uppercase disabled:opacity-50"
              >
                HOST ROOM
            </button>
        </div>
      </motion.div>
    </div>
  );
}
