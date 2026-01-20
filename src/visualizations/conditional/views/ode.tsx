// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type Point2D } from '../../../types';
import { clearWebGl } from '../../../webgl';
import { ViewContainer, ViewControls } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { type CondOdeRenderer, createCondOdeRenderer } from '../../webgl/conditional/ode';
import { type CondPathActions, type CondPathState } from '../index';

export function CondOdeView(): React.ReactElement {
  const engine = useEngine<CondPathState, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondOdeRenderer | null>(null);

  // Read config from global state
  const { showTrajectories, showVectorField, showSamples } = engine.frame.state.odeConfig;

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createCondOdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const { odeConfig } = frame.state;

      // Sync settings
      renderer.setShowTrajectories(odeConfig.showTrajectories);
      renderer.setShowVectorField(odeConfig.showVectorField);
      renderer.setShowSamples(odeConfig.showSamples);

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  return (
    <ViewContainer>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />
      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showTrajectories}
          onChange={(v) => { engine.actions.setOdeConfig({ showTrajectories: v }); }}
        />
        <ShowVectorFieldCheckbox
          checked={showVectorField}
          onChange={(v) => { engine.actions.setOdeConfig({ showVectorField: v }); }}
        />
        <ShowSamplesCheckbox
          checked={showSamples}
          onChange={(v) => { engine.actions.setOdeConfig({ showSamples: v }); }}
        />
        <ResampleTrajectoriesButton onClick={handleResample} />
      </ViewControls>
    </ViewContainer>
  );
}
