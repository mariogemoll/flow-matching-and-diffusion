// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { FlowMatchingModel } from '../flow-matching/model';
import {
  initSamplingVisualization,
  type ModelLoader,
  type SamplingController,
  type SamplingControllerRef
} from './sampling';

const VISUALIZATION_NAME = 'flow-matching-generation';

export type FlowMatchingModelLoader = ModelLoader<FlowMatchingModel>;
export type FlowMatchingGenerationController = SamplingController<FlowMatchingModel>;
export type FlowMatchingGenerationControllerRef = SamplingControllerRef<FlowMatchingModel>;

export function initFlowMatchingGenerationVisualization(
  container: HTMLElement,
  options: {
    controllerRef?: FlowMatchingGenerationControllerRef;
    model?: FlowMatchingModel;
    loadModel?: FlowMatchingModelLoader;
  }
): () => void {
  return initSamplingVisualization<FlowMatchingModel>(
    container,
    VISUALIZATION_NAME,
    options
  );
}
