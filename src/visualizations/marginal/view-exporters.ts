// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { ViewExportConfig } from '../../headless/export';
import {
  createMargOdeRenderer,
  type MargOdeRenderer
} from '../webgl/marginal/ode';
import {
  createMargPathRenderer,
  type MargPathRenderer
} from '../webgl/marginal/path';
import {
  createMargSdeRenderer,
  type MargSdeRenderer
} from '../webgl/marginal/sde';
import type { MargPathState } from './index';

export const margPathViewExporter: ViewExportConfig<MargPathState, MargPathRenderer> = {
  name: '1_path',
  createRenderer: createMargPathRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setShowPdf(state.pathConfig.showPdf);
    renderer.setShowSamples(state.pathConfig.showSamples);
    renderer.setSampleFrequency(1000);
  }
};

export const margOdeViewExporter: ViewExportConfig<MargPathState, MargOdeRenderer> = {
  name: '2_ode',
  createRenderer: createMargOdeRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setShowTrajectories(state.odeConfig.showTrajectories);
    renderer.setShowVectorField(state.odeConfig.showVectorField);
    renderer.setShowSamples(state.odeConfig.showSamples);
  }
};

export const margSdeViewExporter: ViewExportConfig<MargPathState, MargSdeRenderer> = {
  name: '3_sde',
  createRenderer: createMargSdeRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setShowSdeTrajectories(state.sdeConfig.showTrajectories);
    renderer.setShowSamples(state.sdeConfig.showSamples);
    renderer.setSigmaSchedule(state.sdeConfig.sigmaSchedule);
    renderer.setSdeNumSteps(state.sdeConfig.sdeNumSteps);
    renderer.setMaxSigma(state.sdeConfig.maxSigma);
  }
};
