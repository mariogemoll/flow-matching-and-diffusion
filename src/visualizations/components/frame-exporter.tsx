import React, { useState } from 'react';

import {
  type ExportProgress, exportSingleView, type ViewExportConfig
} from '../../headless/export';
import type { Frame } from '../engine';
import { Button } from './button';
import { ExportConfigModal } from './export-config-modal';

export interface FrameExporterProps<S> {
  view: ViewExportConfig<S>;
  state: S;
  createFrame: (t: number, state: S) => Frame<S>;
  fileName?: string;
}

export function FrameExporter<S>({
  view,
  state,
  createFrame,
  fileName = 'frames.zip'
}: FrameExporterProps<S>): React.ReactElement {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({
    phase: 'rendering',
    percent: 0
  });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleExport = async(numFrames: number): Promise<void> => {
    setIsExporting(true);
    setProgress({ phase: 'rendering', percent: 0 });

    try {
      await exportSingleView({
        createRenderer: view.createRenderer,
        configureRenderer: (renderer, currentState) => {
          view.configureRenderer(renderer, currentState);
        },
        state,
        createFrame,
        fileName,
        numFrames,
        onProgress: setProgress
      });
    } catch (e) {
      console.error(e);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button onClick={() => { setIsModalOpen(true); }} disabled={isExporting}>
        {isExporting
          ? `${progress.phase === 'rendering' ? 'Rendering' : 'Zipping'}... ` +
            `${String(progress.percent)}%`
          : 'Export frames'}
      </Button>

      <ExportConfigModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); }}
        onConfirm={(config) => { void handleExport(config.numFrames); }}
      />
    </>
  );
}
