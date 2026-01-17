import React from 'react';

import { type AlphaBetaScheduleName } from '../../math/schedules/alpha-beta';
import { type SigmaScheduleName } from '../../math/schedules/sigma';
import { type Point2D } from '../../types';
import { randomPosition } from '../../util/misc';
import { ProbPathVisualizationControls } from '../components/prob-path-visualization-controls';
import { TimelineControls } from '../components/timeline-controls';
import {
  DEFAULT_ALPHA_BETA_SCHEDULE,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE
} from '../constants';
import { type Model } from '../engine';
import { VisualizationProvider } from '../provider';
import { ConditionalFrameExporter } from './frame-exporter';

export interface CondPathViewConfig {
  sampleFrequency: number;
}

export interface CondOdeViewConfig {
  showTrajectories: boolean;
  showVectorField: boolean;
  showSamples: boolean;
}

export interface CondSdeViewConfig {
  showTrajectories: boolean;
  showSamples: boolean;
  sigmaSchedule: SigmaScheduleName;
  sdeNumSteps: number;
  maxSigma: number;
}

export interface CondPathState {
  z: Point2D;
  schedule: AlphaBetaScheduleName;
  numSamples: number;
  pathConfig: CondPathViewConfig;
  odeConfig: CondOdeViewConfig;
  sdeConfig: CondSdeViewConfig;
}

export interface CondPathActions {
  setZ: (z: Point2D) => void;
  setSchedule: (schedule: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
  setPathConfig: (config: Partial<CondPathViewConfig>) => void;
  setOdeConfig: (config: Partial<CondOdeViewConfig>) => void;
  setSdeConfig: (config: Partial<CondSdeViewConfig>) => void;
}

export const condPathModel: Model<CondPathState, CondPathActions> = {
  initState: (): CondPathState => ({
    z: randomPosition(),
    schedule: DEFAULT_ALPHA_BETA_SCHEDULE,
    numSamples: 1000,
    pathConfig: {
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
  }),
  actions: (engine): CondPathActions => ({
    setZ(z: Point2D): void {
      engine.frame.state.z = z;
      engine.renderOnce();
    },
    setSchedule(schedule: AlphaBetaScheduleName): void {
      engine.frame.state.schedule = schedule;
      engine.renderOnce();
    },
    setNumSamples(n: number): void {
      engine.frame.state.numSamples = n;
      engine.renderOnce();
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


export function CondPathVisualization({
  name,
  children
}: {
  name?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <VisualizationProvider model={condPathModel} name={name}>
      <div className="row">
        {children}
      </div>
      <ProbPathVisualizationControls>
        <ConditionalFrameExporter />
      </ProbPathVisualizationControls>
      <TimelineControls />
    </VisualizationProvider>
  );
}
