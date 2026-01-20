// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { MultiViewFrameExporter } from '../components/multi-view-frame-exporter';
import { type Frame, useEngine } from '../engine';
import type { CondPathActions, CondPathState } from './index';
import {
  condOdeViewExporter,
  condPathViewExporter,
  condSdeViewExporter
} from './view-exporters';

const views = [condPathViewExporter, condOdeViewExporter, condSdeViewExporter];

function createFrame(t: number, state: CondPathState): Frame<CondPathState> {
  return {
    state: { ...state },
    clock: { t, playing: true, speed: 1, scrubbing: false, loopPause: 0 }
  };
}

export function ConditionalFrameExporter(): React.ReactElement {
  const engine = useEngine<CondPathState, CondPathActions>();

  return (
    <MultiViewFrameExporter
      views={views}
      state={engine.frame.state}
      createFrame={createFrame}
    />
  );
}
