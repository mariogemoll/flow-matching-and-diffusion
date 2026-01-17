import { type Frame } from '../../visualizations/engine';
import { type WebGl } from '../../webgl';

export interface WebGlRenderer<S> {
  update(frame: Frame<S>): boolean;
  render(webGl: WebGl): void;
  destroy(): void;
}
