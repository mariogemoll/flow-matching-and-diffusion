// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { el } from './util/dom';
import { initFlowMatchingVisualizationEnsemble } from './visualizations/ensembles/flow-matching';

const WEIGHTS_URL = 'models/flow-matching-model.json';
const LOSS_HISTORY_URL = 'flow-matching-loss-history.bin';

async function initTfBackend(): Promise<void> {
  try {
    const usingWebGpu = await tf.setBackend('webgpu');
    await tf.ready();
    if (usingWebGpu) {
      console.info('TensorFlow.js backend: webgpu');
      return;
    }
  } catch (error) {
    console.warn('Failed to initialize TensorFlow.js webgpu backend:', error);
  }

  await tf.setBackend('webgl');
  await tf.ready();
  tf.env().set('WEBGL_PACK', true);
  console.info('TensorFlow.js backend: webgl');
}

void initTfBackend().then(() => {
  initFlowMatchingVisualizationEnsemble(
    el('[data-visualization="moons-dataset"]') as HTMLElement,
    el('[data-visualization="flow-matching-training"]') as HTMLElement,
    el('[data-visualization="flow-matching-generation"]') as HTMLElement,
    { lossHistoryUrl: LOSS_HISTORY_URL, weightsUrl: WEIGHTS_URL }
  );
});
