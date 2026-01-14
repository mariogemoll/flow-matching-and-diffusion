import React, { useEffect, useRef } from 'react';

import { brownianMotionTrajectory } from '../math/brownian-motion';
import type { Pair, RGBA, Trajectories } from '../types';
import { interpolateTrajectory, makeTrajectories } from '../util/trajectories';
import { type WebGl } from '../webgl';
import { createLineRenderer, type LineRenderer } from '../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { createThickLineRenderer, type ThickLineRenderer } from '../webgl/renderers/thick-line';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { WebGlCanvas } from './components/webgl-canvas';
import {
  COLORS,
  DOT_SIZE,
  NUM_TRAJECTORY_STEPS,
  THICK_LINE_THICKNESS,
  X_DOMAIN,
  Y_DOMAIN
} from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';

export interface BrownianMotionState {
  trajectory: Trajectories;
  lastT: number;
}

export type BrownianMotionActions = Record<string, never>;

const GRID_SPACING = 0.5;
const GRID_POLYLINES = buildGridPolylines();
const AXIS_POLYLINES: Pair<number>[][] = [
  [
    [X_DOMAIN[0], 0],
    [X_DOMAIN[1], 0]
  ],
  [
    [0, Y_DOMAIN[0]],
    [0, Y_DOMAIN[1]]
  ]
];
const AXIS_COLOR: RGBA = [1.0, 1.0, 1.0, 0.6];

function buildGridPolylines(): Pair<number>[][] {
  const polylines: Pair<number>[][] = [];

  const xStart = Math.ceil(X_DOMAIN[0] / GRID_SPACING) * GRID_SPACING;
  for (let x = xStart; x <= X_DOMAIN[1] + 1e-6; x += GRID_SPACING) {
    polylines.push([
      [x, Y_DOMAIN[0]],
      [x, Y_DOMAIN[1]]
    ]);
  }

  const yStart = Math.ceil(Y_DOMAIN[0] / GRID_SPACING) * GRID_SPACING;
  for (let y = yStart; y <= Y_DOMAIN[1] + 1e-6; y += GRID_SPACING) {
    polylines.push([
      [X_DOMAIN[0], y],
      [X_DOMAIN[1], y]
    ]);
  }

  return polylines;
}

export const brownianMotionModel: Model<BrownianMotionState, BrownianMotionActions> = {
  initState: () => {
    const trajectory = makeTrajectories(NUM_TRAJECTORY_STEPS + 1, 1);
    brownianMotionTrajectory(trajectory);
    return { trajectory, lastT: 0 };
  },

  tick: ({ frame }) => {
    if (frame.clock.t < frame.state.lastT) {
      brownianMotionTrajectory(frame.state.trajectory);
    }
    frame.state.lastT = frame.clock.t;
  },

  actions: () => ({})
};

function drawBrownianMotion(
  webGl: WebGl,
  lineRenderer: LineRenderer,
  thickLineRenderer: ThickLineRenderer,
  pointRenderer: PointRenderer,
  state: BrownianMotionState,
  t: number
): void {
  clear(webGl);

  lineRenderer.renderPolylines(webGl.dataToClipMatrix, GRID_POLYLINES, COLORS.vectorField);
  lineRenderer.renderPolylines(webGl.dataToClipMatrix, AXIS_POLYLINES, AXIS_COLOR);

  const { trajectory } = state;
  if (trajectory.count === 0) { return; }

  thickLineRenderer.renderThickTrajectories(
    webGl.dataToClipMatrix,
    trajectory,
    COLORS.singleTrajectory,
    THICK_LINE_THICKNESS,
    t
  );

  const currentPos = interpolateTrajectory(trajectory, 0, t);
  pointRenderer.render(
    webGl.dataToClipMatrix,
    {
      xs: new Float32Array([currentPos[0]]),
      ys: new Float32Array([currentPos[1]]),
      version: 0
    },
    COLORS.highlightPoint,
    DOT_SIZE
  );
}

export function BrownianMotionVisualization(): React.JSX.Element {
  const engine = useEngine<BrownianMotionState, BrownianMotionActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const thickLineRendererRef = useRef<ThickLineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      if (lineRendererRef.current?.gl !== webGl.gl) {
        lineRendererRef.current?.destroy();
        lineRendererRef.current = createLineRenderer(webGl.gl);
      }
      const lineRenderer = lineRendererRef.current;

      if (thickLineRendererRef.current?.gl !== webGl.gl) {
        thickLineRendererRef.current?.destroy();
        thickLineRendererRef.current = createThickLineRenderer(webGl.gl);
      }
      const thickLineRenderer = thickLineRendererRef.current;

      if (pointRendererRef.current?.gl !== webGl.gl) {
        pointRendererRef.current?.destroy();
        pointRendererRef.current = createPointRenderer(webGl.gl);
      }
      const pointRenderer = pointRendererRef.current;

      drawBrownianMotion(
        webGl,
        lineRenderer,
        thickLineRenderer,
        pointRenderer,
        frame.state,
        frame.clock.t
      );
    });
  }, [engine]);

  return (
    <>
      <ViewContainer>
        <WebGlCanvas className="view" webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />
        <ViewControls>
          <ViewControlsGroup>
            <SpeedControl />
          </ViewControlsGroup>
        </ViewControls>
      </ViewContainer>
      <TimelineControls />
    </>
  );
}

export function initBrownianMotionVisualization(container: HTMLElement): () => void {
  const name = 'brownian-motion';
  return mountVisualization(
    container,
    <VisualizationProvider model={brownianMotionModel} name={name}>
      <BrownianMotionVisualization />
    </VisualizationProvider>,
    { name }
  );
}
