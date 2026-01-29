// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { el } from './util/dom';
import { initMoonsDatasetVisualization } from './visualizations/moons-dataset';

initMoonsDatasetVisualization(el('[data-visualization="moons-dataset"]') as HTMLElement);
