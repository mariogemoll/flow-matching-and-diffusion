import React, { useEffect, useRef, useState } from 'react';

import {
  demoVectorFieldBatch,
  demoVectorFieldTrajectory,
  randomStartPos
} from '../math/demo-vector-field';
import { type Point2D, type Trajectories } from '../types';
import { interpolateTrajectory } from '../util/trajectories';
import { createLineRenderer, type LineRenderer } from '../webgl/renderers/line';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { createThickLineRenderer, type ThickLineRenderer } from '../webgl/renderers/thick-line';
import { Checkbox } from './components/checkbox';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { PointerCanvas, type PointerCanvasHandle } from './components/pointer-canvas';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { COLORS, DOT_SIZE, THICK_LINE_THICKNESS, X_DOMAIN, Y_DOMAIN } from './constants';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { drawVectorField } from './webgl/vector-field';


export interface VectorFieldState {
  trajectory: Trajectories;
  showTrajectory: boolean;
}

export interface VectorFieldActions {
  regenerate: () => void;
  setTrajectoryStart: (pos: Point2D) => void;
  setShowTrajectory: (show: boolean) => void;
}


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


export function VectorFieldVisualization(): React.JSX.Element {
  const engine = useEngine<VectorFieldState, VectorFieldActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);
  const lineRendererRef = useRef<LineRenderer | null>(null);
  const thickLineRendererRef = useRef<ThickLineRenderer | null>(null);
  const pointRendererRef = useRef<PointRenderer | null>(null);
  const [showTrajectory, setShowTrajectory] = useState(engine.frame.state.showTrajectory);
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

      const { trajectory, showTrajectory } = frame.state;
      if (trajectory.count === 0) { return; }

      if (showTrajectory) {
        thickLineRenderer.renderThickTrajectories(
          webGl.dataToClipMatrix,
          trajectory,
          COLORS.singleTrajectory,
          THICK_LINE_THICKNESS,
          1.0 // Show full trajectory
        );
      }
      const currentPos = interpolateTrajectory(trajectory, 0, frame.clock.t);
      pointRenderer.render(
        webGl.dataToClipMatrix,
        {
          xs: new Float32Array([currentPos[0]]),
          ys: new Float32Array([currentPos[1]]),
          version: 0
        },
        COLORS.highlightPoint, // Use highlight color for the dot
        DOT_SIZE
      );

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
        />
        <ViewControls>
          <ViewControlsGroup>
            <Checkbox
              label="Trajectory"
              checked={showTrajectory}
              onChange={handleShowTrajectoryChange}
            />
            <SpeedControl />
          </ViewControlsGroup>
        </ViewControls>
      </ViewContainer>
      <TimelineControls />
    </>
  );
}

/* ------------------------------ Mount Function ------------------------------ */

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
