import type * as tfType from '@tensorflow/tfjs';
declare const tf: typeof tfType;

import { el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';

import {
  initConditionalProbPathAndTwoVectorFieldsWidget,
  initConditionalProbPathAndVectorFieldWidget,
  initConditionalProbPathWidget,
  initMovableDotWidget
} from './conditional';

async function run(): Promise<void> {
  await tf.ready();
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const containerC = el(document, '#containerC') as HTMLElement;
  const containerD = el(document, '#containerD') as HTMLElement;

  const initialPosition: Pair<number> = [1.0, 0.5];
  const initialTime = 0;

  // Widget A with its own controller
  const updateWidgetA = initMovableDotWidget(containerA, initialPosition, (newPosition) => {
    updateWidgetA(newPosition);
  });

  initConditionalProbPathWidget(
    containerB, initialPosition, initialTime
  );
  initConditionalProbPathAndVectorFieldWidget(
    containerC, initialPosition, initialTime
  );
  initConditionalProbPathAndTwoVectorFieldsWidget(
    containerD, initialPosition, initialTime
  );
}

document.addEventListener('DOMContentLoaded', () => {
  run().catch((error: unknown) => {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  });
});
