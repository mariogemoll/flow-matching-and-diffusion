import type * as tfType from '@tensorflow/tfjs';
declare const tf: typeof tfType;

import { el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';

import {
  initConditionalPathOdeWidget,
  initConditionalPathWidget,
  initMovableDotWidget
} from './conditional';

async function run(): Promise<void> {
  await tf.ready();
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const containerC = el(document, '#containerC') as HTMLElement;

  const initialPosition: Pair<number> = [1.0, 0.5];
  const initialTime = 0;

  // Widget A with its own controller
  const updateWidgetA = initMovableDotWidget(containerA, initialPosition, (newPosition) => {
    updateWidgetA(newPosition);
  });

  initConditionalPathWidget(
    containerB, initialPosition, initialTime
  );
  initConditionalPathOdeWidget(
    containerC, initialPosition, initialTime
  );
}

document.addEventListener('DOMContentLoaded', () => {
  run().catch((error: unknown) => {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  });
});
