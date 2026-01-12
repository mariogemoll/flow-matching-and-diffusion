import React, { useEffect, useRef, useState } from 'react';

import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import { type AlphaBetaScheduleName, getAlpha, getBeta } from '../../../math/schedules/alpha-beta';
import { type Point2D, type Points2D } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { clearWebGl } from '../../../webgl';
import {
  createGaussianPdfRenderer,
  type GaussianPdfRenderer
} from '../../../webgl/renderers/gaussian-pdf';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { ResampleButton, SampleFrequencySlider } from '../../components/standard-controls';
import { COLORS, DOT_SIZE, MAX_NUM_SAMPLES, POINT_SIZE, X_DOMAIN, Y_DOMAIN } from '../../constants';
import { useEngine } from '../../engine';
import { type CondPathActions, type CondPathParams } from '../index';

export function CondPathView(): React.ReactElement {
  const engine = useEngine<CondPathParams, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const sampleRendererRef = useRef<PointRenderer | null>(null);
  const dotRendererRef = useRef<PointRenderer | null>(null);
  const pdfRendererRef = useRef<GaussianPdfRenderer | null>(null);

  const dotPoints = useRef({
    xs: new Float32Array(1),
    ys: new Float32Array(1),
    version: 0
  }).current;

  // Local state
  const [sampleFrequency, setSampleFrequency] = useState(15);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  // Use Refs for mutable state accessed in render loop
  const paramsRef = useRef({
    sampleFrequency,
    resampleRequested: true
  });

  const samplePointsRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));

  // Sync params ref with state
  useEffect(() => {
    paramsRef.current.sampleFrequency = sampleFrequency;
    engine.renderOnce();
  }, [sampleFrequency, engine]);

  // Sync z/schedule/numSamples changes to request resample
  const lastRenderedRef = useRef<{
    z: Point2D;
    schedule: AlphaBetaScheduleName;
    numSamples: number;
    t: number;
    timestamp: number;
  }>({
    z: engine.frame.state.z,
    schedule: engine.frame.state.schedule,
    numSamples: engine.frame.state.numSamples,
    t: engine.frame.clock.t,
    timestamp: 0
  });

  useEffect(() => {
    engine.setLoopPause(0);
  }, [engine]);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      if (dotRendererRef.current?.gl !== webGl.gl) {
        dotRendererRef.current = createPointRenderer(webGl.gl);
      }
      if (sampleRendererRef.current?.gl !== webGl.gl) {
        sampleRendererRef.current = createPointRenderer(webGl.gl);
      }
      if (pdfRendererRef.current?.gl !== webGl.gl) {
        pdfRendererRef.current = createGaussianPdfRenderer(webGl.gl);
      }

      const dotRenderer = dotRendererRef.current;
      const sampleRenderer = sampleRendererRef.current;
      const pdfRenderer = pdfRendererRef.current;
      const params = paramsRef.current;

      const now = performance.now();
      const current = {
        z: frame.state.z,
        schedule: frame.state.schedule,
        numSamples: frame.state.numSamples,
        t: frame.clock.t
      };

      const last = lastRenderedRef.current;

      const zChanged = current.z !== last.z;
      const tChanged = current.t !== last.t;
      const numSamplesChanged = current.numSamples !== last.numSamples;
      const scheduleChanged = current.schedule !== last.schedule;
      const resampleRequested = params.resampleRequested;
      const isFinished = current.t >= 1.0;

      // Immediate updates: Schedule change, manual request, or finishing move
      const isImmediate = scheduleChanged ||
        resampleRequested ||
        (isFinished && (tChanged || zChanged));

      // Throttled updates: Standard animation or interaction
      const isThrottled = tChanged || zChanged || numSamplesChanged;

      const numSamplesChangedWhilePaused = numSamplesChanged && !tChanged;

      let shouldUpdate = isImmediate;
      if (!shouldUpdate && isThrottled && !numSamplesChangedWhilePaused) {
        const dt = now - last.timestamp;
        const threshold = params.sampleFrequency >= 120 ? 0 : (1000 / params.sampleFrequency);
        if (dt >= threshold) {
          shouldUpdate = true;
        }
      }

      clearWebGl(webGl, COLORS.background);

      // P(x_t | x_1) = N(alpha_t * x_1, beta_t^2 * I)
      const t = frame.clock.t;
      const schedule: AlphaBetaScheduleName = frame.state.schedule;
      const numSamples = frame.state.numSamples;

      const alpha = getAlpha(t, schedule);
      const beta = getBeta(t, schedule);

      const mean: Point2D = [
        alpha * frame.state.z[0],
        alpha * frame.state.z[1]
      ];
      // Variance beta^2, ensure strictly positive
      const variance = Math.max(beta * beta, 0.001);

      // Draw PDF background
      webGl.gl.enable(webGl.gl.BLEND);
      webGl.gl.blendFunc(webGl.gl.SRC_ALPHA, webGl.gl.ONE_MINUS_SRC_ALPHA);

      pdfRenderer.render(
        webGl.dataToClipMatrix,
        mean,
        variance,
        COLORS.pdf
      );

      const samples = samplePointsRef.current;

      if (shouldUpdate) {
        if (!numSamplesChangedWhilePaused || params.resampleRequested) {
          // 1. Fill with standard normal N(0, I)
          fillWithSamplesFromStdGaussian(samples);
        }

        // 2. Transform to N(mean, beta^2 I)
        for (let i = 0; i < samples.xs.length; i++) {
          samples.xs[i] = mean[0] + beta * samples.xs[i];
          samples.ys[i] = mean[1] + beta * samples.ys[i];
        }
        samples.version++;

        // Update state
        params.resampleRequested = false;
        lastRenderedRef.current = {
          ...current,
          timestamp: now
        };
      }

      sampleRenderer.render(
        webGl.dataToClipMatrix,
        samples,
        COLORS.point,
        POINT_SIZE,
        numSamples // Only draw the requested amount
      );

      // Update dot buffer
      dotPoints.xs[0] = frame.state.z[0];
      dotPoints.ys[0] = frame.state.z[1];
      dotPoints.version++;

      // Draw dot
      dotRenderer.render(
        webGl.dataToClipMatrix,
        dotPoints,
        COLORS.dot,
        DOT_SIZE
      );
    });
  }, [engine, dotPoints, samplePointsRef]);

  // Implement resample action
  const handleResample = (): void => {
    paramsRef.current.resampleRequested = true;
    engine.renderOnce();
  };

  return (
    <>
      <ViewContainer>
        <PointerCanvas
          ref={pointerCanvasRef}
          onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
          xDomain={X_DOMAIN}
          yDomain={Y_DOMAIN}
        />
        <ViewControls>
          <ResampleButton onClick={handleResample} />
          {showAdditionalControls ? (
            <SampleFrequencySlider
              value={sampleFrequency}
              onChange={setSampleFrequency}
            />
          ) : null}
          <EllipsisToggle
            expanded={showAdditionalControls}
            onToggle={() => { setShowAdditionalControls((current) => !current); }}
          />
        </ViewControls>
      </ViewContainer>
    </>
  );
}
