import React from 'react';

import { makeRandomGmm } from '../../math/gmm';
import { type AlphaBetaScheduleName } from '../../math/schedules/alpha-beta';
import type { GaussianComponent } from '../../types';
import { ProbPathVisualizationControls } from '../components/prob-path-visualization-controls';
import { TimelineControls } from '../components/timeline-controls';
import { NUM_SAMPLES } from '../constants';
import { type Model } from '../engine';
import { VisualizationProvider } from '../provider';

export interface MargPathState {
  components: GaussianComponent[];
  schedule: AlphaBetaScheduleName;
  numSamples: number;
}

export interface MargPathActions {
  setSchedule: (s: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
  setComponents: (components: GaussianComponent[]) => void;
  randomizeComponents: () => void;
}

function createInitialState(): MargPathState {
  return {
    components: makeRandomGmm(3).components,
    schedule: 'linear',
    numSamples: NUM_SAMPLES
  };
}

export const marginalPathModel: Model<MargPathState, MargPathActions> = {
  initState: createInitialState,
  actions: (engine): MargPathActions => ({
    setSchedule(s): void {
      engine.frame.state.schedule = s;
      engine.renderOnce();
    },
    setNumSamples(n): void {
      engine.frame.state.numSamples = n;
      engine.renderOnce();
    },
    setComponents(components): void {
      engine.frame.state.components = components;
      engine.renderOnce();
    },
    randomizeComponents(): void {
      engine.frame.state.components = makeRandomGmm(3).components;
      engine.renderOnce();
    }
  })
};

export function MarginalPathVisualization({
  name,
  children
}: {
  name?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <VisualizationProvider model={marginalPathModel} name={name}>
      <div className="row">
        {children}
      </div>
      <ProbPathVisualizationControls />
      <TimelineControls />
    </VisualizationProvider>
  );
}
