// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

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

function buildGridPolylines(xDomain: Pair<number>, yDomain: Pair<number>): Pair<number>[][] {
  const polylines: Pair<number>[][] = [];

  const xStart = Math.ceil(xDomain[0] / GRID_SPACING) * GRID_SPACING;
  for (let x = xStart; x <= xDomain[1] + 1e-6; x += GRID_SPACING) {
    polylines.push([
      [x, yDomain[0]],
      [x, yDomain[1]]
    ]);
  }

  const yStart = Math.ceil(yDomain[0] / GRID_SPACING) * GRID_SPACING;
  for (let y = yStart; y <= yDomain[1] + 1e-6; y += GRID_SPACING) {
    polylines.push([
      [xDomain[0], y],
      [xDomain[1], y]
    ]);
  }

  return polylines;
}

function buildAxisPolylines(xDomain: Pair<number>, yDomain: Pair<number>): Pair<number>[][] {
  return [
    [
      [xDomain[0], 0],
      [xDomain[1], 0]
    ],
    [
      [0, yDomain[0]],
      [0, yDomain[1]]
    ]
  ];
}
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

    const zoom = state.zoom;
    const xDomain: Pair<number> = [X_DOMAIN[0] / zoom, X_DOMAIN[1] / zoom];
    const yDomain: Pair<number> = [Y_DOMAIN[0] / zoom, Y_DOMAIN[1] / zoom];
    const gridPolylines = buildGridPolylines(xDomain, yDomain);
    const axisPolylines = buildAxisPolylines(xDomain, yDomain);

    // Draw Grid and Axis
    lineRenderer.renderPolylines(webGl.dataToClipMatrix, gridPolylines, COLORS.vectorField);
    lineRenderer.renderPolylines(webGl.dataToClipMatrix, axisPolylines, AXIS_COLOR);

    const { trajectory } = state;
    if (trajectory.count === 0) { return; }

    const ppt = trajectory.pointsPerTrajectory;
    const scaledT = Math.max(0, Math.min(1, t)) * (ppt - 1);
    const numCompleteSegments = Math.floor(scaledT);
    const fractionalPart = scaledT - numCompleteSegments;

    // Draw complete segments
    if (numCompleteSegments > 0) {
      const completeT = numCompleteSegments / (ppt - 1);
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        trajectory,
        COLORS.singleTrajectory,
        THICK_LINE_THICKNESS,
        completeT
      );
    }

    // Draw partial segment in progress
    if (fractionalPart > 0 && numCompleteSegments < ppt - 1) {
      const x0 = trajectory.xs[numCompleteSegments];
      const y0 = trajectory.ys[numCompleteSegments];
      const x1 = trajectory.xs[numCompleteSegments + 1];
      const y1 = trajectory.ys[numCompleteSegments + 1];

      const partialX = x0 + (x1 - x0) * fractionalPart;
      const partialY = y0 + (y1 - y0) * fractionalPart;

      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        {
          xs: new Float32Array([x0, partialX]),
          ys: new Float32Array([y0, partialY]),
          pointsPerTrajectory: 2,
          count: 1,
          version: 0
        },
        COLORS.singleTrajectory,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

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
