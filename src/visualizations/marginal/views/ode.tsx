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
import { createMargOdeRenderer, type MargOdeRenderer } from '../../webgl/marginal/ode';
import type { MargPathActions, MargPathState } from '../index';

export function MargOdeView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargOdeRenderer | null>(null);

  // Read config from global state
  const { showTrajectories, showVectorField, showSamples } = engine.frame.state.odeConfig;

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      rendererRef.current ??= createMargOdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const { odeConfig } = frame.state;

      // Update renderer configuration
      renderer.setShowTrajectories(odeConfig.showTrajectories);
      renderer.setShowVectorField(odeConfig.showVectorField);
      renderer.setShowSamples(odeConfig.showSamples);

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
