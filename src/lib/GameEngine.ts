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
  type: 'obstacle' | 'coin' | 'health' | 'slow' | 'platform' | 'carrot';
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
  
  const difficulty = Math.min(1.0, chunkIndex / 15); 
  
  // Create beautiful solid floating platforms like Mario!
  // Platform heights are 360px (easily reachable) and 260px (high but reachable)
  const platformCount = chunkIndex === 0 ? 1 : Math.floor(prng() * 3) + 2; // 2 to 4 platforms
  const platformPositions: { x: number, y: number, w: number }[] = [];
  
  let currentX = startX + (chunkIndex === 0 ? 400 : 150);
  
  for (let p = 0; p < platformCount; p++) {
    const pWidth = 150 + Math.floor(prng() * 120); // 150px - 270px width
    const pY = prng() > 0.5 ? 360 : 260; // heights
    
    currentX += 130 + Math.floor(prng() * 120); // spacing
    
    if (currentX + pWidth < startX + 960) {
      objects.push({
        type: 'platform',
        x: currentX,
        y: pY,
        width: pWidth,
        height: 24, // sturdy brick height
        id: `platform-${chunkIndex}-${p}`
      });
      platformPositions.push({ x: currentX, y: pY, w: pWidth });
      currentX += pWidth;
    }
  }

  // Segment the 1000px chunk into regular horizontal slots
  // We place at most ONE obstacle or helper per slot, guaranteeing logical placement
  const slotWidth = 130;
  const maxSlots = Math.floor(1000 / slotWidth) - 1;

  for (let s = 1; s < maxSlots; s++) {
    const itemX = startX + s * slotWidth + Math.floor(prng() * 20);
    
    // Check if there is a platform at this X position to rest on
    const platform = platformPositions.find(p => itemX >= p.x && itemX <= p.x + p.w - 30);
    
    const rand = prng();
    
    if (platform) {
      // Items on top of floating platforms:
      if (rand < 0.55) {
        // High coins
        objects.push({ type: 'coin', x: itemX, y: platform.y - 30, width: 20, height: 20, id: `coin-plat-${chunkIndex}-${s}` });
      } else if (rand < 0.72) {
        // Carrot speedboost helper
        objects.push({ type: 'carrot', x: itemX, y: platform.y - 30, width: 24, height: 24, id: `carrot-plat-${chunkIndex}-${s}` });
      } else if (rand < 0.85) {
        // Health apple
        objects.push({ type: 'health', x: itemX, y: platform.y - 30, width: 28, height: 28, id: `hp-plat-${chunkIndex}-${s}` });
      } else if (rand < 0.95 && difficulty > 0.25) {
        // Cactus obstacle on platform (high difficulty obstacle)
        objects.push({ type: 'obstacle', x: itemX, y: platform.y - 36, width: 36, height: 36, id: `cactus-plat-${chunkIndex}-${s}` });
      }
    } else {
      // Items on the ground or floating high in the open sky
      if (rand < 0.45) {
        // Coins floating at jump trajectory height
        objects.push({ type: 'coin', x: itemX, y: 440, width: 20, height: 20, id: `coin-ground-${chunkIndex}-${s}` });
      } else if (rand < 0.62) {
        // Ground Cactus (obstacle)
        if (chunkIndex > 0 || itemX > 600) {
          objects.push({ type: 'obstacle', x: itemX, y: 460, width: 40, height: 40, id: `cactus-ground-${chunkIndex}-${s}` });
        }
      } else if (rand < 0.78) {
        // Puddles (slow down for 5s)
        if (chunkIndex > 0) {
          objects.push({ type: 'slow', x: itemX, y: 485, width: 90, height: 15, id: `puddle-ground-${chunkIndex}-${s}` });
        }
      } else if (rand < 0.90) {
        // Birds flying high in sky (to jump/duck under)
        if (difficulty > 0.15) {
          const birdY = 180 + Math.floor(prng() * 90); // Flies at 180 - 270 altitude
          objects.push({ type: 'obstacle', x: itemX, y: birdY, width: 40, height: 30, id: `bird-sky-${chunkIndex}-${s}` });
        }
      } else {
        // Ground apple (health)
        objects.push({ type: 'health', x: itemX, y: 450, width: 30, height: 30, id: `hp-ground-${chunkIndex}-${s}` });
      }
    }
  }

  return objects;
}
