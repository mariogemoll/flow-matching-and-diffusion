import React from 'react';

import { MultiViewFrameExporter } from '../components/multi-view-frame-exporter';
import { type Frame, useEngine } from '../engine';
import type { MargPathActions, MargPathState } from './index';
import {
  margOdeViewExporter,
  margPathViewExporter,
  margSdeViewExporter
} from './view-exporters';

const views = [margPathViewExporter, margOdeViewExporter, margSdeViewExporter];

function createFrame(t: number, state: MargPathState): Frame<MargPathState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

export function MarginalFrameExporter(): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  return (
    <MultiViewFrameExporter
      views={views}
      state={engine.frame.state}
      createFrame={createFrame}
    />
  );
}
