// Simple seeded PRNG
export function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = s * 16807 % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface GameObject {
  type: 'obstacle' | 'coin' | 'health' | 'slow';
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
}

export function generateChunk(chunkIndex: number, seed: number): GameObject[] {
  const prng = seededRandom(seed + chunkIndex);
  const objects: GameObject[] = [];
  const startX = chunkIndex * 1000;
  
  // Start with fewer obstacles, increase difficulty gradually
  // At chunk 0 (0-1000px) - very few traps, mainly coins.
  const difficulty = Math.min(1.0, chunkIndex / 10); 
  // numObjects can gradually increase
  const numObjects = Math.floor(prng() * 10) + 5 + Math.floor(difficulty * 5);
  
  let currentX = startX + (chunkIndex === 0 ? 500 : 200); // Give player 500px head start on chunk 0
  
  for (let i = 0; i < numObjects; i++) {
    // Gap depends on difficulty
    const minGap = 200 - difficulty * 100;
    currentX += minGap + prng() * 150;
    
    // Type probabilities
    let rand = prng();
    if (chunkIndex === 0) {
        // Mostly coins early on
        rand = prng() < 0.8 ? 0.3 : 0.9;
    }

    if (rand < 0.5) {
      // Line of coins
      const y = Math.max(200, 400 - prng() * 200);
      objects.push({ type: 'coin', x: currentX, y: y, width: 20, height: 20, id: `coin-${chunkIndex}-${i}-1` });
      if (prng() > 0.3) objects.push({ type: 'coin', x: currentX + 30, y: y, width: 20, height: 20, id: `coin-${chunkIndex}-${i}-2` });
      if (prng() > 0.6) objects.push({ type: 'coin', x: currentX + 60, y: y, width: 20, height: 20, id: `coin-${chunkIndex}-${i}-3` });
      if (prng() > 0.8) objects.push({ type: 'coin', x: currentX + 90, y: y, width: 20, height: 20, id: `coin-${chunkIndex}-${i}-4` });
    } else if (rand < 0.8 && difficulty > 0.1) {
      // Obstacle 
      const isBird = difficulty > 0.3 && prng() > 0.5;
      if (isBird) {
         objects.push({ type: 'obstacle', x: currentX, y: 250 + prng()*100, width: 40, height: 30, id: `obs-fly-${chunkIndex}-${i}` });
      } else {
         objects.push({ type: 'obstacle', x: currentX, y: 460, width: 40, height: 40, id: `obs-${chunkIndex}-${i}` });
      }
      // Guarantee extra gap after an obstacle
      currentX += 150; // extra padding
    } else if (rand < 0.95 && difficulty > 0.2) {
      objects.push({ type: 'slow', x: currentX, y: 480, width: 100, height: 20, id: `slow-${chunkIndex}-${i}` });
      currentX += 100; // extra padding
    } else {
      objects.push({ type: 'health', x: currentX, y: 250 + prng() * 100, width: 30, height: 30, id: `hp-${chunkIndex}-${i}` });
    }
  }
  
  return objects;
}
