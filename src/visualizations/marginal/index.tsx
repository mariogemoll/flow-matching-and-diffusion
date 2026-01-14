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
  editMode: boolean;
  wasPlayingBeforeEdit: boolean;
}

export interface MargPathActions {
  setSchedule: (s: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
  setComponents: (components: GaussianComponent[]) => void;
  randomizeComponents: () => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
}

function createInitialState(): MargPathState {
  return {
    components: makeRandomGmm(3).components,
    schedule: 'linear',
    numSamples: NUM_SAMPLES,
    editMode: false,
    wasPlayingBeforeEdit: false
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
    },
    enterEditMode(): void {
      const { state, clock } = engine.frame;
      state.wasPlayingBeforeEdit = clock.playing;
      state.editMode = true;
      clock.t = 1; // Set t before pause to avoid auto-exit trigger
      engine.pause();
    },
    exitEditMode(): void {
      const { state } = engine.frame;
      const wasPlaying = state.wasPlayingBeforeEdit;
      state.editMode = false;
      state.wasPlayingBeforeEdit = false;
      if (wasPlaying) {
        engine.setTime(0);
        engine.play();
      } else {
        engine.renderOnce();
      }
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
