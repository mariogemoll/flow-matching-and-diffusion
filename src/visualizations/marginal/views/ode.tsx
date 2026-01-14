import React, { useEffect, useRef, useState } from 'react';

import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import type { AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { writeTrajectories, writeVelocities } from '../../../math/std-gaussian-to-gmm';
import type { Points2D, Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { interpolateTrajectory,makeTrajectories } from '../../../util/trajectories';
import { clearWebGl, type WebGl } from '../../../webgl';
import { createLineRenderer, type LineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { ViewContainer, ViewControls } from '../../components/layout';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import {
  COLORS,
  MAX_NUM_SAMPLES,
  NUM_TRAJECTORY_STEPS,
  POINT_SIZE,
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import { useEngine } from '../../engine';
import { drawVectorField } from '../../webgl/vector-field';
import type { MargPathActions, MargPathState } from '../index';

function createGaussianSamples(count: number): Points2D {
  const points = makePoints2D(count);
  fillWithSamplesFromStdGaussian(points);
  return points;
}

export interface MargOdeViewProps {
  compact?: boolean;
}

export function MargOdeView({ compact = true }: MargOdeViewProps): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);

  // Local UI state
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showVectorField, setShowVectorField] = useState(false);
  const [showSamples, setShowSamples] = useState(true);

  const paramsRef = useRef({
    showTrajectories,
    showVectorField,
    showSamples,
    numSamples: engine.frame.state.numSamples,
    recalcRequested: true
  });

  const samplePoolRef = useRef<Points2D>(createGaussianSamples(MAX_NUM_SAMPLES));
  const trajectoriesRef = useRef<Trajectories>(
    makeTrajectories(NUM_TRAJECTORY_STEPS, MAX_NUM_SAMPLES)
  );
  const currentPointsRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const velocityRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const vectorFieldRef = useRef<Points2D | null>(null);

  // Sync local UI state into ref and trigger render
  useEffect(() => {
    paramsRef.current.showTrajectories = showTrajectories;
    paramsRef.current.showVectorField = showVectorField;
    paramsRef.current.showSamples = showSamples;
    if (paramsRef.current.numSamples !== engine.frame.state.numSamples) {
      paramsRef.current.numSamples = engine.frame.state.numSamples;
      paramsRef.current.recalcRequested = true;
    }
    engine.renderOnce();
  }, [showTrajectories, showVectorField, showSamples, engine.frame.state.numSamples, engine]);

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
        writeTrajectories(
          samplePoolRef.current,
          frame.state.schedule,
          frame.state.components,
          params.numSamples,
          NUM_TRAJECTORY_STEPS,
          trajectoriesRef.current,
          currentPointsRef.current,
          velocityRef.current
        );
        params.recalcRequested = false;
      }

      // Draw
      clearWebGl(webGl, COLORS.background);

      if (params.showVectorField) {
        drawVectorField(
          lineRendererRef.current,
          webGl.dataToClipMatrix,
          (points, t) => {
            let buffer = vectorFieldRef.current;
            if (buffer?.xs.length !== points.xs.length) {
              buffer = makePoints2D(points.xs.length);
              vectorFieldRef.current = buffer;
            }
            writeVelocities(
              frame.state.schedule,
              frame.state.components,
              t,
              points,
              buffer
            );
            return buffer;
          },
          X_DOMAIN,
          Y_DOMAIN,
          frame.clock.t,
          undefined,
          COLORS.vectorField
        );
      }

      if (
        params.showTrajectories &&
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
        trajectoriesRef.current.count > 0
      ) {
        const traj = trajectoriesRef.current;
        const numSamples = params.numSamples;
        const interpolatedPoints = makePoints2D(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const [px, py] = interpolateTrajectory(traj, i, frame.clock.t);
          interpolatedPoints.xs[i] = px;
          interpolatedPoints.ys[i] = py;
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

  const handleResampleTrajectories = (): void => {
    fillWithSamplesFromStdGaussian(samplePoolRef.current);
    paramsRef.current.recalcRequested = true;
    engine.renderOnce();
  };

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={showTrajectories}
        onChange={setShowTrajectories}
      />
      <ShowVectorFieldCheckbox
        checked={showVectorField}
        onChange={setShowVectorField}
      />
      <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
    </>
  );

  const restControls = (
    <>
      <ResampleTrajectoriesButton onClick={handleResampleTrajectories} />
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
