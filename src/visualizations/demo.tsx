import React, { useEffect, useRef } from 'react';

import { resizeCanvasToDisplaySize } from '../util/ui';
import { TimelineControls } from './components/timeline-controls';
import { useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';

function DemoVisualization(): React.ReactElement {
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    engine.setLoopPause(0);
  }, [engine]);

  useEffect(() => {
    return engine.register((frame) => {
      const canvas = canvasRef.current;
      if (!canvas) { return; }

      resizeCanvasToDisplaySize(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) { return; }

      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, w, h);

      const t = frame.clock.t * Math.PI * 2;
      const r = Math.min(w, h) * 0.35;
      const x = w / 2 + Math.cos(t) * r;
      const y = h / 2 + Math.sin(t) * r;

      ctx.fillStyle = '#eee';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [engine]);

  return (
    <canvas ref={canvasRef} style={{ width: 400, height: 300 }} />
  );
}

export function initDemoVisualization(container: HTMLElement): () => void {
  const name = 'demo';
  return mountVisualization(
    container,
    <VisualizationProvider model={{ initState: () => ({}) }} name={name}>
      <DemoVisualization />
      <TimelineControls />
    </VisualizationProvider>,
    { name }
  );
}
