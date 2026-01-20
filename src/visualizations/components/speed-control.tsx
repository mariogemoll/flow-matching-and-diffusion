// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useState } from 'react';

import { useEngine } from '../engine';
import { Slider } from './slider';

export function SpeedControl(): React.JSX.Element {
  const engine = useEngine();
  const [speed, setSpeed] = useState(engine.frame.clock.speed);

  // Sync with engine frame in case speed changes externally
  const speedRef = React.useRef(speed);
  speedRef.current = speed;

  // Sync with engine frame in case speed changes externally
  useEffect(() => {
    return engine.register((frame) => {
      // Use ref to check for external changes without re-registering
      if (frame.clock.speed !== speedRef.current) {
        setSpeed(frame.clock.speed);
      }
    });
  }, [engine]);

  const changeSpeed = (v: number): void => {
    setSpeed(v);
    engine.setSpeed(v);
  };

  return (
    <Slider
      label="Speed"
      min={0}
      max={3}
      step={0.01}
      value={speed}
      onChange={changeSpeed}
      formatValue={(v) => v.toFixed(2)}
    />
  );
}
