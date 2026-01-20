// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import {
  MAX_NUM_TRAJECTORY_STEPS,
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../constants';
import { brownianMotionTrajectory } from '../math/brownian-motion';
import { fillWithSamplesFromStdGaussian } from '../math/gaussian';
import type { Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { makeTrajectories } from '../util/trajectories';
import { type WebGl } from '../webgl';
import { Checkbox } from './components/checkbox';
import { EllipsisToggle } from './components/ellipsis-toggle';
import { FrameExporter } from './components/frame-exporter';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { NumStepsSlider } from './components/num-steps-slider';
import { Slider } from './components/slider';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { WebGlCanvas } from './components/webgl-canvas';
import { type Frame, type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { type BrownianMotionRenderer, createBrownianMotionRenderer } from './webgl/brownian-motion';

interface BrownianMotionState {
  trajectory: Trajectories;
  randomnessPool: Points2D;
  numSteps: number;
  lastT: number;
  resampleOnLoop: boolean;
  zoom: number;
}

export type { BrownianMotionState };

interface BrownianMotionActions {
  setNumSteps: (steps: number) => void;
  setResampleOnLoop: (resample: boolean) => void;
  setZoom: (zoom: number) => void;
}

export type { BrownianMotionActions };



export const brownianMotionModel: Model<BrownianMotionState, BrownianMotionActions> = {
  initState: () => {
    const randomnessPool = makePoints2D(MAX_NUM_TRAJECTORY_STEPS);
    fillWithSamplesFromStdGaussian(randomnessPool);

    const trajectory = makeTrajectories(NUM_TRAJECTORY_STEPS + 1, 1);
    brownianMotionTrajectory(randomnessPool, NUM_TRAJECTORY_STEPS, trajectory);

    return {
      trajectory,
      randomnessPool,
      numSteps: NUM_TRAJECTORY_STEPS,
      lastT: 0,
      resampleOnLoop: true,
      zoom: 2.0
    };
  },

  tick: ({ frame }) => {
    if (frame.clock.t < frame.state.lastT && !frame.clock.scrubbing && frame.state.resampleOnLoop) {
      // Time looped - regenerate randomness pool if resampleOnLoop is enabled
      fillWithSamplesFromStdGaussian(frame.state.randomnessPool);
      brownianMotionTrajectory(
        frame.state.randomnessPool,
        frame.state.numSteps,
        frame.state.trajectory
      );
    }
    frame.state.lastT = frame.clock.t;
  },

  actions: (engine) => ({
    setNumSteps(steps: number): void {
      engine.frame.state.numSteps = steps;
      engine.frame.state.trajectory = makeTrajectories(steps + 1, 1);
      brownianMotionTrajectory(
        engine.frame.state.randomnessPool,
        steps,
        engine.frame.state.trajectory
      );
      engine.renderOnce();
    },
    setResampleOnLoop(resample: boolean): void {
      engine.frame.state.resampleOnLoop = resample;
    },
    setZoom(zoom: number): void {
      engine.frame.state.zoom = zoom;
      engine.renderOnce();
    }
  })
};

const brownianMotionViewExporter = {
  name: 'frames',
  createRenderer: createBrownianMotionRenderer,
  configureRenderer: (): void => { /* no configuration needed */ }
};

function createFrame(t: number, state: BrownianMotionState): Frame<BrownianMotionState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

function BrownianMotionFrameExporter(): React.ReactElement {
  const engine = useEngine<BrownianMotionState, BrownianMotionActions>();
  const zoom = engine.frame.state.zoom;
  const xDomain: [number, number] = [X_DOMAIN[0] / zoom, X_DOMAIN[1] / zoom];
  const yDomain: [number, number] = [Y_DOMAIN[0] / zoom, Y_DOMAIN[1] / zoom];

  return (
    <FrameExporter<BrownianMotionState>
      view={brownianMotionViewExporter}
      state={engine.frame.state}
      createFrame={createFrame}
      xDomain={xDomain}
      yDomain={yDomain}
    />
  );
}

export function BrownianMotionVisualization(): React.JSX.Element {
  const engine = useEngine<BrownianMotionState, BrownianMotionActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<BrownianMotionRenderer | null>(null);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);
  const [numSteps, setNumSteps] = useState(engine.frame.state.numSteps);
  const [zoom, setZoom] = useState(engine.frame.state.zoom);
  const [resampleOnLoop, setResampleOnLoop] = useState(engine.frame.state.resampleOnLoop);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      rendererRef.current ??= createBrownianMotionRenderer(webGl.gl);
      const renderer = rendererRef.current;

      renderer.update(frame);
      clear(webGl);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleNumStepsChange = (value: number): void => {
    const steps = Math.round(value);
    setNumSteps(steps);
    engine.actions.setNumSteps(steps);
  };

  const handleZoomChange = (value: number): void => {
    setZoom(value);
    engine.actions.setZoom(value);
  };

  const handleResampleOnLoopChange = (checked: boolean): void => {
    setResampleOnLoop(checked);
    engine.actions.setResampleOnLoop(checked);
  };

  // Calculate zoomed domains centered on origin
  const xDomain: [number, number] = [X_DOMAIN[0] / zoom, X_DOMAIN[1] / zoom];
  const yDomain: [number, number] = [Y_DOMAIN[0] / zoom, Y_DOMAIN[1] / zoom];

  return (
    <>
      <ViewContainer>
        <WebGlCanvas className="view" webGlRef={webGlRef} xDomain={xDomain} yDomain={yDomain} />
        <ViewControls>
          <ViewControlsGroup>
            <NumStepsSlider
              value={numSteps}
              min={1}
              max={300}
              onChange={handleNumStepsChange}
              className="viz-slider-wide"
            />
            {showAdditionalControls ? (
              <>
                <Checkbox
                  label="Resample on loop"
                  checked={resampleOnLoop}
                  onChange={handleResampleOnLoopChange}
                />
                <Slider
                  label="Zoom"
                  value={zoom}
                  min={0.5}
                  max={4}
                  step={0.1}
                  onChange={handleZoomChange}
                  formatValue={(v) => `${v.toFixed(1)}x`}
                />
                <SpeedControl />
                <BrownianMotionFrameExporter />
              </>
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

export function initBrownianMotionVisualization(container: HTMLElement): () => void {
  const name = 'brownian-motion';
  return mountVisualization(
    container,
    <VisualizationProvider model={brownianMotionModel} name={name}>
      <BrownianMotionVisualization />
    </VisualizationProvider>,
    { name }
  );
}
