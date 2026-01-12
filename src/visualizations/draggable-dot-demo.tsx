import React, { useEffect, useRef } from 'react';

import { type Point2D } from '../types';
import { clearWebGl } from '../webgl';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { TimelineControls } from './components/timeline-controls';
import { COLORS } from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';

interface DraggableDotDemoState {
  dot: Point2D;
}

interface DraggableDotDemoActions {
  setDot: (pos: Point2D) => void;
}

const draggableDotDemoModel: Model<DraggableDotDemoState, DraggableDotDemoActions> = {
  initState: (): DraggableDotDemoState => ({
    dot: [0, 0]
  }),

  actions: (engine): DraggableDotDemoActions => ({
    setDot(pos: Point2D): void {
      engine.frame.state.dot = pos;
      engine.renderOnce();
    }
  })
};

function DraggableDotDemoVisualization(): React.ReactElement {
  const engine = useEngine<DraggableDotDemoState, DraggableDotDemoActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  // Separate renderers
  const backgroundRendererRef = useRef<PointRenderer | null>(null);
  const dotRendererRef = useRef<PointRenderer | null>(null);

  // Persistent data buffers
  const backgroundPoints = useRef({
    xs: new Float32Array(8),
    ys: new Float32Array(8),
    version: 0
  }).current;

  const dotPoints = useRef({
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  }).current;

  useEffect(() => {
    engine.setLoopPause(0);
  }, [engine]);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      if (backgroundRendererRef.current?.gl !== webGl.gl) {
        backgroundRendererRef.current = createPointRenderer(webGl.gl);
      }
      if (dotRendererRef.current?.gl !== webGl.gl) {
        dotRendererRef.current = createPointRenderer(webGl.gl);
      }

      const backgroundRenderer = backgroundRendererRef.current;
      const dotRenderer = dotRendererRef.current;

      clearWebGl(webGl, COLORS.background);

      const t = frame.clock.t;
      const numCircles = 8;
      const orbitRadius = 1.5;

      for (let i = 0; i < numCircles; i++) {
        const phase = (i / numCircles) * Math.PI * 2;
        const angle = phase + t * Math.PI * 2;
        backgroundPoints.xs[i] = Math.cos(angle) * orbitRadius;
        backgroundPoints.ys[i] = Math.sin(angle) * orbitRadius;
      }
      backgroundPoints.version++;

      backgroundRenderer.render(
        webGl.dataToClipMatrix,
        backgroundPoints,
        [0.5, 0.5, 0.8, 0.5], // Using a constant alpha
        8
      );

      dotPoints.xs[0] = frame.state.dot[0];
      dotPoints.ys[0] = frame.state.dot[1];
      dotPoints.version++;

      dotRenderer.render(
        webGl.dataToClipMatrix,
        dotPoints,
        [0.2, 0.8, 0.2, 0.8],
        10
      );
    });
  }, [engine, backgroundPoints, dotPoints]);

  return (
    <>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos) => { engine.actions.setDot(pos); }}
        xDomain={[-2, 2]}
        yDomain={[-2, 2]}
      />
      <TimelineControls />
    </>
  );
}

export function initDraggableDotDemoVisualization(container: HTMLElement): () => void {
  const name = 'draggable-dot-demo';
  return mountVisualization(
    container,
    <VisualizationProvider model={draggableDotDemoModel} name={name}>
      <DraggableDotDemoVisualization />
    </VisualizationProvider>,
    { name }
  );
}
