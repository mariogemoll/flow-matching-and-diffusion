import React from 'react';

import { type Point2D } from '../../types';
import { TimelineControls } from '../components/timeline-controls';
import { type Model } from '../engine';
import { VisualizationProvider } from '../provider';


export interface CondPathParams {
  z: Point2D;
}

export interface CondPathActions {
  setZ: (z: Point2D) => void;
}

export const condPathModel: Model<CondPathParams, CondPathActions> = {
  initState: (): CondPathParams => ({
    z: [0, 0]
  }),
  actions: (engine): CondPathActions => ({
    setZ(z: Point2D): void {
      engine.frame.state.z = z;
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
      {children}
      <TimelineControls />
    </VisualizationProvider>
  );
}

export { CondPathView } from './views/path';
