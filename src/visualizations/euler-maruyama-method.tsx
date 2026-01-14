import React, { useEffect, useRef, useState } from 'react';

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import {
  demoVectorField,
  demoVectorFieldBatch,
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import { fillWithSamplesFromStdGaussian } from '../math/gaussian';
import { eulerMaruyamaTrajectory } from '../math/vector-field';
import type { Point2D, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { interpolateTrajectory } from '../util/trajectories';
import { createLineRenderer, type LineRenderer } from '../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { createThickLineRenderer, type ThickLineRenderer } from '../webgl/renderers/thick-line';
import { Button } from './components/button';
import { Checkbox } from './components/checkbox';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { Slider } from './components/slider';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { COLORS, DOT_SIZE, THICK_LINE_THICKNESS } from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { drawVectorField } from './webgl/vector-field';

const DEFAULT_EULER_MARUYAMA_STEPS = 60;
const MAX_EULER_MARUYAMA_STEPS = 300;
const DEFAULT_SIGMA = 0.15;
const MAX_SIGMA = 2;

export interface EulerMaruyamaMethodState {
  startPos: Point2D;
  deterministicTrajectory: Trajectories;
  stochasticTrajectory: Trajectories;
  noises: Points2D;
  numSteps: number;
  sigma: number;
  showDeterministic: boolean;
  showStochastic: boolean;
}

export interface EulerMaruyamaMethodActions {
  regenerate: () => void;
  regenerateNoise: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setNumSteps: (steps: number) => void;
  setSigma: (sigma: number) => void;
  setShowDeterministic: (show: boolean) => void;
  setShowStochastic: (show: boolean) => void;
}

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

interface EulerMaruyamaMethodVisualizationProps {
  withTimeline?: boolean;
}

export function EulerMaruyamaMethodVisualization(
  { withTimeline = true }: EulerMaruyamaMethodVisualizationProps
): React.JSX.Element {
  const engine = useEngine<EulerMaruyamaMethodState, EulerMaruyamaMethodActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const thickLineRendererRef = useRef<ThickLineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const [showDeterministic, setShowDeterministic] = useState(
    engine.frame.state.showDeterministic
  );
  const [showStochastic, setShowStochastic] = useState(
    engine.frame.state.showStochastic
  );
  const [numSteps, setNumSteps] = useState(engine.frame.state.numSteps);
  const [sigma, setSigma] = useState(engine.frame.state.sigma);
  const wasPlayingRef = useRef(false);

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
      drawVectorField(
        lineRenderer,
        webGl.dataToClipMatrix,
        demoVectorFieldBatch,
        X_DOMAIN,
        Y_DOMAIN,
        frame.clock.t,
        undefined,
        COLORS.vectorField
      );

      const {
        deterministicTrajectory,
        stochasticTrajectory,
        showDeterministic,
        showStochastic
      } = frame.state;

      if (showDeterministic && deterministicTrajectory.count > 0) {
        thickLineRenderer.renderThickTrajectories(
          webGl.dataToClipMatrix,
          deterministicTrajectory,
          COLORS.singleTrajectorySecondary,
          THICK_LINE_THICKNESS,
          1.0
        );
      }

      if (showStochastic && stochasticTrajectory.count > 0) {
        thickLineRenderer.renderThickTrajectories(
          webGl.dataToClipMatrix,
          stochasticTrajectory,
          COLORS.singleTrajectory,
          THICK_LINE_THICKNESS,
          1.0
        );
      }

      if (stochasticTrajectory.count > 0) {
        const currentPos = interpolateTrajectory(stochasticTrajectory, 0, frame.clock.t);
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
