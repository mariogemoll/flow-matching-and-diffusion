import React, { useEffect, useRef, useState } from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH, X_DOMAIN, Y_DOMAIN } from '../../../constants';
import { type GaussianComponent } from '../../../types';
import { clearWebGl, type WebGl } from '../../../webgl';
import { Button } from '../../components/button';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { GaussianMixtureEditor } from '../../components/gaussian-mixture-editor';
import { ViewContainer, ViewControls } from '../../components/layout';
import {
  ResampleButton,
  SampleFrequencySlider,
  ShowPdfCheckbox,
  ShowSamplesCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { createMargPathRenderer, type MargPathRenderer } from '../../webgl/marginal/path';
import { type MargPathActions, type MargPathState } from '../index';

export function MargPathView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargPathRenderer | null>(null);

  const [editMode, setEditMode] = useState(engine.frame.state.editMode);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  // Local state for components to sync with engine updates for the editor
  const [components, setComponents] = useState<GaussianComponent[]>(engine.frame.state.components);

  // Read config from global state
  const { showPdf, showSamples, sampleFrequency } = engine.frame.state.pathConfig;

  // Sync tracking for editor UI updates
  const lastEditorSyncRef = useRef<{
    components: MargPathState['components'] | null;
    timestamp: number;
    editMode: boolean;
  }>({
    components: null,
    timestamp: 0,
    editMode: false
  });

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      rendererRef.current ??= createMargPathRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const { pathConfig } = frame.state;
      const now = performance.now();

      // Sync Edit Mode
      if (frame.state.editMode !== lastEditorSyncRef.current.editMode) {
        lastEditorSyncRef.current.editMode = frame.state.editMode;
        setEditMode(frame.state.editMode);
      }

      // Auto-exit edit mode if user starts playing or scrubbing
      if (frame.state.editMode) {
        if (frame.clock.playing || frame.clock.scrubbing || frame.clock.t !== 1) {
          frame.state.editMode = false;
          frame.state.wasPlayingBeforeEdit = false;
          // Force update next frame to reflect exit
          lastEditorSyncRef.current.editMode = false;
          setEditMode(false);
        }
      }

      // Sync Components to React state for Editor
      // Throttle to avoid excessive re-renders during high-freq updates
      // This is purely for the editor UI overlay
      if (frame.state.components !== lastEditorSyncRef.current.components) {
        const syncThreshold = 50; // ms
        if (!frame.clock.playing || (now - lastEditorSyncRef.current.timestamp > syncThreshold)) {
          setComponents(frame.state.components);
          lastEditorSyncRef.current.components = frame.state.components;
          lastEditorSyncRef.current.timestamp = now;
        }
      }

      // Update render config
      renderer.setShowPdf(pathConfig.showPdf);
      renderer.setShowSamples(pathConfig.showSamples);
      renderer.setSampleFrequency(pathConfig.sampleFrequency);

      // Render
      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleEditToggle = (): void => {
    if (editMode) {
      engine.actions.exitEditMode();
    } else {
      engine.actions.enterEditMode();
    }
  };

  const handleResample = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  const checkboxControls = (
    <>
      <ShowPdfCheckbox
        checked={showPdf}
        onChange={(v) => { engine.actions.setPathConfig({ showPdf: v }); }}
      />
      <ShowSamplesCheckbox
        checked={showSamples}
        onChange={(v) => { engine.actions.setPathConfig({ showSamples: v }); }}
      />
    </>
  );

  const restControls = (
    <>
      <ResampleButton onClick={handleResample} />
      <Button onClick={handleEditToggle}>
        {editMode ? 'OK' : 'Edit'}
      </Button>
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
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas
        webGlRef={webGlRef}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />
      <GaussianMixtureEditor
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        components={components}
        onChange={engine.actions.setComponents}
        hidden={!editMode}
      />
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
