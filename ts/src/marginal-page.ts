import type * as tfType from '@tensorflow/tfjs';
declare const tf: typeof tfType;

import { el } from 'web-ui-common/dom';

import { initMarginalOdeSdeWidget,initMarginalProbPathAndVectorFieldWidget } from './marginal';

async function run(): Promise<void> {
  await tf.ready();

  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;

  initMarginalProbPathAndVectorFieldWidget(containerA);
  initMarginalOdeSdeWidget(containerB);
}

document.addEventListener('DOMContentLoaded', () => {
  run().catch((error: unknown) => {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  });
});
