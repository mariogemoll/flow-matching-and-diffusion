import React from 'react';

import { type AlphaBetaScheduleName } from '../../math/schedules/alpha-beta';
import { type Point2D } from '../../types';
import { TimelineControls } from '../components/timeline-controls';
import { type Model } from '../engine';
import { VisualizationProvider } from '../provider';


export interface CondPathParams {
  z: Point2D;
  schedule: AlphaBetaScheduleName;
  numSamples: number;
}

export interface CondPathActions {
  setZ: (z: Point2D) => void;
  setSchedule: (schedule: AlphaBetaScheduleName) => void;
  setNumSamples: (n: number) => void;
}

export const condPathModel: Model<CondPathParams, CondPathActions> = {
  initState: (): CondPathParams => ({
    z: [0, 0],
    schedule: 'linear',
    numSamples: 1000
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
    }
  })
};

import { ProbPathVisualizationControls } from '../components/prob-path-visualization-controls';

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
      <ProbPathVisualizationControls />
      <TimelineControls />
    </VisualizationProvider>
  );
}

export { CondPathView } from './views/path';
