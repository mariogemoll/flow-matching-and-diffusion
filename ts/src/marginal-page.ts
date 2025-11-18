import type * as tfType from '@tensorflow/tfjs';
declare const tf: typeof tfType;

import { el } from 'web-ui-common/dom';

import { initMarginalProbPathAndVectorFieldWidget } from './marginal';

async function run(): Promise<void> {
  await tf.ready();

  const container = el(document, '#container') as HTMLElement;

  initMarginalProbPathAndVectorFieldWidget(container);
}

document.addEventListener('DOMContentLoaded', () => {
  run().catch((error: unknown) => {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  });
});
