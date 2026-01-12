import React, { useEffect, useRef } from 'react';

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
import { ViewContainer } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { ProbPathVisualizationControls } from '../../components/prob-path-visualization-controls';
import { COLORS, DOT_SIZE, POINT_SIZE, X_DOMAIN, Y_DOMAIN } from '../../constants';
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

  // Samples
  const samplePointsRef = useRef<Points2D>(makePoints2D(0));

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

      if (samplePointsRef.current.xs.length !== numSamples) {
        samplePointsRef.current = makePoints2D(numSamples);
      }
      const samples = samplePointsRef.current;

      // 1. Fill with standard normal N(0, I)
      fillWithSamplesFromStdGaussian(samples);

      // 2. Transform to N(mean, beta^2 I)
      for (let i = 0; i < numSamples; i++) {
        samples.xs[i] = mean[0] + beta * samples.xs[i];
        samples.ys[i] = mean[1] + beta * samples.ys[i];
      }
      samples.version++;

      sampleRenderer.render(
        webGl.dataToClipMatrix,
        samples,
        COLORS.point,
        POINT_SIZE
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

  return (
    <>
      <ViewContainer>
        <ProbPathVisualizationControls />
        <PointerCanvas
          ref={pointerCanvasRef}
          onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
          xDomain={X_DOMAIN}
          yDomain={Y_DOMAIN}
        />
      </ViewContainer>
    </>
  );
}
