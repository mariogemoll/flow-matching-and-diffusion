import React, { useEffect, useRef, useState } from 'react';

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import {
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import type { Point2D, Trajectories } from '../types';
import { Checkbox } from './components/checkbox';
import { EllipsisToggle } from './components/ellipsis-toggle';
import { FrameExporter } from './components/frame-exporter';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { type Frame, type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { createVectorFieldRenderer, type VectorFieldRenderer } from './webgl/vector-field';

interface VectorFieldState {
  trajectory: Trajectories;
  showTrajectory: boolean;
}

export type { VectorFieldState };

interface VectorFieldActions {
  regenerate: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setShowTrajectory: (show: boolean) => void;
}

export type { VectorFieldActions };


export const vectorFieldModel: Model<VectorFieldState, VectorFieldActions> = {
  initState: () => ({
    trajectory: demoVectorFieldTrajectory(randomStartPos()),
    showTrajectory: true
  }),

  actions: (engine): VectorFieldActions => ({
    regenerate(): void {
      engine.frame.state.trajectory = demoVectorFieldTrajectory(randomStartPos());
      engine.renderOnce();
    },
    setTrajectoryStart(pos: Point2D): void {
      engine.frame.state.trajectory = demoVectorFieldTrajectory(pos);
      engine.frame.clock.t = 0;
      engine.renderOnce();
    },
    setShowTrajectory(show: boolean): void {
      engine.frame.state.showTrajectory = show;
      engine.renderOnce();
    }
  })
};


const vectorFieldViewExporter = {
  name: 'frames',
  createRenderer: createVectorFieldRenderer,
  configureRenderer: (): void => { /* no configuration needed */ }
};

function createFrame(t: number, state: VectorFieldState): Frame<VectorFieldState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

function VectorFieldFrameExporter(): React.ReactElement {
  const engine = useEngine<VectorFieldState, VectorFieldActions>();

  return (
    <FrameExporter<VectorFieldState>
      view={vectorFieldViewExporter}
      state={engine.frame.state}
      createFrame={createFrame}
    />
  );
}

export function VectorFieldVisualization(): React.JSX.Element {
  const engine = useEngine<VectorFieldState, VectorFieldActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const rendererRef = useRef<VectorFieldRenderer | null>(null);

  const [showTrajectory, setShowTrajectory] = useState(engine.frame.state.showTrajectory);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);
  const wasPlayingRef = useRef(false);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createVectorFieldRenderer(webGl.gl);
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

  const handleShowTrajectoryChange = (checked: boolean): void => {
    setShowTrajectory(checked);
    engine.actions.setShowTrajectory(checked);
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
              checked={showTrajectory}
              onChange={handleShowTrajectoryChange}
            />
            <SpeedControl />
            {showAdditionalControls ? (
              <VectorFieldFrameExporter />
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


export function initVectorFieldVisualization(container: HTMLElement): () => void {
  const name = 'vector';
  return mountVisualization(
    container,
    <VisualizationProvider model={vectorFieldModel} name={name}>
      <VectorFieldVisualization />
    </VisualizationProvider>,
    { name }
  );
}
