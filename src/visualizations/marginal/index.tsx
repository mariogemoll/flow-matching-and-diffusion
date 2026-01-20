// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { makeRandomGmm } from '../../math/gmm';
import { type AlphaBetaScheduleName } from '../../math/schedules/alpha-beta';
import { type SigmaScheduleName } from '../../math/schedules/sigma';
import type { GaussianComponent } from '../../types';
import { ProbPathVisualizationControls } from '../components/prob-path-visualization-controls';
import { TimelineControls } from '../components/timeline-controls';
import {
  DEFAULT_ALPHA_BETA_SCHEDULE,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE,
  NUM_SAMPLES
} from '../constants';
import { type Model } from '../engine';
import { VisualizationProvider } from '../provider';
import { MarginalFrameExporter } from './frame-exporter';

export interface MargPathViewConfig {
  showPdf: boolean;
  showSamples: boolean;
  sampleFrequency: number;
}

export interface MargOdeViewConfig {
  showTrajectories: boolean;
  showVectorField: boolean;
  showSamples: boolean;
}

export interface MargSdeViewConfig {
  showTrajectories: boolean;
  showSamples: boolean;
  sigmaSchedule: SigmaScheduleName;
  sdeNumSteps: number;
  maxSigma: number;
}

export interface MargPathState {
  components: GaussianComponent[];
  schedule: AlphaBetaScheduleName;
  numSamples: number;
  editMode: boolean;
  wasPlayingBeforeEdit: boolean;
  pathConfig: MargPathViewConfig;
  odeConfig: MargOdeViewConfig;
  sdeConfig: MargSdeViewConfig;
}

export interface MargPathActions {
  setSchedule: (s: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
  setComponents: (components: GaussianComponent[]) => void;
  randomizeComponents: () => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
  setPathConfig: (config: Partial<MargPathViewConfig>) => void;
  setOdeConfig: (config: Partial<MargOdeViewConfig>) => void;
  setSdeConfig: (config: Partial<MargSdeViewConfig>) => void;
}

function createInitialState(): MargPathState {
  return {
    components: makeRandomGmm(3).components,
    schedule: DEFAULT_ALPHA_BETA_SCHEDULE,
    numSamples: NUM_SAMPLES,
    editMode: false,
    wasPlayingBeforeEdit: false,
    pathConfig: {
      showPdf: true,
      showSamples: true,
      sampleFrequency: 15
    },
    odeConfig: {
      showTrajectories: true,
      showVectorField: false,
      showSamples: true
    },
    sdeConfig: {
      showTrajectories: true,
      showSamples: true,
      sigmaSchedule: DEFAULT_SIGMA_SCHEDULE,
      sdeNumSteps: DEFAULT_NUM_SDE_STEPS,
      maxSigma: DEFAULT_MAX_SIGMA
    }
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
    },
    setPathConfig(config): void {
      Object.assign(engine.frame.state.pathConfig, config);
      engine.renderOnce();
    },
    setOdeConfig(config): void {
      Object.assign(engine.frame.state.odeConfig, config);
      engine.renderOnce();
    },
    setSdeConfig(config): void {
      Object.assign(engine.frame.state.sdeConfig, config);
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
      <ProbPathVisualizationControls>
        <MarginalFrameExporter />
      </ProbPathVisualizationControls>
      <TimelineControls />
    </VisualizationProvider>
  );
}
