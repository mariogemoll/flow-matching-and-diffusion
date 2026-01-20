// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { type Frame } from '../../visualizations/engine';
import { type WebGl } from '../../webgl';

export interface WebGlRenderer<S> {
  update(frame: Frame<S>): boolean;
  render(webGl: WebGl): void;
  destroy(): void;
}
