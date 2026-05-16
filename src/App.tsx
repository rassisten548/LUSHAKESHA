/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Game } from './pages/Game';

export default function App() {
  return (
    <BrowserRouter>
      <div className="w-full h-full min-h-screen bg-neutral-900 text-white font-sans selection:bg-blue-500/30 overflow-hidden landscape:block portrait:flex portrait:flex-col portrait:justify-center portrait:items-center">
        <div className="portrait:hidden w-full h-full">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/game/:gameId" element={<Game />} />
          </Routes>
        </div>
        <div className="hidden portrait:flex font-mono text-center px-6">
          <p>Please rotate your device to landscape orientation to play.</p>
        </div>
      </div>
    </BrowserRouter>
  );
}
