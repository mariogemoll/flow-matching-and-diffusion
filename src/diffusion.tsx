// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { el } from './util/dom';
import { initDiffusionVisualizationEnsemble } from './visualizations/ensembles/diffusion';

const FLOW_MATCHING_WEIGHTS_URL = 'models/flow-matching-model.json';
const FLOW_MATCHING_LOSS_HISTORY_URL = 'flow-matching-loss-history.bin';
const SCORE_MATCHING_WEIGHTS_URL = 'models/score-matching-model.json';
const SCORE_MATCHING_LOSS_HISTORY_URL = 'score-matching-loss-history.bin';

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
  initDiffusionVisualizationEnsemble(
    el('[data-visualization="moons-dataset"]') as HTMLElement,
    el('[data-visualization="flow-matching-training"]') as HTMLElement,
    el('[data-visualization="score-matching-training"]') as HTMLElement,
    el('[data-visualization="diffusion-generation"]') as HTMLElement,
    {
      flowMatchingLossHistoryUrl: FLOW_MATCHING_LOSS_HISTORY_URL,
      flowMatchingWeightsUrl: FLOW_MATCHING_WEIGHTS_URL,
      scoreMatchingLossHistoryUrl: SCORE_MATCHING_LOSS_HISTORY_URL,
      scoreMatchingWeightsUrl: SCORE_MATCHING_WEIGHTS_URL
    }
  );
});
