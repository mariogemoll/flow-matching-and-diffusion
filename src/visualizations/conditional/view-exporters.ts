import type { ViewExportConfig } from '../../headless/export';
import {
  type CondOdeRenderer,
  createCondOdeRenderer
} from '../webgl/conditional/ode';
import {
  type CondPathRenderer,
  createCondPathRenderer
} from '../webgl/conditional/path';
import {
  type CondSdeRenderer,
  createCondSdeRenderer
} from '../webgl/conditional/sde';
import type { CondPathState } from './index';

export const condPathViewExporter: ViewExportConfig<CondPathState, CondPathRenderer> = {
  name: '1_path',
  createRenderer: createCondPathRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setSampleFrequency(state.pathConfig.sampleFrequency);
  }
};

export const condOdeViewExporter: ViewExportConfig<CondPathState, CondOdeRenderer> = {
  name: '2_ode',
  createRenderer: createCondOdeRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setShowTrajectories(state.odeConfig.showTrajectories);
    renderer.setShowVectorField(state.odeConfig.showVectorField);
    renderer.setShowSamples(state.odeConfig.showSamples);
  }
};

export const condSdeViewExporter: ViewExportConfig<CondPathState, CondSdeRenderer> = {
  name: '3_sde',
  createRenderer: createCondSdeRenderer,
  configureRenderer: (renderer, state): void => {
    renderer.setShowSdeTrajectories(state.sdeConfig.showTrajectories);
    renderer.setShowSamples(state.sdeConfig.showSamples);
    renderer.setSigmaSchedule(state.sdeConfig.sigmaSchedule);
    renderer.setSdeNumSteps(state.sdeConfig.sdeNumSteps);
    renderer.setMaxSigma(state.sdeConfig.maxSigma);
  }
};
