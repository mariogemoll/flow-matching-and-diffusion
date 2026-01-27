// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { clearWebGl, type WebGl } from '../../../webgl';
import { ViewContainer, ViewControls } from '../../components/layout';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { useEngineConfigSync } from '../../hooks/use-engine-config';
import { createMargOdeRenderer, type MargOdeRenderer } from '../../webgl/marginal/ode';
import type { MargPathActions, MargPathState } from '../index';

export function MargOdeView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargOdeRenderer | null>(null);

  const {
    config: odeConfig,
    updateConfig: updateOdeConfig,
    syncFromFrame: syncOdeConfig
  } = useEngineConfigSync(
    engine.frame.state.odeConfig,
    (config) => { engine.actions.setOdeConfig(config); }
  );

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      rendererRef.current ??= createMargOdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const { odeConfig: frameOdeConfig } = frame.state;

      // Update renderer configuration
      renderer.setShowTrajectories(frameOdeConfig.showTrajectories);
      renderer.setShowVectorField(frameOdeConfig.showVectorField);
      renderer.setShowSamples(frameOdeConfig.showSamples);

      syncOdeConfig(frameOdeConfig);

      // Render
      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResampleTrajectories = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={odeConfig.showTrajectories}
        onChange={(v) => { updateOdeConfig({ showTrajectories: v }); }}
      />
      <ShowVectorFieldCheckbox
        checked={odeConfig.showVectorField}
        onChange={(v) => { updateOdeConfig({ showVectorField: v }); }}
      />
      <ShowSamplesCheckbox
        checked={odeConfig.showSamples}
        onChange={(v) => { updateOdeConfig({ showSamples: v }); }}
      />
    </>
  );

  const restControls = (
    <>
      <ResampleTrajectoriesButton onClick={handleResampleTrajectories} />
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />

      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {checkboxControls}
            {restControls}
          </div>
        ) : (
          <>
            <div className="view-controls-group">{checkboxControls}</div>
            <div className="view-controls-group">{restControls}</div>
          </>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
