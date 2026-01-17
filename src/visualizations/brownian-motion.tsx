import React, { useEffect, useRef } from 'react';

import {
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../constants';
import { brownianMotionTrajectory } from '../math/brownian-motion';
import type { Trajectories } from '../types';
import { makeTrajectories } from '../util/trajectories';
import { type WebGl } from '../webgl';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { SpeedControl } from './components/speed-control';
import { TimelineControls } from './components/timeline-controls';
import { WebGlCanvas } from './components/webgl-canvas';
import { type Model, useEngine } from './engine';
import { VisualizationProvider } from './provider';
import { mountVisualization } from './react-root';
import { clear } from './webgl';
import { type BrownianMotionRenderer, createBrownianMotionRenderer } from './webgl/brownian-motion';

interface BrownianMotionState {
  trajectory: Trajectories;
  lastT: number;
}

export type { BrownianMotionState };

type BrownianMotionActions = Record<string, never>;

export type { BrownianMotionActions };



export const brownianMotionModel: Model<BrownianMotionState, BrownianMotionActions> = {
  initState: () => {
    const trajectory = makeTrajectories(NUM_TRAJECTORY_STEPS + 1, 1);
    brownianMotionTrajectory(trajectory);
    return { trajectory, lastT: 0 };
  },

  tick: ({ frame }) => {
    if (frame.clock.t < frame.state.lastT) {
      brownianMotionTrajectory(frame.state.trajectory);
    }
    frame.state.lastT = frame.clock.t;
  },

  actions: () => ({})
};

export function BrownianMotionVisualization(): React.JSX.Element {
  const engine = useEngine<BrownianMotionState, BrownianMotionActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<BrownianMotionRenderer | null>(null);

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

  return (
    <>
      <ViewContainer>
        <WebGlCanvas className="view" webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />
        <ViewControls>
          <ViewControlsGroup>
            <SpeedControl />
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
