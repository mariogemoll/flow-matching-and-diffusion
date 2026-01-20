// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useEffect, useRef, useState } from 'react';

import { DEFAULT_NUM_EXPORT_FRAMES } from '../constants';

export interface ExportConfig {
  numFrames: number;
}

interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: ExportConfig) => void;
  defaultFrames?: number;
}

export function ExportConfigModal({
  isOpen,
  onClose,
  onConfirm,
  defaultFrames = DEFAULT_NUM_EXPORT_FRAMES
}: ExportConfigModalProps): React.ReactElement | null {
  const [numFrames, setNumFrames] = useState(defaultFrames);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  const handleConfirm = (): void => {
    onConfirm({ numFrames });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => { e.stopPropagation(); }}>
        <div className="modal-header">
          <h3>Export Configuration</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-field">
            <span className="modal-label">Number of frames:</span>
            <input
              ref={inputRef}
              type="number"
              min="1"
              max="1000"
              value={numFrames}
              onChange={(e) => { setNumFrames(Math.max(1, parseInt(e.target.value) || 1)); }}
              onKeyDown={handleKeyDown}
              className="modal-input"
            />
          </label>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-button-secondary">
            Cancel
          </button>
          <button onClick={handleConfirm} className="modal-button-primary">
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
