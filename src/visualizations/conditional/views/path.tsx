// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type Point2D } from '../../../types';
import { clearWebGl } from '../../../webgl';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { ResampleButton, SampleFrequencySlider } from '../../components/standard-controls';
import {
  COLORS,
  DEFAULT_LOOP_PAUSE
} from '../../constants';
import { useEngine } from '../../engine';
import { type CondPathRenderer, createCondPathRenderer } from '../../webgl/conditional/path';
import { type CondPathActions, type CondPathState } from '../index';

export function CondPathView(): React.ReactElement {
  const engine = useEngine<CondPathState, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondPathRenderer | null>(null);

  // Local UI state (controls visibility only)
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  // Read config from global state
  const { sampleFrequency } = engine.frame.state.pathConfig;

  // Use refs for mutable state accessed in render loop
  const paramsRef = useRef({
    resampleRequested: false
  });

  useEffect(() => {
    engine.setLoopPause(DEFAULT_LOOP_PAUSE);
  }, [engine]);

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      const gl = webGl.gl;
      rendererRef.current ??= createCondPathRenderer(gl);

      const renderer = rendererRef.current;
      const params = paramsRef.current;
      const { pathConfig } = frame.state;

      // Sync renderer with params
      renderer.setSampleFrequency(pathConfig.sampleFrequency);
      if (params.resampleRequested) {
        renderer.resample();
        params.resampleRequested = false;
      }

      // Update and Render
      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  // Implement resample action
  const handleResample = (): void => {
    paramsRef.current.resampleRequested = true;
    engine.renderOnce();
  };

  return (
    <>
      <ViewContainer>
        <PointerCanvas
          ref={pointerCanvasRef}
          onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
          xDomain={X_DOMAIN}
          yDomain={Y_DOMAIN}
        />
        <ViewControls>
          <ResampleButton onClick={handleResample} />
          {showAdditionalControls ? (
            <SampleFrequencySlider
              value={sampleFrequency}
              onChange={(v) => { engine.actions.setPathConfig({ sampleFrequency: v }); }}
            />
          ) : null}
          <EllipsisToggle
            expanded={showAdditionalControls}
            onToggle={() => { setShowAdditionalControls((current) => !current); }}
          />
        </ViewControls>
      </ViewContainer>
    </>
  );
}
