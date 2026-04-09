import React, { useRef, useState } from 'react';
import './Toolbar.css';

const STROKE_TYPES = [
  { id: 'fine', label: 'Fine', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20 C 8 14, 16 10, 20 4" />
    </svg>
  )},
  { id: 'medium', label: 'Medium', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 20 C 8 14, 16 10, 20 4" />
    </svg>
  )},
  { id: 'bold', label: 'Bold', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
      <path d="M4 20 C 8 14, 16 10, 20 4" strokeLinecap="round" />
    </svg>
  )},
  { id: 'calligraphy', label: 'Calligraphy', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4 C16 8, 12 14, 4 20 C4 20, 5 18, 8 15 C11 12, 17 7, 20 4Z" />
    </svg>
  )},
];

const SHAPE_TYPES = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'line', label: 'Line' },
];

const BOARD_PATTERNS = [
  { id: 'none', label: 'No Grid' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
];

const SHORTCUT_ITEMS = [
  { key: 'Ctrl + Q / Ctrl + W', action: 'Pen' },
  { key: 'Ctrl + E', action: 'Eraser' },
  { key: 'Ctrl + Shift + Q', action: 'Lasso Select' },
  { key: 'Ctrl + A', action: 'Ellipse Shape' },
  { key: 'Ctrl + T', action: 'Text Tool' },
  { key: 'Ctrl + R', action: 'Laser Pointer' },
  { key: 'Hold Ctrl', action: 'Draw while held' },
];

const Toolbar = ({
  colors,
  activeColor,
  onColorChange,
  boardColor,
  onBoardColorChange,
  boardBackgroundPresets,
  boardPattern,
  onBoardPatternChange,
  gridColor,
  onGridColorChange,
  lineWidth,
  onLineWidthChange,
  eraserSize,
  onEraserSizeChange,
  tool,
  onToolChange,
  shapeType,
  onShapeTypeChange,
  strokeType,
  onStrokeTypeChange,
  onUndo,
  onRedo,
  onClear,
  onImageUpload,
  canUndo,
  canRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleVisibility,
}) => {
  const fileInputRef = useRef(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  return (
    <div className="toolbar">
      <div className="toolbar-section toolbar-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
        <span className="brand-text">Board</span>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section colors-section">
        {colors.map((c) => (
          <button
            key={c.value}
            className={`color-btn ${activeColor === c.value ? 'active' : ''}`}
            style={{ '--btn-color': c.value }}
            onClick={() => {
              onColorChange(c.value);
              if (tool === 'eraser') onToolChange('pen');
            }}
            title={c.name}
          >
            <span className="color-dot" />
          </button>
        ))}
        <label className="color-picker-label" title="Custom Pen Color">
          <input
            type="color"
            className="color-picker-input"
            value={colors[2]?.value || activeColor}
            onChange={(e) => {
              onColorChange(e.target.value);
              if (tool === 'eraser') onToolChange('pen');
            }}
          />
        </label>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section board-section">
        {boardBackgroundPresets.map((bg) => (
          <button
            key={bg.value}
            className={`bg-btn ${boardColor === bg.value ? 'active' : ''}`}
            style={{ '--btn-color': bg.value }}
            onClick={() => onBoardColorChange(bg.value)}
            title={bg.name}
          >
            <span className="bg-dot" />
          </button>
        ))}
        <label className="color-picker-label" title="Custom Board Color">
          <input
            type="color"
            className="color-picker-input"
            value={boardColor}
            onChange={(e) => onBoardColorChange(e.target.value)}
          />
        </label>
        {BOARD_PATTERNS.map((p) => (
          <button
            key={p.id}
            className={`tool-btn compact ${boardPattern === p.id ? 'active' : ''}`}
            onClick={() => onBoardPatternChange(p.id)}
            title={p.label}
          >
            {p.id === 'none' && 'N'}
            {p.id === 'grid' && 'G'}
            {p.id === 'dots' && 'D'}
          </button>
        ))}
        <div className="grid-color-controls" title="Grid Color">
          <span
            className="grid-color-preview"
            style={{ '--grid-preview-color': gridColor }}
          />
          <label className="color-picker-label" title="Pick Grid Color">
            <input
              type="color"
              className="color-picker-input"
              value={gridColor}
              onChange={(e) => onGridColorChange(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section strokes-section">
        {STROKE_TYPES.map((s) => (
          <button
            key={s.id}
            className={`tool-btn ${tool === 'pen' && strokeType === s.id ? 'active' : ''}`}
            onClick={() => {
              onStrokeTypeChange(s.id);
              onToolChange('pen');
            }}
            title={s.label}
          >
            {s.icon}
          </button>
        ))}
        <button
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => onToolChange('eraser')}
          title="Eraser"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
            <path d="M22 21H7" />
            <path d="m5 11 9 9" />
          </svg>
        </button>
        <button
          className={`tool-btn ${tool === 'pointer' ? 'active' : ''}`}
          onClick={() => onToolChange('pointer')}
          title="Laser Pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
          </svg>
        </button>
        <button
          className={`tool-btn ${tool === 'highlighter' ? 'active' : ''}`}
          onClick={() => onToolChange('highlighter')}
          title="Highlighter"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 4 5 5-9 9H6v-5z" />
            <path d="M4 20h8" />
          </svg>
        </button>
        <button
          className={`tool-btn ${tool === 'arrow' ? 'active' : ''}`}
          onClick={() => onToolChange('arrow')}
          title="Arrow"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 19 19 5" />
            <path d="M11 5h8v8" />
          </svg>
        </button>
        <button
          className={`tool-btn ${tool === 'lasso' ? 'active' : ''}`}
          onClick={() => onToolChange('lasso')}
          title="Lasso Select"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 8c1.5-2.4 4.2-3.5 6.9-3.2 3.4.4 6.1 3 6.1 6.5 0 3.2-2.3 5.8-5.2 6.4" />
            <path d="M9.2 18.3c-2.7 0-4.7-1.7-4.7-4 0-2.2 1.8-3.9 4.3-3.9 1.1 0 2.1.3 2.9.8" />
            <path d="M14 17.8c0 1.2-1 2.2-2.2 2.2S9.6 19 9.6 17.8s1-2.2 2.2-2.2 2.2 1 2.2 2.2Z" />
          </svg>
        </button>
        {SHAPE_TYPES.map((s) => (
          <button
            key={s.id}
            className={`tool-btn ${tool === 'shape' && shapeType === s.id ? 'active' : ''}`}
            onClick={() => {
              onShapeTypeChange(s.id);
              onToolChange('shape');
            }}
            title={s.label}
          >
            {s.id === 'rectangle' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="6" width="16" height="12" rx="1" />
              </svg>
            )}
            {s.id === 'ellipse' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="12" rx="8" ry="6" />
              </svg>
            )}
            {s.id === 'line' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 18 19 6" />
              </svg>
            )}
          </button>
        ))}
        <button
          className={`tool-btn ${tool === 'text' ? 'active' : ''}`}
          onClick={() => onToolChange('text')}
          title="Text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16" />
            <path d="M12 6v12" />
            <path d="M8 18h8" />
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section width-section">
        {tool === 'eraser' ? (
          <input
            type="range"
            min="8"
            max="80"
            value={eraserSize}
            onChange={(e) => onEraserSizeChange(Number(e.target.value))}
            className="width-slider"
            title={`Eraser: ${eraserSize}`}
          />
        ) : (
          <input
            type="range"
            min="1"
            max="10"
            value={lineWidth}
            onChange={(e) => onLineWidthChange(Number(e.target.value))}
            className="width-slider"
            title={`Size: ${lineWidth}`}
          />
        )}
        <div
          className="width-preview"
          style={{
            width: tool === 'eraser' ? Math.min(28, Math.max(8, eraserSize / 2.4)) : lineWidth + 4,
            height: tool === 'eraser' ? Math.min(28, Math.max(8, eraserSize / 2.4)) : lineWidth + 4,
            background: tool === 'eraser' ? '#64748b' : activeColor,
          }}
        />
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section actions-section">
        <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
        </button>
        <button
          className="tool-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Image/PDF"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={onImageUpload}
            style={{ display: 'none' }}
          />
        </button>
        <button className="tool-btn danger" onClick={onClear} title="Clear All">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section zoom-section">
        <button className="tool-btn" onClick={onZoomOut} title="Zoom Out">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M8 11h6" />
          </svg>
        </button>
        <button className="zoom-label" onClick={onZoomReset} title="Reset Zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button className="tool-btn" onClick={onZoomIn} title="Zoom In">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M8 11h6" />
            <path d="M11 8v6" />
          </svg>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <button
          className={`tool-btn ${isShortcutsOpen ? 'active' : ''}`}
          onClick={() => setIsShortcutsOpen((v) => !v)}
          title="Show Shortcuts"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h2" />
            <path d="M11 10h2" />
            <path d="M15 10h2" />
            <path d="M7 14h6" />
          </svg>
        </button>
        <button className="tool-btn" onClick={onToggleVisibility} title="Hide Toolbar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {isShortcutsOpen && (
        <div className="shortcuts-popover">
          <div className="shortcuts-head">
            <span>Shortcuts</span>
            <button className="shortcuts-close" onClick={() => setIsShortcutsOpen(false)}>
              Close
            </button>
          </div>
          <div className="shortcuts-list">
            {SHORTCUT_ITEMS.map((item) => (
              <div key={item.key} className="shortcut-row">
                <span className="shortcut-key">{item.key}</span>
                <span className="shortcut-action">{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Toolbar;
