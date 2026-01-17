import React, { useEffect, useRef, useState } from 'react';

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import {
  demoVectorField,
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import { fillWithSamplesFromStdGaussian } from '../math/gaussian';
import { eulerMaruyamaTrajectory } from '../math/vector-field';
import type { Point2D, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { Button } from './components/button';
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
import {
  createEulerMaruyamaMethodRenderer,
  type EulerMaruyamaMethodRenderer
} from './webgl/euler-maruyama-method';

interface EulerMaruyamaMethodState {
  startPos: Point2D;
  deterministicTrajectory: Trajectories;
  stochasticTrajectory: Trajectories;
  noises: Points2D;
  numSteps: number;
  sigma: number;
  showDeterministic: boolean;
  showStochastic: boolean;
}

export type { EulerMaruyamaMethodState };

interface EulerMaruyamaMethodActions {
  regenerate: () => void;
  regenerateNoise: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setNumSteps: (steps: number) => void;
  setSigma: (sigma: number) => void;
  setShowDeterministic: (show: boolean) => void;
  setShowStochastic: (show: boolean) => void;
}

export type { EulerMaruyamaMethodActions };

const DEFAULT_EULER_MARUYAMA_STEPS = 60;
const MAX_EULER_MARUYAMA_STEPS = 300;
const DEFAULT_SIGMA = 0.15;
const MAX_SIGMA = 2;

function createTrajectories(
  startPos: Point2D,
  numSteps: number,
  sigma: number,
  noises: Points2D
): {
  deterministicTrajectory: Trajectories;
  stochasticTrajectory: Trajectories;
} {
  return {
    deterministicTrajectory: demoVectorFieldTrajectory(startPos),
    stochasticTrajectory: eulerMaruyamaTrajectory(
      demoVectorField,
      numSteps,
      startPos,
      sigma,
      noises
    )
  };
}

function createGaussianSamples(count: number): Points2D {
  const points = makePoints2D(count);
  fillWithSamplesFromStdGaussian(points);
  return points;
}

export const eulerMaruyamaMethodModel: Model<
  EulerMaruyamaMethodState,
  EulerMaruyamaMethodActions
> = {
  initState: () => {
    const startPos = randomStartPos();
    const noises = createGaussianSamples(MAX_EULER_MARUYAMA_STEPS);
    const { deterministicTrajectory, stochasticTrajectory } = createTrajectories(
      startPos,
      DEFAULT_EULER_MARUYAMA_STEPS,
      DEFAULT_SIGMA,
      noises
    );
    return {
      startPos,
      deterministicTrajectory,
      stochasticTrajectory,
      noises,
      numSteps: DEFAULT_EULER_MARUYAMA_STEPS,
      sigma: DEFAULT_SIGMA,
      showDeterministic: true,
      showStochastic: true
    };
  },

  actions: (engine): EulerMaruyamaMethodActions => ({
    regenerate(): void {
      const startPos = randomStartPos();
      const { deterministicTrajectory, stochasticTrajectory } = createTrajectories(
        startPos,
        engine.frame.state.numSteps,
        engine.frame.state.sigma,
        engine.frame.state.noises
      );
      engine.frame.state.startPos = startPos;
      engine.frame.state.deterministicTrajectory = deterministicTrajectory;
      engine.frame.state.stochasticTrajectory = stochasticTrajectory;
      engine.renderOnce();
    },
    regenerateNoise(): void {
      fillWithSamplesFromStdGaussian(engine.frame.state.noises);
      engine.frame.state.stochasticTrajectory = eulerMaruyamaTrajectory(
        demoVectorField,
        engine.frame.state.numSteps,
        engine.frame.state.startPos,
        engine.frame.state.sigma,
        engine.frame.state.noises
      );
      engine.renderOnce();
    },
    setTrajectoryStart(pos: Point2D): void {
      const { deterministicTrajectory, stochasticTrajectory } = createTrajectories(
        pos,
        engine.frame.state.numSteps,
        engine.frame.state.sigma,
        engine.frame.state.noises
      );
      engine.frame.state.startPos = pos;
      engine.frame.state.deterministicTrajectory = deterministicTrajectory;
      engine.frame.state.stochasticTrajectory = stochasticTrajectory;
      engine.frame.clock.t = 0;
      engine.renderOnce();
    },
    setNumSteps(steps: number): void {
      engine.frame.state.numSteps = steps;
      engine.frame.state.stochasticTrajectory = eulerMaruyamaTrajectory(
        demoVectorField,
        steps,
        engine.frame.state.startPos,
        engine.frame.state.sigma,
        engine.frame.state.noises
      );
      engine.renderOnce();
    },
    setSigma(sigma: number): void {
      engine.frame.state.sigma = sigma;
      engine.frame.state.stochasticTrajectory = eulerMaruyamaTrajectory(
        demoVectorField,
        engine.frame.state.numSteps,
        engine.frame.state.startPos,
        sigma,
        engine.frame.state.noises
      );
      engine.renderOnce();
    },
    setShowDeterministic(show: boolean): void {
      engine.frame.state.showDeterministic = show;
      engine.renderOnce();
    },
    setShowStochastic(show: boolean): void {
      engine.frame.state.showStochastic = show;
      engine.renderOnce();
    }
  })
};

const eulerMaruyamaViewExporter = {
  name: 'frames',
  createRenderer: createEulerMaruyamaMethodRenderer,
  configureRenderer: (): void => { /* no configuration needed */ }
};

function createFrame(
  t: number,
  state: EulerMaruyamaMethodState
): Frame<EulerMaruyamaMethodState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

function EulerMaruyamaMethodFrameExporter(): React.ReactElement {
  const engine = useEngine<EulerMaruyamaMethodState, EulerMaruyamaMethodActions>();

  return (
    <FrameExporter<EulerMaruyamaMethodState>
      view={eulerMaruyamaViewExporter}
      state={engine.frame.state}
      createFrame={createFrame}
    />
  );
}

interface EulerMaruyamaMethodVisualizationProps {
  withTimeline?: boolean;
}

export function EulerMaruyamaMethodVisualization(
  { withTimeline = true }: EulerMaruyamaMethodVisualizationProps
): React.JSX.Element {
  const engine = useEngine<EulerMaruyamaMethodState, EulerMaruyamaMethodActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const rendererRef = useRef<EulerMaruyamaMethodRenderer | null>(null);

  const [showDeterministic, setShowDeterministic] = useState(
    engine.frame.state.showDeterministic
  );
  const [showStochastic, setShowStochastic] = useState(
    engine.frame.state.showStochastic
  );
  const [numSteps, setNumSteps] = useState(engine.frame.state.numSteps);
  const [sigma, setSigma] = useState(engine.frame.state.sigma);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createEulerMaruyamaMethodRenderer(webGl.gl);
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

  const handleShowDeterministicChange = (checked: boolean): void => {
    setShowDeterministic(checked);
    engine.actions.setShowDeterministic(checked);
  };

  const handleShowStochasticChange = (checked: boolean): void => {
    setShowStochastic(checked);
    engine.actions.setShowStochastic(checked);
  };

  const handleNumStepsChange = (value: number): void => {
    const steps = Math.round(value);
    setNumSteps(steps);
    engine.actions.setNumSteps(steps);
  };

  const handleSigmaChange = (value: number): void => {
    setSigma(value);
    engine.actions.setSigma(value);
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
              label="Deterministic"
              checked={showDeterministic}
              onChange={handleShowDeterministicChange}
            />
            <Checkbox
              label="Stochastic"
              checked={showStochastic}
              onChange={handleShowStochasticChange}
            />
            <Button onClick={() => { engine.actions.regenerateNoise(); }}>
              Resample noise
            </Button>
            <Slider
              label="Steps"
              value={numSteps}
              min={10}
              max={MAX_EULER_MARUYAMA_STEPS}
              step={5}
              onChange={handleNumStepsChange}
            />
            <Slider
              label="Sigma"
              value={sigma}
              min={0.01}
              max={MAX_SIGMA}
              step={0.01}
              onChange={handleSigmaChange}
              formatValue={(v): string => v.toFixed(2)}
            />
            <SpeedControl />
            {showAdditionalControls ? (
              <EulerMaruyamaMethodFrameExporter />
            ) : null}
            <EllipsisToggle
              expanded={showAdditionalControls}
              onToggle={() => { setShowAdditionalControls((current) => !current); }}
            />
          </ViewControlsGroup>
        </ViewControls>
      </ViewContainer>
      {withTimeline ? <TimelineControls /> : null}
    </>
  );
}

export function initEulerMaruyamaMethodVisualization(container: HTMLElement): () => void {
  const name = 'euler-maruyama-method';
  return mountVisualization(
    container,
    <VisualizationProvider model={eulerMaruyamaMethodModel} name={name}>
      <EulerMaruyamaMethodVisualization />
    </VisualizationProvider>,
    { name }
  );
}
