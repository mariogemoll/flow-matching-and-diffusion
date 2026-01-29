// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { makeMoons } from '../math/moons';
import type { Points2D } from '../types';
import { clearWebGl, createWebGl, type WebGl } from '../webgl';
import { createPointRenderer, type PointRenderer } from '../webgl/renderers/point';
import { Button } from './components/button';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { Slider } from './components/slider';
import { COLORS } from './constants';
import { mountVisualization } from './react-root';

const DEFAULT_NUM_SAMPLES = 1000;
const MIN_SAMPLES = 100;
const MAX_SAMPLES = 5000;
const NOISE = 0.1;

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

// Moons dataset domain - centered around the data (center ~0.5, 0.25)
// Canvas is 400x300 (4:3 aspect), so x range 4, y range 3
const MOONS_X_DOMAIN: [number, number] = [-1.5, 2.5];
const MOONS_Y_DOMAIN: [number, number] = [-1.25, 1.75];

const POINT_COLOR = COLORS.point;
const POINT_SIZE = 4;

function MoonsDatasetVisualization(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<PointRenderer | null>(null);
  // Pre-generate full pool of samples
  const [pool, setPool] = useState<Points2D>(() => makeMoons(MAX_SAMPLES, NOISE));
  const [numSamples, setNumSamples] = useState(DEFAULT_NUM_SAMPLES);

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    try {
      webGlRef.current = createWebGl(
        canvas,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        MOONS_X_DOMAIN,
        MOONS_Y_DOMAIN
      );
      rendererRef.current = createPointRenderer(webGlRef.current.gl);
    } catch (e) {
      console.error('Failed to initialize WebGL:', e);
    }

    return (): void => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
      webGlRef.current = null;
    };
  }, []);

  // Render when pool or numSamples change
  useEffect(() => {
    const webGl = webGlRef.current;
    const renderer = rendererRef.current;
    if (!webGl || !renderer) { return; }

    clearWebGl(webGl, COLORS.background);
    renderer.render(webGl.dataToClipMatrix, pool, POINT_COLOR, POINT_SIZE, numSamples);
  }, [pool, numSamples]);

  const handleNumSamplesChange = useCallback((value: number): void => {
    setNumSamples(Math.round(value));
  }, []);

  const handleRegenerate = useCallback((): void => {
    setPool(makeMoons(MAX_SAMPLES, NOISE));
  }, []);

  return (
    <ViewContainer>
      <canvas
        ref={canvasRef}
        className="view"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, display: 'block' }}
      />
      <ViewControls>
        <ViewControlsGroup>
          <Slider
            label="Samples"
            value={numSamples}
            min={MIN_SAMPLES}
            max={MAX_SAMPLES}
            step={100}
            onChange={handleNumSamplesChange}
            formatValue={(v) => String(Math.round(v))}
          />
          <Button onClick={handleRegenerate}>Resample</Button>
        </ViewControlsGroup>
      </ViewControls>
    </ViewContainer>
  );
}

export function initMoonsDatasetVisualization(container: HTMLElement): () => void {
  const name = 'moons-dataset';
  return mountVisualization(container, <MoonsDatasetVisualization />, { name });
}
