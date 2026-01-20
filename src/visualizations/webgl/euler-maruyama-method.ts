// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

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
import type { EulerMaruyamaMethodState } from '../euler-maruyama-method';
import type { WebGlRenderer } from './types';
import { drawVectorField } from './vector-field';

export interface EulerMaruyamaMethodRenderer extends WebGlRenderer<EulerMaruyamaMethodState> {
  // Placeholder to satisfy interface if needed, or methods to add later
  _placeholder?: never;
}

export function createEulerMaruyamaMethodRenderer(
  gl: WebGLRenderingContext
): EulerMaruyamaMethodRenderer {
  const lineRenderer = createLineRenderer(gl);
  const thickLineRenderer = createThickLineRenderer(gl);
  const pointRenderer = createPointRenderer(gl);

  let state: EulerMaruyamaMethodState | null = null;
  let t = 0;

  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  function update(frame: Frame<EulerMaruyamaMethodState>): boolean {
    state = frame.state;
    t = frame.clock.t;
    return true;
  }

  function render(webGl: WebGl): void {
    if (!state) { return; }

    drawVectorField(
      lineRenderer,
      webGl.dataToClipMatrix,
      demoVectorFieldBatch,
      X_DOMAIN,
      Y_DOMAIN,
      t,
      undefined,
      COLORS.vectorField
    );

    const {
      deterministicTrajectory,
      stochasticTrajectory,
      showDeterministic,
      showStochastic
    } = state;

    if (showDeterministic && deterministicTrajectory.count > 0) {
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        deterministicTrajectory,
        COLORS.singleTrajectorySecondary,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

    if (showStochastic && stochasticTrajectory.count > 0) {
      thickLineRenderer.renderThickTrajectories(
        webGl.dataToClipMatrix,
        stochasticTrajectory,
        COLORS.singleTrajectory,
        THICK_LINE_THICKNESS,
        1.0
      );
    }

    if (stochasticTrajectory.count > 0) {
      const currentPos = interpolateTrajectory(stochasticTrajectory, 0, t);

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
