// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { DiffusionModel } from '../diffusion/model';
import {
  initSamplingVisualization,
  type ModelLoader,
  type SamplingController,
  type SamplingControllerRef
} from './sampling';

const VISUALIZATION_NAME = 'diffusion-generation';

export type DiffusionModelLoader = ModelLoader<DiffusionModel>;
export type DiffusionGenerationController = SamplingController<DiffusionModel>;
export type DiffusionGenerationControllerRef = SamplingControllerRef<DiffusionModel>;

export function initDiffusionGenerationVisualization(
  container: HTMLElement,
  options: {
    controllerRef?: DiffusionGenerationControllerRef;
    model?: DiffusionModel;
    loadModel?: DiffusionModelLoader;
  }
): () => void {
  return initSamplingVisualization<DiffusionModel>(
    container,
    VISUALIZATION_NAME,
    { ...options, showVectorFieldControl: false }
  );
}
