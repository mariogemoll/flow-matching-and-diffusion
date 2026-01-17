import { makeGmm } from '../../../math/gmm';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { sampleFromGmmMargProbPath, writeGmm } from '../../../math/std-gaussian-to-gmm';
import type { GaussianMixture } from '../../../types';
import { makePoints2D } from '../../../util/points';
import type { WebGl } from '../../../webgl';
import {
  createGaussianMixturePdfRenderer
} from '../../../webgl/renderers/gaussian-mixture-pdf';
import { createPointRenderer } from '../../../webgl/renderers/point';
import {
  COLORS,
  MAX_NUM_SAMPLES,
  POINT_SIZE
} from '../../constants';
import type { Frame } from '../../engine';
import type { MargPathState } from '../../marginal';
import type { WebGlRenderer } from '../types';

export interface MargPathRenderer extends WebGlRenderer<MargPathState> {
  setShowPdf(show: boolean): void;
  setShowSamples(show: boolean): void;
  setSampleFrequency(freq: number): void;
  resample(): void;
}

export function createMargPathRenderer(gl: WebGLRenderingContext): MargPathRenderer {
  const pdfRenderer = createGaussianMixturePdfRenderer(gl);
  const sampleRenderer = createPointRenderer(gl);

  let showPdf = true;
  let showSamples = true;
  let sampleFrequency = 15;

  let resampleRequested = true;

  let mixture: GaussianMixture = makeGmm(0);
  const baseMixture: GaussianMixture = {
    components: [],
    version: 0
  };
  const samplePointsBuffer = makePoints2D(MAX_NUM_SAMPLES);

  let numSamplesToDraw = 0;

  // Track last update for PDF rendering optimization
  const lastUpdate: {
    t: number;
    schedule: AlphaBetaScheduleName | null;
    components: MargPathState['components'] | null;
  } = {
    t: NaN,
    schedule: null,
    components: null
  };

  // Track last sample for sample update optimization
  let lastSample: {
    t: number;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
    components: MargPathState['components'] | null;
    timestamp: number;
  } = {
    t: 0,
    schedule: 'linear',
    numSamples: 0,
    components: null,
    timestamp: 0
  };

  function setShowPdf(show: boolean): void {
    showPdf = show;
  }

  function setShowSamples(show: boolean): void {
    if (showSamples !== show) {
      showSamples = show;
      if (show) {
        resampleRequested = true;
      }
    }
  }

  function setSampleFrequency(freq: number): void {
    sampleFrequency = freq;
  }

  function resample(): void {
    resampleRequested = true;
  }

  function update(frame: Frame<MargPathState>): boolean {
    const state = frame.state;
    const t = frame.clock.t;
    const now = performance.now();

    // Render Logic for PDF
    if (
      lastUpdate.t !== t ||
      lastUpdate.schedule !== state.schedule ||
      lastUpdate.components !== state.components
    ) {
      baseMixture.components = state.components;
      // Ensure mixture has enough capacity
      if (mixture.components.length !== state.components.length) {
        mixture = makeGmm(state.components.length);
      }
      writeGmm(
        baseMixture,
        state.schedule,
        t,
        mixture
      );
      lastUpdate.t = t;
      lastUpdate.schedule = state.schedule;
      lastUpdate.components = state.components;
    }

    // Sample Update Logic
    if (showSamples) {
      const numSamples = state.numSamples;
      const tChanged = t !== lastSample.t;
      const scheduleChanged = state.schedule !== lastSample.schedule;
      const numSamplesChanged = numSamples !== lastSample.numSamples;
      const componentsChanged = state.components !== lastSample.components;
      const numSamplesChangedWhilePaused = numSamplesChanged && !tChanged;

      let shouldResample = resampleRequested ||
        scheduleChanged ||
        componentsChanged;

      if (!shouldResample && tChanged) {
        const dt = now - lastSample.timestamp;
        const threshold = sampleFrequency >= 120
          ? 0
          : (1000 / Math.max(1, sampleFrequency));
        if (dt >= threshold) {
          shouldResample = true;
        }
      }

      if (
        !shouldResample &&
        numSamplesChangedWhilePaused &&
        numSamples > lastSample.numSamples
      ) {
        shouldResample = true;
      }

      if (shouldResample) {
        if (
          numSamplesChangedWhilePaused &&
          numSamples > lastSample.numSamples &&
          !resampleRequested &&
          !scheduleChanged &&
          !componentsChanged
        ) {
          // Add more samples incrementally
          const additionalCount = numSamples - lastSample.numSamples;
          sampleFromGmmMargProbPath(
            state.components,
            additionalCount,
            t,
            state.schedule,
            samplePointsBuffer,
            lastSample.numSamples, // Offset
            additionalCount
          );
        } else {
          // Full resample
          sampleFromGmmMargProbPath(
            state.components,
            numSamples,
            t,
            state.schedule,
            samplePointsBuffer
          );
        }

        resampleRequested = false;
        lastSample = {
          t,
          schedule: state.schedule,
          numSamples,
          components: state.components,
          timestamp: now
        };
        numSamplesToDraw = numSamples;
      } else if (numSamplesChangedWhilePaused && numSamples < lastSample.numSamples) {
        // Just update the count, no resampling needed (points are already there)
        lastSample = {
          t,
          schedule: state.schedule,
          numSamples,
          components: state.components,
          timestamp: now
        };
        numSamplesToDraw = numSamples;
      } else {
        // No resampling, but keep count consistent for drawing
        numSamplesToDraw = lastSample.numSamples;
      }
    }

    return true;
  }

  function render(webGl: WebGl): void {
    if (showPdf && lastUpdate.components !== null) {
      pdfRenderer.render(
        webGl.dataToClipMatrix,
        mixture,
        COLORS.pdf
      );
    }

    if (showSamples && numSamplesToDraw > 0) {
      sampleRenderer.render(
        webGl.dataToClipMatrix,
        samplePointsBuffer,
        COLORS.point,
        POINT_SIZE,
        numSamplesToDraw
      );
    }
  }

  function destroy(): void {
    // No explicit cleanup needed
  }

  return {
    setShowPdf,
    setShowSamples,
    setSampleFrequency,
    resample,
    update,
    render,
    destroy
  };
}
