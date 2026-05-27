/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';

export default function App() {
  return (
    <HashRouter>
      <div className="w-full h-full min-h-screen bg-neutral-900 text-white font-sans selection:bg-blue-500/30 overflow-auto">
        <div className="w-full h-full min-h-screen">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/game/:gameId" element={<Game />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
