import React, { useEffect, useRef, useState } from 'react';

import {
  demoVectorField,
  demoVectorFieldBatch,
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import { eulerMethodTrajectory } from '../math/vector-field';
import type { Point2D, Trajectories } from '../types';
import { interpolateTrajectory } from '../util/trajectories';
import { createLineRenderer, type LineRenderer } from '../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { createThickLineRenderer, type ThickLineRenderer } from '../webgl/renderers/thick-line';
import { Checkbox } from './components/checkbox';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { Slider } from './components/slider';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { COLORS, DOT_SIZE, THICK_LINE_THICKNESS, X_DOMAIN, Y_DOMAIN } from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { drawVectorField } from './webgl/vector-field';

const DEFAULT_EULER_STEPS = 10;
const MAX_EULER_STEPS = 50;

function segmentStartTime(t: number, numSteps: number): number {
  const safeSteps = Math.max(1, Math.floor(numSteps));
  const segmentIndex = Math.min(Math.floor(t * safeSteps), safeSteps - 1);
  return segmentIndex / safeSteps;
}


export interface EulerMethodState {
  startPos: Point2D;
  groundTruthTrajectory: Trajectories;
  eulerTrajectory: Trajectories;
  numSteps: number;
  showGroundTruth: boolean;
  showEuler: boolean;
}

export interface EulerMethodActions {
  regenerate: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setNumSteps: (steps: number) => void;
  setShowGroundTruth: (show: boolean) => void;
  setShowEuler: (show: boolean) => void;
}


function createTrajectories(startPos: Point2D, numSteps: number): {
  groundTruthTrajectory: Trajectories;
  eulerTrajectory: Trajectories;
} {
  return {
    groundTruthTrajectory: demoVectorFieldTrajectory(startPos),
    eulerTrajectory: eulerMethodTrajectory(demoVectorField, numSteps, startPos)
  };
}

export const eulerMethodModel: Model<EulerMethodState, EulerMethodActions> = {
  initState: () => {
    const startPos = randomStartPos();
    const { groundTruthTrajectory, eulerTrajectory } = createTrajectories(
      startPos,
      DEFAULT_EULER_STEPS
    );
    return {
      startPos,
      groundTruthTrajectory,
      eulerTrajectory,
      numSteps: DEFAULT_EULER_STEPS,
      showGroundTruth: true,
      showEuler: true
    };
  },

  actions: (engine): EulerMethodActions => ({
    regenerate(): void {
      const startPos = randomStartPos();
      const { groundTruthTrajectory, eulerTrajectory } = createTrajectories(
        startPos,
        engine.frame.state.numSteps
      );
      engine.frame.state.startPos = startPos;
      engine.frame.state.groundTruthTrajectory = groundTruthTrajectory;
      engine.frame.state.eulerTrajectory = eulerTrajectory;
      engine.renderOnce();
    },
    setTrajectoryStart(pos: Point2D): void {
      const { groundTruthTrajectory, eulerTrajectory } = createTrajectories(
        pos,
        engine.frame.state.numSteps
      );
      engine.frame.state.startPos = pos;
      engine.frame.state.groundTruthTrajectory = groundTruthTrajectory;
      engine.frame.state.eulerTrajectory = eulerTrajectory;
      engine.frame.clock.t = 0;
      engine.renderOnce();
    },
    setNumSteps(steps: number): void {
      engine.frame.state.numSteps = steps;
      engine.frame.state.eulerTrajectory = eulerMethodTrajectory(
        demoVectorField,
        steps,
        engine.frame.state.startPos
      );
      engine.renderOnce();
    },
    setShowGroundTruth(show: boolean): void {
      engine.frame.state.showGroundTruth = show;
      engine.renderOnce();
    },
    setShowEuler(show: boolean): void {
      engine.frame.state.showEuler = show;
      engine.renderOnce();
    }
  })
};


export function EulerMethodVisualization(): React.JSX.Element {
  const engine = useEngine<EulerMethodState, EulerMethodActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const thickLineRendererRef = useRef<ThickLineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const [showGroundTruth, setShowGroundTruth] = useState(engine.frame.state.showGroundTruth);
  const [showEuler, setShowEuler] = useState(engine.frame.state.showEuler);
  const [numSteps, setNumSteps] = useState(engine.frame.state.numSteps);
  const wasPlayingRef = useRef(false);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      if (lineRendererRef.current?.gl !== webGl.gl) {
        if (lineRendererRef.current) { lineRendererRef.current.destroy(); }
        lineRendererRef.current = createLineRenderer(webGl.gl);
      }
      const lineRenderer = lineRendererRef.current;

      if (thickLineRendererRef.current?.gl !== webGl.gl) {
        if (thickLineRendererRef.current) { thickLineRendererRef.current.destroy(); }
        thickLineRendererRef.current = createThickLineRenderer(webGl.gl);
      }
      const thickLineRenderer = thickLineRendererRef.current;

      if (pointRendererRef.current?.gl !== webGl.gl) {
        if (pointRendererRef.current) { pointRendererRef.current.destroy(); }
        pointRendererRef.current = createPointRenderer(webGl.gl);
      }
      const pointRenderer = pointRendererRef.current;

      clear(webGl);

      const vectorFieldTime = segmentStartTime(frame.clock.t, frame.state.numSteps);
      drawVectorField(
        lineRenderer,
        webGl.dataToClipMatrix,
        demoVectorFieldBatch,
        X_DOMAIN,
        Y_DOMAIN,
        vectorFieldTime,
        undefined,
        COLORS.vectorField
      );

      const { groundTruthTrajectory, eulerTrajectory, showGroundTruth, showEuler } = frame.state;

      // Draw ground truth trajectory (dimmer)
      if (showGroundTruth && groundTruthTrajectory.count > 0) {
        thickLineRenderer.renderThickTrajectories(
          webGl.dataToClipMatrix,
          groundTruthTrajectory,
          COLORS.trajectorySecondary,
          THICK_LINE_THICKNESS,
          1.0
        );
      }

      // Draw Euler trajectory (brighter)
      if (showEuler && eulerTrajectory.count > 0) {
        thickLineRenderer.renderThickTrajectories(
          webGl.dataToClipMatrix,
          eulerTrajectory,
          COLORS.point,
          THICK_LINE_THICKNESS,
          1.0
        );
      }

      // Draw current position dot (using Euler trajectory)
      if (eulerTrajectory.count > 0) {
        const currentPos = interpolateTrajectory(eulerTrajectory, 0, frame.clock.t);
        pointRenderer.render(
          webGl.dataToClipMatrix,
          {
            xs: new Float32Array([currentPos[0]]),
            ys: new Float32Array([currentPos[1]]),
            version: 0
          },
          COLORS.highlightPoint,
          DOT_SIZE
        );
      }
    });
  }, [engine]);

  const handleDragStart = (pos: Point2D): void => {
    wasPlayingRef.current = engine.frame.clock.playing;
    if (engine.frame.clock.playing) {
      engine.pause();
    }
    engine.actions.setTrajectoryStart(pos);
  };

  const handleDrag = (pos: Point2D): void => {
    engine.actions.setTrajectoryStart(pos);
  };

  const handleDragEnd = (): void => {
    if (wasPlayingRef.current) {
      engine.play();
    }
  };

  const handleShowGroundTruthChange = (checked: boolean): void => {
    setShowGroundTruth(checked);
    engine.actions.setShowGroundTruth(checked);
  };

  const handleShowEulerChange = (checked: boolean): void => {
    setShowEuler(checked);
    engine.actions.setShowEuler(checked);
  };

  const handleNumStepsChange = (value: number): void => {
    const steps = Math.round(value);
    setNumSteps(steps);
    engine.actions.setNumSteps(steps);
  };

  return (
    <>
      <ViewContainer>
        <PointerCanvas
          ref={pointerCanvasRef}
          onPositionChange={handleDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <ViewControls>
          <ViewControlsGroup>
            <Checkbox
              label="Trajectory"
              checked={showGroundTruth}
              onChange={handleShowGroundTruthChange}
            />
            <Checkbox
              label="Euler approximation"
              checked={showEuler}
              onChange={handleShowEulerChange}
            />
            <Slider
              label="Steps"
              value={numSteps}
              min={2}
              max={MAX_EULER_STEPS}
              step={1}
              onChange={handleNumStepsChange}
            />
            <SpeedControl />
          </ViewControlsGroup>
        </ViewControls>
      </ViewContainer>
      <TimelineControls />
    </>
  );
}

export function initEulerMethodVisualization(container: HTMLElement): () => void {
  const name = 'euler-method';
  return mountVisualization(
    container,
    <VisualizationProvider model={eulerMethodModel} name={name}>
      <EulerMethodVisualization />
    </VisualizationProvider>,
    { name }
  );
}
