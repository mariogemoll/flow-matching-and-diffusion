import { el } from 'web-ui-common/dom';

import { setUpVectorField } from './vf';

function run(): void {
  const canvas1 = el(document, '#vf-canvas') as HTMLCanvasElement;
  const canvas2 = el(document, '#vf-canvas2') as HTMLCanvasElement;

  setUpVectorField(canvas1);
  setUpVectorField(canvas2, { showEulerSteps: true });
}

run();
