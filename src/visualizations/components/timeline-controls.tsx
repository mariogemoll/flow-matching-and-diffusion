// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import { useEngine } from '../engine';

export function TimelineControls(): React.ReactElement {
  const engine = useEngine();
  const { clock } = engine.frame;

  const [playing, setPlaying] = useState(clock.playing);
  const [scrubT, setScrubT] = useState(clock.t);
  const scrubbingRef = useRef(false);

  // Sync with engine frame
  useEffect(() => {
    return engine.register((frame) => {
      if (scrubbingRef.current) { return; }

      const newPlaying = frame.clock.playing;
      if (playing !== newPlaying) { setPlaying(newPlaying); }

      setScrubT(frame.clock.t);
    });
  }, [engine, playing]);

  const toggle = (): void => {
    engine.togglePlay();
    setPlaying(engine.frame.clock.playing);
  };

  const scrubStart = (): void => {
    scrubbingRef.current = true;
    engine.beginScrub();
    setPlaying(engine.frame.clock.playing);
  };

  const scrub = (v: string): void => {
    const t = Number(v);
    setScrubT(t);
    engine.setTime(t); // immediate redraw even paused
  };

  const scrubEnd = (): void => {
    scrubbingRef.current = false;
    engine.endScrub();
  };

  return (
    <div className="time-slider">
      <button onClick={toggle}>
        {playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={scrubT}
        onPointerDown={scrubStart}
        onPointerUp={scrubEnd}
        onChange={(e) => { scrub(e.target.value); }}
        style={{ '--progress': `${(scrubT * 100).toFixed(1)}%` } as React.CSSProperties}
      />
      <span>
        {scrubT.toFixed(2)}
      </span>
    </div>
  );
}
