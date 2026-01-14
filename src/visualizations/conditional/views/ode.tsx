import React, { useEffect, useRef, useState } from 'react';

import {
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { fillWithSamplesFromStdGaussian } from '../../../math/gaussian';
import { type AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import {
  writePositions, writeTrajectories, writeVelocities
} from '../../../math/std-gaussian-to-dirac-delta';
import { type Point2D, type Points2D, type Trajectories } from '../../../types';
import { makePoints2D } from '../../../util/points';
import { makeTrajectories } from '../../../util/trajectories';
import { clearWebGl } from '../../../webgl';
import { createLineRenderer, type LineRenderer } from '../../../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../../../webgl/renderers/point';
import { ViewContainer, ViewControls } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import {
  COLORS,
  DOT_SIZE,
  MAX_NUM_SAMPLES,
  POINT_SIZE
} from '../../constants';
import { useEngine } from '../../engine';
import { drawVectorField } from '../../webgl/vector-field';
import { type CondPathActions, type CondPathParams } from '../index';

export function CondOdeView(): React.ReactElement {
  const engine = useEngine<CondPathParams, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  // Renderers
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const dotRendererRef = useRef<PointRenderer | null>(null);

  const dotPoints = useRef<Points2D>(makePoints2D(1)).current;

  // Local state
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

  // Sample pool (initial Gaussian samples at t=0)
  const samplePoolRef = useRef<Points2D>(makePoints2D(MAX_NUM_SAMPLES));
  const trajectoriesRef = useRef<Trajectories>(
    makeTrajectories(NUM_TRAJECTORY_STEPS + 1, engine.frame.state.numSamples)
  );
  const samplePointsRef = useRef<Points2D>(makePoints2D(engine.frame.state.numSamples));

  // Initialize sample pool
  useEffect(() => {
    fillWithSamplesFromStdGaussian(samplePoolRef.current);
    paramsRef.current.recalcRequested = true;
    engine.renderOnce();
  }, [engine]);

  // Sync params ref
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

      // Check for state changes
      if (
        frame.state.z !== lastZRef.current ||
        frame.state.schedule !== lastScheduleRef.current ||
        frame.state.numSamples !== lastNumSamplesRef.current
      ) {
        lastZRef.current = frame.state.z;
        lastScheduleRef.current = frame.state.schedule;
        lastNumSamplesRef.current = frame.state.numSamples;
        params.numSamples = frame.state.numSamples;
        params.recalcRequested = true;
      }

      // Recalculate trajectories if needed
      if (params.recalcRequested) {
        const n = Math.min(params.numSamples, samplePoolRef.current.xs.length);
        const pointsPerTrajectory = NUM_TRAJECTORY_STEPS + 1;
        if (
          trajectoriesRef.current.count !== n ||
          trajectoriesRef.current.pointsPerTrajectory !== pointsPerTrajectory
        ) {
          trajectoriesRef.current = makeTrajectories(pointsPerTrajectory, n);
        }
        if (samplePointsRef.current.xs.length !== n) {
          samplePointsRef.current = makePoints2D(n);
        }

        writeTrajectories(
          frame.state.schedule,
          frame.state.z,
          samplePoolRef.current,
          NUM_TRAJECTORY_STEPS,
          trajectoriesRef.current
        );
        params.recalcRequested = false;
      }

      const t = frame.clock.t;

      clearWebGl(webGl, COLORS.background);

      // Draw vector field if enabled
      if (params.showVectorField) {
        const vectorFieldScratch = makePoints2D(25 * 19);
        drawVectorField(
          lineRenderer,
          webGl.dataToClipMatrix,
          (points, tVal) => {
            writeVelocities(
              frame.state.schedule,
              frame.state.z,
              tVal,
              points,
              vectorFieldScratch
            );
            return vectorFieldScratch;
          },
          X_DOMAIN,
          Y_DOMAIN,
          t,
          undefined,
          COLORS.vectorField
        );
      }

      // Draw trajectory lines (full trajectories, they only change when params change)
      if (params.showTrajectories && trajectoriesRef.current.count > 0) {
        lineRenderer.renderTrajectories(
          webGl.dataToClipMatrix,
          trajectoriesRef.current,
          COLORS.trajectory
        );
      }

      // Draw current positions using flow map
      if (params.showSamples) {
        writePositions(
          frame.state.schedule,
          frame.state.z,
          samplePoolRef.current,
          t,
          samplePointsRef.current
        );
        pointRenderer.render(
          webGl.dataToClipMatrix,
          samplePointsRef.current,
          COLORS.point,
          POINT_SIZE
        );
      }

      // Draw the controllable z dot on top
      dotPoints.xs[0] = frame.state.z[0];
      dotPoints.ys[0] = frame.state.z[1];
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
      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showTrajectories}
          onChange={setShowTrajectories}
        />
        <ShowVectorFieldCheckbox
          checked={showVectorField}
          onChange={setShowVectorField}
        />
        <ShowSamplesCheckbox
          checked={showSamples}
          onChange={setShowSamples}
        />
        <ResampleTrajectoriesButton onClick={handleResample} />
      </ViewControls>
    </ViewContainer>
  );
}
