import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import { shapeSvgPath } from './draw';

// Inline feed view: kept light. Shows today's shape, the challenge and the crowd so far.
export const Splash = () => {
  const [data, setData] = useState<InitResponse | null>(null);
  useEffect(() => {
    fetch('/api/init')
      .then((r) => (r.ok ? (r.json() as Promise<InitResponse>) : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);
  const p = data?.puzzle;
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen gap-3 px-4 text-center">
      <div className="text-[11px] tracking-[0.3em] text-[#ff5c4d] font-semibold">SHARDLINE{p ? ` #${p.day}` : ''}</div>
      <svg viewBox="0 0 100 100" className="w-[38vmin] max-w-[180px] h-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]">
        {p ? (
          <>
            <path d={shapeSvgPath(p.shape)} fill="#f4ead5" stroke="#d9c9a6" strokeWidth="0.8" />
            <line x1="4" y1="70" x2="96" y2="34" stroke="#ff5c4d" strokeWidth="1.2" strokeDasharray="3 2" />
          </>
        ) : (
          <circle cx="50" cy="50" r="30" fill="#2a2934" className="animate-pulse" />
        )}
      </svg>
      <h1 className="font-serif text-xl text-[#f4ead5] leading-tight">
        {p ? (
          <>
            Cut the {p.name} into <b>{p.pieces}</b> equal pieces
            <br />
            with <b>{p.cuts}</b> straight cut{p.cuts > 1 ? 's' : ''}.
          </>
        ) : (
          'Today’s shape is loading…'
        )}
      </h1>
      <p className="text-sm text-[#b9b2a3]">
        {data?.result
          ? `You cut ${data.result.score.toFixed(1)}%: #${data.result.rank} of ${data.result.players}`
          : data && data.stats.players > 0
            ? `${data.stats.players} cutter${data.stats.players > 1 ? 's' : ''} so far · avg ${data.stats.average.toFixed(1)}%`
            : 'No measuring. One shot. Eyes only.'}
      </p>
      <button
        className="mt-1 h-11 px-8 rounded-full bg-[#ff5c4d] text-[#16151d] font-semibold cursor-pointer"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {data?.result ? 'See the results' : 'Pick up the blade'}
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
