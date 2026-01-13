import React, { useEffect, useRef, useState } from 'react';

import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import { type AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { type SigmaScheduleName } from '../../../math/schedules/sigma';
import {
  createSdeNoises,
  type SdeNoises,
  writeSdeTrajectories
} from '../../../math/std-gaussian-to-dirac-delta';
import { type Point2D, type Points2D, type Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory, makeTrajectories } from '../../../util/trajectories';
import { clearWebGl } from '../../../webgl';
import { createLineRenderer, type LineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE,
  DOT_SIZE,
  MAX_NUM_SAMPLES,
  MAX_NUM_SDE_STEPS,
  POINT_SIZE,
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import { useEngine } from '../../engine';
import { type CondPathActions, type CondPathParams } from '../index';

export function CondSdeView(): React.ReactElement {
  const engine = useEngine<CondPathParams, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const lineRendererRef = useRef<LineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const dotRendererRef = useRef<PointRenderer | null>(null);

  const dotPoints = useRef<Points2D>(makePoints2D(1)).current;

  const [showSdeTrajectories, setShowSdeTrajectories] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [sigmaSchedule, setSigmaSchedule] = useState<SigmaScheduleName>(DEFAULT_SIGMA_SCHEDULE);
  const [sdeNumSteps, setSdeNumSteps] = useState(DEFAULT_NUM_SDE_STEPS);
  const [maxSigma, setMaxSigma] = useState(DEFAULT_MAX_SIGMA);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  const paramsRef = useRef({
    showSdeTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    numSamples: engine.frame.state.numSamples,
    recalcRequested: true
  });

  const samplePoolRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));

  // Create a single large pool of noise values that we reuse.
  // This ensures that when we change the number of steps or samples,
  // the underlying "randomness" stays the same, so trajectories deform smoothly.
  const noisesRef = useRef<SdeNoises>(createSdeNoises(MAX_NUM_SAMPLES, MAX_NUM_SDE_STEPS));

  const trajectoriesRef = useRef<Trajectories | null>(null);
  const samplePointsRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));

  // Initialize sample pool
  useEffect(() => {
    fillWithSamplesFromStdGaussian(samplePoolRef.current);
    paramsRef.current.recalcRequested = true;
    engine.renderOnce();
  }, [engine]);

  // Sync local params ref
  useEffect(() => {
    paramsRef.current.showSdeTrajectories = showSdeTrajectories;
    paramsRef.current.showSamples = showSamples;

    // If SDE settings changed, request recalc
    if (
      paramsRef.current.sigmaSchedule !== sigmaSchedule ||
      paramsRef.current.sdeNumSteps !== sdeNumSteps ||
      paramsRef.current.maxSigma !== maxSigma
    ) {
      paramsRef.current.sigmaSchedule = sigmaSchedule;
      paramsRef.current.sdeNumSteps = sdeNumSteps;
      paramsRef.current.maxSigma = maxSigma;
      paramsRef.current.recalcRequested = true;
    }

    if (paramsRef.current.numSamples !== engine.frame.state.numSamples) {
      paramsRef.current.numSamples = engine.frame.state.numSamples;
      paramsRef.current.recalcRequested = true;
    }
    engine.renderOnce();
  }, [
    showSdeTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    engine.frame.state.numSamples,
    engine
  ]);

  // Track state changes
  const lastZRef = useRef<Point2D>(engine.frame.state.z);
  const lastScheduleRef = useRef<AlphaBetaScheduleName>(engine.frame.state.schedule);
  const lastNumSamplesRef = useRef<number>(engine.frame.state.numSamples);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      // Initialize renderers
      if (lineRendererRef.current?.gl !== webGl.gl) {
        lineRendererRef.current = createLineRenderer(webGl.gl);
      }
      if (pointRendererRef.current?.gl !== webGl.gl) {
        pointRendererRef.current = createPointRenderer(webGl.gl);
      }
      if (dotRendererRef.current?.gl !== webGl.gl) {
        dotRendererRef.current = createPointRenderer(webGl.gl);
      }

      const lineRenderer = lineRendererRef.current;
      const pointRenderer = pointRendererRef.current;
      const dotRenderer = dotRendererRef.current;
      const params = paramsRef.current;
      const state = frame.state;

      // Check for state changes that require recalc
      if (
        state.z !== lastZRef.current ||
        state.schedule !== lastScheduleRef.current ||
        state.numSamples !== lastNumSamplesRef.current
      ) {
        lastZRef.current = state.z;
        lastScheduleRef.current = state.schedule;
        lastNumSamplesRef.current = state.numSamples;
        params.numSamples = state.numSamples;
        params.recalcRequested = true;
      }

      // Recalculate trajectories if needed
      if (params.recalcRequested) {
        // Regenerate noise if needed (size changed or doesn't exist)
        // Note: We use a fixed large pool (noisesRef.current) initialized on mount,
        // so we don't need to check sizes here unless we exceeded MAX_NUM_SAMPLES or MAX_SDE_STEPS
        // which shouldn't happen given the constraints.
        const noises = noisesRef.current;

        const n = params.numSamples;
        const pointsPerTrajectory = params.sdeNumSteps + 1;
        if (
          trajectoriesRef.current?.count !== n ||
          trajectoriesRef.current.pointsPerTrajectory !== pointsPerTrajectory
        ) {
          trajectoriesRef.current = makeTrajectories(pointsPerTrajectory, n);
        }

        writeSdeTrajectories(
          state.schedule,
          params.sigmaSchedule,
          params.maxSigma,
          samplePoolRef.current,
          state.z,
          noises,
          params.sdeNumSteps,
          trajectoriesRef.current
        );
        params.recalcRequested = false;
      }

      const t = frame.clock.t;

      clearWebGl(webGl, COLORS.background);

      // Draw SDE trajectories
      if (
        params.showSdeTrajectories &&
        trajectoriesRef.current &&
        trajectoriesRef.current.count > 0
      ) {
        lineRenderer.renderTrajectories(
          webGl.dataToClipMatrix,
          trajectoriesRef.current,
          COLORS.trajectory
        );
      }

      // Draw current positions on trajectories (interpolated at current t)
      if (params.showSamples && trajectoriesRef.current && trajectoriesRef.current.count > 0) {
        const trajectories = trajectoriesRef.current;
        const samples = samplePointsRef.current;
        const n = Math.min(params.numSamples, trajectories.count);

        for (let i = 0; i < n; i++) {
          const pos = interpolateTrajectory(trajectories, i, t);
          samples.xs[i] = pos[0];
          samples.ys[i] = pos[1];
        }
        samples.version++;

        pointRenderer.render(
          webGl.dataToClipMatrix,
          samples,
          COLORS.point,
          POINT_SIZE,
          n
        );
      }

      // Draw the controllable z dot on top
      dotPoints.xs[0] = state.z[0];
      dotPoints.ys[0] = state.z[1];
      dotPoints.version++;

      dotRenderer.render(
        webGl.dataToClipMatrix,
        dotPoints,
        COLORS.dot,
        DOT_SIZE
      );
    });
  }, [engine, dotPoints]);

  const handleResample = (): void => {
    fillWithSamplesFromStdGaussian(samplePoolRef.current);
    // Regenerate the noise pool content
    const noises = noisesRef.current;
    fillWithSamplesFromStdGaussian(noises);
    paramsRef.current.recalcRequested = true;
    engine.renderOnce();
  };

  const handleResampleNoise = (): void => {
    // Regenerate just the noise pool content
    const noises = noisesRef.current;
    fillWithSamplesFromStdGaussian(noises);
    paramsRef.current.recalcRequested = true;
    engine.renderOnce();
  };

  return (
    <ViewContainer>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />

      {/* Local controls - SDE-specific */}
      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showSdeTrajectories}
          onChange={setShowSdeTrajectories}
        />
        <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
        <ResampleSdeButton onClick={handleResample} />
        <SigmaScheduleSelection
          value={sigmaSchedule}
          onChange={setSigmaSchedule}
        />
        {showAdditionalControls ? (
          <>
            <NumStepsSlider value={sdeNumSteps} onChange={setSdeNumSteps} />
            <MaxSigmaSlider
              value={maxSigma}
              onChange={setMaxSigma}
              schedule={sigmaSchedule}
            />
            <ResampleDiffusionNoiseButton onClick={handleResampleNoise} />
          </>
        ) : null}
        <EllipsisToggle
          expanded={showAdditionalControls}
          onToggle={() => { setShowAdditionalControls((current) => !current); }}
        />
      </ViewControls>
    </ViewContainer>
  );
}
