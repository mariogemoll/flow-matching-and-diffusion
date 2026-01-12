import { useEffect, useRef } from 'react';

import type { Points2D } from '../types';
import { clearWebGl, type WebGl } from '../webgl';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { TimelineControls } from './components/timeline-controls';
import { WebGlCanvas } from './components/webgl-canvas';
import { useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';

function rotatePoints(points: Points2D, angle: number): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let i = 0; i < points.xs.length; i++) {
    const x = points.xs[i];
    const y = points.ys[i];
    points.xs[i] = x * cos - y * sin;
    points.ys[i] = x * sin + y * cos;
  }
  points.version++;
}

function getOrUpdateRenderer(
  gl: WebGLRenderingContext,
  rendererRef: React.RefObject<PointRenderer | null>
): PointRenderer {
  if (rendererRef.current?.gl !== gl) {
    rendererRef.current?.destroy();
    rendererRef.current = createPointRenderer(gl);
  }
  return rendererRef.current;
}

function WebGlDemoVisualization(): React.JSX.Element {
  const engine = useEngine();
  const webGlRef = useRef<WebGl | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const staticPointRendererRef = useRef<PointRenderer | null>(null);
  const staticPoints = useRef({
    xs: new Float32Array([-0.4, 0.4, -0.4, 0.4]),
    ys: new Float32Array([-0.4, -0.4, 0.4, 0.4]),
    version: 1
  }).current;
  const dynamicPoints = useRef({
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  }).current;

  useEffect(() => {
    engine.setLoopPause(0);
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      const pointRenderer = getOrUpdateRenderer(webGl.gl, pointRendererRef);
      const staticPointRenderer = getOrUpdateRenderer(webGl.gl, staticPointRendererRef);

      clearWebGl(webGl, [0.2, 0.2, 0.2, 1.0]);

      // Update dynamic points in place
      const t = frame.clock.t * Math.PI * 2;
      dynamicPoints.xs[0] = Math.cos(t) * 0.5;
      dynamicPoints.ys[0] = Math.sin(t) * 0.5;
      dynamicPoints.version = (dynamicPoints.version + 1) % 1000000;

      // Draw dynamic points
      pointRenderer.render(
        webGl.dataToClipMatrix,
        dynamicPoints,
        [0.9, 0.9, 0.9, 1.0],
        10
      );

      if (frame.clock.t % 2.0 < 0.1 && staticPoints.version % 2 === 1) {
        rotatePoints(staticPoints, Math.PI / 4);
      } else if (frame.clock.t > 0.5 && staticPoints.version % 2 === 0) {
        rotatePoints(staticPoints, -Math.PI / 4);
      }

      // Draw static points
      staticPointRenderer.render(
        webGl.dataToClipMatrix,
        staticPoints,
        [0.0, 0.8, 0.2, 1.0],
        15
      );
    });
  }, [engine, staticPoints, dynamicPoints]);

  return (
    <>
      <div className="view-container">
        <WebGlCanvas webGlRef={webGlRef} />
      </div>
      <TimelineControls />
    </>
  );
}

export function initWebGlDemoVisualization(container: HTMLElement): () => void {
  const name = 'webgl-demo';
  return mountVisualization(
    container,
    <VisualizationProvider model={{ initState: () => ({}) }} name={name}>
      <WebGlDemoVisualization />
    </VisualizationProvider>,
    { name }
  );
}
