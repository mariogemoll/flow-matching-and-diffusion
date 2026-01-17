import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import { demoVectorFieldBatch } from '../../math/demo-vector-field';
import { interpolateTrajectory } from '../../util/trajectories';
import type { WebGl } from '../../webgl';
import { createLineRenderer } from '../../webgl/renderers/line';
import { createPointRenderer } from '../../webgl/renderers/point';
import { createThickLineRenderer } from '../../webgl/renderers/thick-line';
import {
  COLORS,
  DOT_SIZE,
  THICK_LINE_THICKNESS
} from '../constants';
import type { Frame } from '../engine';
import type { EulerMethodState } from '../euler-method';
import type { WebGlRenderer } from './types';
import { drawVectorField } from './vector-field';

function segmentStartTime(t: number, numSteps: number): number {
  const safeSteps = Math.max(1, Math.floor(numSteps));
  const segmentIndex = Math.min(Math.floor(t * safeSteps), safeSteps - 1);
  return segmentIndex / safeSteps;
}

export interface EulerMethodRenderer extends WebGlRenderer<EulerMethodState> {
  // Empty for now, simplified interface
  _placeholder?: never;
}

export function createEulerMethodRenderer(gl: WebGLRenderingContext): EulerMethodRenderer {
  const lineRenderer = createLineRenderer(gl);
  const thickLineRenderer = createThickLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let state: EulerMethodState | null = null;
  let t = 0;

  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  function update(frame: Frame<EulerMethodState>): boolean {
    state = frame.state;
    t = frame.clock.t;
    return true;
  }

  function render(webGl: WebGl): void {
    if (!state) { return; }

    const vectorFieldTime = segmentStartTime(t, state.numSteps);
    drawVectorField(
      lineRenderer,
      webGl.dataToClipMatrix,
      demoVectorFieldBatch,
      X_DOMAIN,
      Y_DOMAIN,
      vectorFieldTime,
      undefined,
      COLORS.vectorField
    );

    const { groundTruthTrajectory, eulerTrajectory, showGroundTruth, showEuler } = state;

    // Draw ground truth trajectory (dimmer)
    if (showGroundTruth && groundTruthTrajectory.count > 0) {
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        groundTruthTrajectory,
        COLORS.singleTrajectorySecondary,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

    // Draw Euler trajectory (brighter)
    if (showEuler && eulerTrajectory.count > 0) {
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        eulerTrajectory,
        COLORS.singleTrajectory,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

    // Draw current position dot (using Euler trajectory)
    if (eulerTrajectory.count > 0) {
      const currentPos = interpolateTrajectory(eulerTrajectory, 0, t);

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
