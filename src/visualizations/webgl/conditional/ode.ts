import {
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import {
  writePositions,
  writeTrajectories,
  writeVelocities
} from '../../../math/std-gaussian-to-dirac-delta';
import type { Point2D, Points2D } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { makeTrajectories } from '../../../util/trajectories';
import type { WebGl } from '../../../webgl';
import { createLineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer } from '../../../webgl/renderers/point';
import type { CondPathState } from '../../conditional';
import {
  COLORS,
  DOT_SIZE,
  MAX_NUM_SAMPLES,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { WebGlRenderer } from '../types';
import { drawVectorField } from '../vector-field';

export interface CondOdeRenderer extends WebGlRenderer<CondPathState> {
  setShowTrajectories(show: boolean): void;
  setShowVectorField(show: boolean): void;
  setShowSamples(show: boolean): void;
  resample(): void;
}

export function createCondOdeRenderer(gl: WebGLRenderingContext): CondOdeRenderer {
  const lineRenderer = createLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);
  const dotRenderer = createPointRenderer(gl);

  // Buffers
  const samplePool = makePoints2D(MAX_NUM_SAMPLES);
  // Initialize sample pool
  fillWithSamplesFromStdGaussian(samplePool);

  let trajectories = makeTrajectories(NUM_TRAJECTORY_STEPS + 1, 0);
  let samplePoints = makePoints2D(0);
  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  // Vector Field buffers
  let vectorFieldBuffer: Points2D | null = null;

  // Settings
  let showTrajectories = true;
  let showVectorField = false;
  let showSamples = true;

  // State filtering
  let lastState: {
    z: Point2D;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
  } | null = null;

  let recalcRequested = true;
  let t = 0;

  function setShowTrajectories(show: boolean): void {
    showTrajectories = show;
  }

  function setShowVectorField(show: boolean): void {
    showVectorField = show;
  }

  function setShowSamples(show: boolean): void {
    showSamples = show;
  }

  function resample(): void {
    fillWithSamplesFromStdGaussian(samplePool);
    recalcRequested = true;
  }

  function update(frame: Frame<CondPathState>): boolean {
    const state = frame.state;
    t = frame.clock.t;

    if (
      state.z !== lastState?.z ||
      state.schedule !== lastState.schedule ||
      state.numSamples !== lastState.numSamples
    ) {
      lastState = {
        z: state.z,
        schedule: state.schedule,
        numSamples: state.numSamples
      };
      recalcRequested = true;
    }

    if (recalcRequested) {
      const numSamples = lastState.numSamples;
      const pointsPerTrajectory = NUM_TRAJECTORY_STEPS + 1;

      // Resize trajectories if needed
      if (
        trajectories.count !== numSamples ||
        trajectories.pointsPerTrajectory !== pointsPerTrajectory
      ) {
        trajectories = makeTrajectories(pointsPerTrajectory, numSamples);
      }

      // Resize samplePoints if needed
      if (samplePoints.xs.length !== numSamples) {
        samplePoints = makePoints2D(numSamples);
      }

      writeTrajectories(
        lastState.schedule,
        lastState.z,
        samplePool,
        NUM_TRAJECTORY_STEPS,
        trajectories
      );

      recalcRequested = false;
    }

    // Update dot buffer
    dotPoints.xs[0] = state.z[0];
    dotPoints.ys[0] = state.z[1];
    dotPoints.version++;

    // Calculate sample positions for current t
    if (showSamples) {
      writePositions(
        lastState.schedule,
        lastState.z,
        samplePool,
        t,
        samplePoints
      );
    }

    return true;
  }

  function render(webGl: WebGl): void {
    if (showVectorField && lastState) {
      drawVectorField(
        lineRenderer,
        webGl.dataToClipMatrix,
        (points, time) => {
          let buffer = vectorFieldBuffer;
          if (buffer?.xs.length !== points.xs.length) {
            buffer = makePoints2D(points.xs.length);
            vectorFieldBuffer = buffer;
          }
          if (lastState) {
            writeVelocities(
              lastState.schedule,
              lastState.z,
              time,
              points,
              buffer
            );
          }
          return buffer;
        },
        X_DOMAIN,
        Y_DOMAIN,
        t,
        undefined,
        COLORS.vectorField
      );
    }

    if (showTrajectories && trajectories.count > 0) {
      lineRenderer.renderTrajectories(
        webGl.dataToClipMatrix,
        trajectories,
        COLORS.trajectory
      );
    }

    if (showSamples && samplePoints.xs.length > 0) {
      pointRenderer.render(
        webGl.dataToClipMatrix,
        samplePoints,
        COLORS.point,
        POINT_SIZE
      );
    }

    // Draw dot
    dotRenderer.render(
      webGl.dataToClipMatrix,
      dotPoints,
      COLORS.dot,
      DOT_SIZE
    );
  }

  function destroy(): void {
    // No explicit cleanup
  }

  return {
    setShowTrajectories,
    setShowVectorField,
    setShowSamples,
    resample,
    update,
    render,
    destroy
  };
}
