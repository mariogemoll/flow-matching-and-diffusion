import React, { useEffect, useRef, useState } from 'react';

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import {
  demoVectorField,
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import { eulerMethodTrajectory } from '../math/vector-field';
import type { Point2D, Trajectories } from '../types';
import { Checkbox } from './components/checkbox';
import { EllipsisToggle } from './components/ellipsis-toggle';
import { FrameExporter } from './components/frame-exporter';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { Slider } from './components/slider';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { type Frame, type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { createEulerMethodRenderer, type EulerMethodRenderer } from './webgl/euler-method';

interface EulerMethodState {
  startPos: Point2D;
  groundTruthTrajectory: Trajectories;
  eulerTrajectory: Trajectories;
  numSteps: number;
  showGroundTruth: boolean;
  showEuler: boolean;
}

export type { EulerMethodState };

interface EulerMethodActions {
  regenerate: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setNumSteps: (steps: number) => void;
  setShowGroundTruth: (show: boolean) => void;
  setShowEuler: (show: boolean) => void;
}

export type { EulerMethodActions };

const DEFAULT_EULER_STEPS = 10;
const MAX_EULER_STEPS = 50;


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


const eulerMethodViewExporter = {
  name: 'frames',
  createRenderer: createEulerMethodRenderer,
  configureRenderer: (): void => { /* no configuration needed */ }
};

function createFrame(t: number, state: EulerMethodState): Frame<EulerMethodState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

function EulerMethodFrameExporter(): React.ReactElement {
  const engine = useEngine<EulerMethodState, EulerMethodActions>();

  return (
    <FrameExporter<EulerMethodState>
      view={eulerMethodViewExporter}
      state={engine.frame.state}
      createFrame={createFrame}
    />
  );
}

export function EulerMethodVisualization(): React.JSX.Element {
  const engine = useEngine<EulerMethodState, EulerMethodActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const rendererRef = useRef<EulerMethodRenderer | null>(null);

  const [showGroundTruth, setShowGroundTruth] = useState(engine.frame.state.showGroundTruth);
  const [showEuler, setShowEuler] = useState(engine.frame.state.showEuler);
  const [numSteps, setNumSteps] = useState(engine.frame.state.numSteps);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);
  const wasPlayingRef = useRef(false);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createEulerMethodRenderer(webGl.gl);
      const renderer = rendererRef.current;

      renderer.update(frame);
      clear(webGl);
      renderer.render(webGl);
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
          xDomain={X_DOMAIN}
          yDomain={Y_DOMAIN}
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
            {showAdditionalControls ? (
              <EulerMethodFrameExporter />
            ) : null}
            <EllipsisToggle
              expanded={showAdditionalControls}
              onToggle={() => { setShowAdditionalControls((current) => !current); }}
            />
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
