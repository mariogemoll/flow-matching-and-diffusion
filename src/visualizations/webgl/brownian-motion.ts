import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import type { Pair, RGBA } from '../../types';
import { interpolateTrajectory } from '../../util/trajectories';
import type { WebGl } from '../../webgl';
import { createLineRenderer } from '../../webgl/renderers/line';
import { createPointRenderer } from '../../webgl/renderers/point';
import { createThickLineRenderer } from '../../webgl/renderers/thick-line';
import type { BrownianMotionState } from '../brownian-motion';
import {
  COLORS,
  DOT_SIZE,
  THICK_LINE_THICKNESS
} from '../constants';
import type { Frame } from '../engine';
import type { WebGlRenderer } from './types';


const GRID_SPACING = 0.5;

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


export interface BrownianMotionRenderer extends WebGlRenderer<BrownianMotionState> {
  // Placeholder
  _placeholder?: never;
}

export function createBrownianMotionRenderer(gl: WebGLRenderingContext): BrownianMotionRenderer {
  const lineRenderer = createLineRenderer(gl);
  const thickLineRenderer = createThickLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let state: BrownianMotionState | null = null;
  let t = 0;

  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  function update(frame: Frame<BrownianMotionState>): boolean {
    state = frame.state;
    t = frame.clock.t;
    return true;
  }

  function render(webGl: WebGl): void {
    if (!state) { return; }

    // Draw Grid and Axis
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

    dotPoints.xs[0] = currentPos[0];
    dotPoints.ys[0] = currentPos[1];
    dotPoints.version++;

    pointRenderer.render(
      webGl.dataToClipMatrix,
      dotPoints,
      COLORS.highlightPoint,
      DOT_SIZE
    );
  }

  function destroy(): void {
    // No explicit cleanup
  }

  return {
    update,
    render,
    destroy
  };
}
