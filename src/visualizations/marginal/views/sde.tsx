import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { type SigmaScheduleName } from '../../../math/schedules/sigma';
import { createSdeNoises, type SdeNoises } from '../../../math/sde';
import { writeSdeTrajectories, writeSdeTrajectoriesHeun } from '../../../math/std-gaussian-to-gmm';
import type { Points2D, Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory, makeTrajectories } from '../../../util/trajectories';
import { clearWebGl, type WebGl } from '../../../webgl';
import { createLineRenderer, type LineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE,
  MAX_NUM_SAMPLES,
  MAX_NUM_SDE_STEPS,
  POINT_SIZE
} from '../../constants';
import { useEngine } from '../../engine';
import type { MargPathActions, MargPathState } from '../index';

function createGaussianSamples(count: number): Points2D {
  const points = makePoints2D(count);
  fillWithSamplesFromStdGaussian(points);
  return points;
}

export interface MargSdeViewProps {
  compact?: boolean;
  useHeun?: boolean;
}

export function MargSdeView({
  compact = true,
  useHeun: initialUseHeun = true
}: MargSdeViewProps): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);

  // Local UI state
  const [showSdeTrajectories, setShowSdeTrajectories] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [sigmaSchedule, setSigmaSchedule] = useState<SigmaScheduleName>(DEFAULT_SIGMA_SCHEDULE);
  const [sdeNumSteps, setSdeNumSteps] = useState(DEFAULT_NUM_SDE_STEPS);
  const [maxSigma, setMaxSigma] = useState(DEFAULT_MAX_SIGMA);
  const [useHeun, setUseHeun] = useState(initialUseHeun);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  const paramsRef = useRef({
    showSdeTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    useHeun,
    numSamples: engine.frame.state.numSamples,
    recalcRequested: true
  });

  const samplePoolRef = useRef<Points2D>(createGaussianSamples(MAX_NUM_SAMPLES));
  const noisesRef = useRef<SdeNoises>(createSdeNoises(MAX_NUM_SAMPLES, MAX_NUM_SDE_STEPS));
  const trajectoriesRef = useRef<Trajectories | null>(null);
  const currentPointsRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const velocityRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const scoreRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));

  // Sync local UI state into ref and trigger render
  useEffect(() => {
    paramsRef.current.showSdeTrajectories = showSdeTrajectories;
    paramsRef.current.showSamples = showSamples;

    // If SDE settings changed, request recalc
    if (
      paramsRef.current.sigmaSchedule !== sigmaSchedule ||
      paramsRef.current.sdeNumSteps !== sdeNumSteps ||
      paramsRef.current.maxSigma !== maxSigma ||
      paramsRef.current.useHeun !== useHeun
    ) {
      paramsRef.current.sigmaSchedule = sigmaSchedule;
      paramsRef.current.sdeNumSteps = sdeNumSteps;
      paramsRef.current.maxSigma = maxSigma;
      paramsRef.current.useHeun = useHeun;
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
    useHeun,
    engine.frame.state.numSamples,
    engine
  ]);

  // Track last state used for trajectory computation
  const lastScheduleRef = useRef<AlphaBetaScheduleName>(engine.frame.state.schedule);
  const lastNumSamplesRef = useRef<number>(engine.frame.state.numSamples);
  const lastComponentsRef = useRef<typeof engine.frame.state.components>(
    engine.frame.state.components
  );

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      if (lineRendererRef.current?.gl !== webGl.gl) {
        lineRendererRef.current = createLineRenderer(webGl.gl);
      }
      if (pointRendererRef.current?.gl !== webGl.gl) {
        pointRendererRef.current = createPointRenderer(webGl.gl);
      }

      const params = paramsRef.current;

      // Detect state changes that require recomputing trajectories
      if (
        frame.state.schedule !== lastScheduleRef.current ||
        frame.state.numSamples !== lastNumSamplesRef.current ||
        frame.state.components !== lastComponentsRef.current
      ) {
        lastScheduleRef.current = frame.state.schedule;
        lastNumSamplesRef.current = frame.state.numSamples;
        lastComponentsRef.current = frame.state.components;
        params.numSamples = frame.state.numSamples;
        params.recalcRequested = true;
      }

      if (params.recalcRequested) {
        const n = params.numSamples;
        const pointsPerTrajectory = params.sdeNumSteps + 1;

        if (
          trajectoriesRef.current?.count !== n ||
          trajectoriesRef.current.pointsPerTrajectory !== pointsPerTrajectory
        ) {
          trajectoriesRef.current = makeTrajectories(pointsPerTrajectory, n);
        }

        const writeTrajectories = params.useHeun
          ? writeSdeTrajectoriesHeun
          : writeSdeTrajectories;

        writeTrajectories(
          samplePoolRef.current,
          noisesRef.current,
          frame.state.schedule,
          params.sigmaSchedule,
          frame.state.components,
          params.numSamples,
          params.sdeNumSteps,
          params.maxSigma,
          trajectoriesRef.current,
          currentPointsRef.current,
          velocityRef.current,
          scoreRef.current
        );
        params.recalcRequested = false;
      }

      // Draw
      clearWebGl(webGl, COLORS.background);

      if (
        params.showSdeTrajectories &&
        trajectoriesRef.current &&
        trajectoriesRef.current.count > 0
      ) {
        lineRendererRef.current.renderTrajectories(
          webGl.dataToClipMatrix,
          trajectoriesRef.current,
          COLORS.trajectory
        );
      }

      // Draw moving dots along trajectories at current time
      if (
        params.showSamples &&
        trajectoriesRef.current &&
        trajectoriesRef.current.count > 0
      ) {
        const traj = trajectoriesRef.current;
        const numSamples = params.numSamples;
        const interpolatedPoints = makePoints2D(numSamples);

        if (frame.clock.t >= 0.99) {
          console.log(
            't=', frame.clock.t,
            'traj.count=', traj.count,
            'numSamples=', numSamples,
            'ppt=', traj.pointsPerTrajectory
          );
        }

        for (let i = 0; i < numSamples; i++) {
          const [px, py] = interpolateTrajectory(traj, i, frame.clock.t);
          interpolatedPoints.xs[i] = px;
          interpolatedPoints.ys[i] = py;
        }

        if (frame.clock.t >= 0.99) {
          console.log('First point:', interpolatedPoints.xs[0], interpolatedPoints.ys[0]);
        }

        pointRendererRef.current.render(
          webGl.dataToClipMatrix,
          interpolatedPoints,
          COLORS.point,
          POINT_SIZE,
          numSamples
        );
      }
    });
  }, [engine]);

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

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={showSdeTrajectories}
        onChange={setShowSdeTrajectories}
      />
      <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
      <label className="viz-checkbox">
        <input
          type="checkbox"
          checked={useHeun}
          onChange={(e) => { setUseHeun(e.target.checked); }}
        />
        <span>Heun</span>
      </label>
    </>
  );

  const restControls = (
    <>
      <ResampleSdeButton onClick={handleResample} />
      <SigmaScheduleSelection value={sigmaSchedule} onChange={setSigmaSchedule} />
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
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />

      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {checkboxControls}
            {restControls}
          </div>
        ) : (
          <>
            <div className="view-controls-group">{checkboxControls}</div>
            <div className="view-controls-group">{restControls}</div>
          </>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
