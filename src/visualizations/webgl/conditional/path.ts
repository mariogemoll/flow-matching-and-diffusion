import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import {
  type AlphaBetaScheduleName,
  getAlpha,
  getBeta } from '../../../math/schedules/alpha-beta';
import type { Point2D } from '../../../types';
import { makePoints2D } from '../../../util/points';
import type { WebGl } from '../../../webgl';
import { createGaussianPdfRenderer } from '../../../webgl/renderers/gaussian-pdf';
import { createPointRenderer } from '../../../webgl/renderers/point';
import type { CondPathParams } from '../../conditional';
import {
  COLORS,
  DOT_SIZE,
  MAX_NUM_SAMPLES,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { WebGlRenderer } from '../types';

export interface CondPathRenderer extends WebGlRenderer<CondPathParams> {
  setSampleFrequency(freq: number): void;
  resample(): void;
}

export function createCondPathRenderer(gl: WebGLRenderingContext): CondPathRenderer {
  const dotRenderer = createPointRenderer(gl);
  const sampleRenderer = createPointRenderer(gl);
  const pdfRenderer = createGaussianPdfRenderer(gl);

  const dotPoints = {
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  };

  const samplePointsBuffer = makePoints2D(MAX_NUM_SAMPLES);

  let sampleFrequency = 15;
  let resampleRequested = true;
  let numSamplesToDraw = 0;

  const pdfParams = {
    mean: [0, 0] as Point2D,
    variance: 0.001,
    ready: false
  };

  // Track last sample for sample update optimization
  let lastSample: {
    z: Point2D;
    t: number;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
    timestamp: number;
  } = {
    z: [0, 0],
    t: 0,
    schedule: 'linear',
    numSamples: 0,
    timestamp: 0
  };

  function setSampleFrequency(freq: number): void {
    sampleFrequency = freq;
  }

  function resample(): void {
    resampleRequested = true;
  }

  function update(frame: Frame<CondPathParams>): boolean {
    const state = frame.state;
    const t = frame.clock.t;
    const now = performance.now();

    const current = {
      z: state.z,
      schedule: state.schedule,
      numSamples: state.numSamples,
      t
    };

    // Calculate PDF params always (needed for background)
    const alpha = getAlpha(t, state.schedule);
    const beta = getBeta(t, state.schedule);
    const mean: Point2D = [
      alpha * state.z[0],
      alpha * state.z[1]
    ];
    // Variance beta^2, ensure strictly positive
    const variance = Math.max(beta * beta, 0.001);

    pdfParams.mean = mean;
    pdfParams.variance = variance;
    pdfParams.ready = true;

    // Sample Update Logic
    const zChanged = current.z !== lastSample.z;
    const tChanged = current.t !== lastSample.t;
    const numSamplesChanged = current.numSamples !== lastSample.numSamples;
    const scheduleChanged = current.schedule !== lastSample.schedule;

    // Check if we are "finished" (t >= 1.0)
    const isFinished = current.t >= 1.0;

    const numSamplesChangedWhilePaused = numSamplesChanged && !tChanged;

    let shouldUpdate =
      resampleRequested || scheduleChanged || (isFinished && (tChanged || zChanged));

    // Throttled updates
    if (
      !shouldUpdate &&
      (tChanged || zChanged || numSamplesChanged) &&
      !numSamplesChangedWhilePaused
    ) {
      const dt = now - lastSample.timestamp;
      const threshold = sampleFrequency >= 120 ? 0 : (1000 / sampleFrequency);
      if (dt >= threshold) {
        shouldUpdate = true;
      }
    }

    if (
      !shouldUpdate &&
      numSamplesChangedWhilePaused &&
      current.numSamples > lastSample.numSamples
    ) {
      // If we increased samples while paused, force update to fill new samples
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      if (!numSamplesChangedWhilePaused || resampleRequested) {
        fillWithSamplesFromStdGaussian(samplePointsBuffer);
      }

      // Transform to N(mean, beta^2 I)
      const n = samplePointsBuffer.xs.length;
      for (let i = 0; i < n; i++) {
        samplePointsBuffer.xs[i] = mean[0] + beta * samplePointsBuffer.xs[i];
        samplePointsBuffer.ys[i] = mean[1] + beta * samplePointsBuffer.ys[i];
      }
      samplePointsBuffer.version++;

      resampleRequested = false;
      lastSample = {
        z: state.z,
        t,
        schedule: state.schedule,
        numSamples: state.numSamples,
        timestamp: now
      };
    }

    numSamplesToDraw = current.numSamples;

    // Update dot buffer
    dotPoints.xs[0] = state.z[0];
    dotPoints.ys[0] = state.z[1];
    dotPoints.version++;

    return true;
  }

  function render(webGl: WebGl): void {
    if (pdfParams.ready) {
      webGl.gl.enable(webGl.gl.BLEND);
      webGl.gl.blendFunc(webGl.gl.SRC_ALPHA, webGl.gl.ONE_MINUS_SRC_ALPHA);

      pdfRenderer.render(
        webGl.dataToClipMatrix,
        pdfParams.mean,
        pdfParams.variance,
        COLORS.pdf
      );
    }

    if (numSamplesToDraw > 0) {
      sampleRenderer.render(
        webGl.dataToClipMatrix,
        samplePointsBuffer,
        COLORS.point,
        POINT_SIZE,
        numSamplesToDraw
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
    // No explicit cleanup needed
  }

  return {
    setSampleFrequency,
    resample,
    update,
    render,
    destroy
  };
}
