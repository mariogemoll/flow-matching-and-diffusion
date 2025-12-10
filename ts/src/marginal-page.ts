import type * as tfType from '@tensorflow/tfjs';
declare const tf: typeof tfType;

import { el } from 'web-ui-common/dom';

import { initMarginalOdeSdeWidget,initMarginalProbPathAndVectorFieldWidget } from './marginal';

async function run(): Promise<void> {
  await tf.ready();

  const container = el(document, '#container') as HTMLElement;
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '24px';

  // First widget: Marginal probability path + ODE vector field
  const widget1 = document.createElement('div');
  container.appendChild(widget1);
  initMarginalProbPathAndVectorFieldWidget(widget1, 'marginal-scheduler-1');

  // Second widget: Marginal probability path + ODE + SDE
  const widget2 = document.createElement('div');
  container.appendChild(widget2);
  initMarginalOdeSdeWidget(widget2, 'marginal-scheduler-2');
}

document.addEventListener('DOMContentLoaded', () => {
  run().catch((error: unknown) => {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  });
});
