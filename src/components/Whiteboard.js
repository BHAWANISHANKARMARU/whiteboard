import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getStroke } from 'perfect-freehand';
import Toolbar from './Toolbar';
import ImageOverlay from './ImageOverlay';
import './Whiteboard.css';

const DEFAULT_PEN_COLORS = [
  { name: 'Ink Black', value: '#1a1a2e' },
  { name: 'Royal Blue', value: '#0057b7' },
];

const BOARD_BACKGROUNDS = [
  { name: 'Cloud', value: '#edf2f7' },
  { name: 'Ivory', value: '#f6f5ef' },
  { name: 'Mint', value: '#e8f5ef' },
];

let pdfJsLibPromise = null;

function loadPdfJsLib() {
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }

  if (pdfJsLibPromise) return pdfJsLibPromise;

  pdfJsLibPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdfjs="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('pdfjsLib not available'));
        }
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load pdf.js')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.dataset.pdfjs = 'true';
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error('pdfjsLib not available'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load pdf.js'));
    document.head.appendChild(script);
  });

  return pdfJsLibPromise;
}

function getSvgPathFromStroke(stroke) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

function drawFreehandStroke(ctx, points, options) {
  const outlinePoints = getStroke(points, options);
  if (outlinePoints.length === 0) return;
  const path = new Path2D(getSvgPathFromStroke(outlinePoints));
  ctx.fill(path);
}

function drawShapeStroke(ctx, shapeType, start, end, strokeWidth, strokeColor) {
  if (!start || !end) return;
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  const w = Math.abs(end[0] - start[0]);
  const h = Math.abs(end[1] - start[1]);

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (shapeType === 'line') {
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
  } else if (shapeType === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }

  ctx.stroke();
  ctx.restore();
}

function drawArrowStroke(ctx, start, end, strokeWidth, strokeColor) {
  if (!start || !end) return;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const angle = Math.atan2(ey - sy, ex - sx);
  const headLength = Math.max(8, strokeWidth * 3.5);

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(
    ex - headLength * Math.cos(angle - Math.PI / 7),
    ey - headLength * Math.sin(angle - Math.PI / 7)
  );
  ctx.lineTo(
    ex - headLength * Math.cos(angle + Math.PI / 7),
    ey - headLength * Math.sin(angle + Math.PI / 7)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function getPointsBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function isClosedLasso(points, zoom) {
  if (!points || points.length < 18) return false;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  const bounds = getPointsBounds(points);
  const perimeter = 2 * (bounds.width + bounds.height);
  if (perimeter < 120 / zoom) return false;
  const dist = Math.hypot(ex - sx, ey - sy);
  return dist < Math.max(22 / zoom, perimeter * 0.12);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isDarkHexColor(hex) {
  if (!hex) return false;
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.52;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(42, 67, 101, ${alpha})`;
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (value.length !== 6) return `rgba(42, 67, 101, ${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(42, 67, 101, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const Whiteboard = () => {
  const bgCanvasRef = useRef(null);
  const fgCanvasRef = useRef(null);
  const bgCtxRef = useRef(null);
  const fgCtxRef = useRef(null);
  const wrapperRef = useRef(null);

  const [color, setColor] = useState(DEFAULT_PEN_COLORS[0].value);
  const [customPenColor, setCustomPenColor] = useState('#c1272d');
  const [lineWidth, setLineWidth] = useState(3);
  const [eraserSize, setEraserSize] = useState(24);
  const [tool, setTool] = useState('pen');
  const [shapeType, setShapeType] = useState('rectangle');
  const [strokeType, setStrokeType] = useState('fine');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pages, setPages] = useState([{ id: 1, name: 'Page 1' }]);
  const [activePageId, setActivePageId] = useState(1);
  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [overlayImage, setOverlayImage] = useState(null);
  const [showImageOverlay, setShowImageOverlay] = useState(false);
  const [boardColor, setBoardColor] = useState(BOARD_BACKGROUNDS[0].value);
  const [boardPattern, setBoardPattern] = useState('grid');
  const [gridColor, setGridColor] = useState('#2a4365');
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [isPagesVisible, setIsPagesVisible] = useState(true);
  const [isPagesDropdownOpen, setIsPagesDropdownOpen] = useState(true);
  const [selection, setSelection] = useState(null);

  const penColors = [
    ...DEFAULT_PEN_COLORS,
    { name: 'Custom', value: customPenColor },
  ];

  const handlePenColorChange = (nextColor) => {
    const isDefault = DEFAULT_PEN_COLORS.some((c) => c.value === nextColor);
    if (!isDefault) {
      setCustomPenColor(nextColor);
    }
    setColor(nextColor);
  };

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const rawPointsRef = useRef([]);
  const isDrawingRef = useRef(false);
  const isCtrlDrawingRef = useRef(false);
  const isCtrlPressedRef = useRef(false);
  const pressedKeysRef = useRef(new Set());
  const laserTrailRef = useRef([]);
  const laserClearTimerRef = useRef(null);
  const laserIsDrawingRef = useRef(false);
  const [laserCursor, setLaserCursor] = useState({ visible: false, x: 0, y: 0 });
  const pointerPositionsRef = useRef(new Map());
  const pinchRef = useRef(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const viewTargetRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const viewRafRef = useRef(null);
  const selectionRef = useRef(null);
  const isDraggingSelectionRef = useRef(false);
  const selectionDragRef = useRef(null);
  const nextPageIdRef = useRef(2);
  const activePageIdRef = useRef(1);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const pageStoreRef = useRef({
    1: { history: [], historyIndex: -1 },
  });

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const target = e.target;
      const tag = target?.tagName;
      const isEditable = target?.isContentEditable
        || tag === 'INPUT'
        || tag === 'TEXTAREA'
        || tag === 'SELECT';
      if (isEditable) return;

      const key = e.key.toLowerCase();

      if ((key === 'q' || key === 'w') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setTool('pen');
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        e.stopPropagation();
        setTool('eraser');
        return;
      }
      if (key === 'q' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        setTool('lasso');
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        setShapeType('ellipse');
        setTool('shape');
        return;
      }
      if (key === 't') {
        e.preventDefault();
        e.stopPropagation();
        setTool('text');
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        e.stopPropagation();
        setTool('pointer');
        return;
      }

      // Block all other Ctrl/Meta combos inside app.
      if (e.key !== 'Control' && e.key !== 'Meta') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const STROKE_CONFIGS = {
    fine: {
      sizeMultiplier: 1,
      thinning: 0.08,
      smoothing: 0.72,
      streamline: 0.58,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
    medium: {
      sizeMultiplier: 1.8,
      thinning: 0.1,
      smoothing: 0.7,
      streamline: 0.54,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
    bold: {
      sizeMultiplier: 3.2,
      thinning: 0.05,
      smoothing: 0.65,
      streamline: 0.5,
      simulatePressure: true,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    },
    calligraphy: {
      sizeMultiplier: 2.5,
      thinning: 0.6,
      smoothing: 0.82,
      streamline: 0.52,
      simulatePressure: true,
      start: { taper: 40, easing: (t) => t * t },
      end: { taper: 40, easing: (t) => t * t },
    },
  };

  // Pen size divided by zoom so it stays same on screen
  const getOpts = useCallback((last = false, currentZoom) => {
    const cfg = STROKE_CONFIGS[strokeType] || STROKE_CONFIGS.fine;
    const z = currentZoom || zoom;
    return {
      size: (lineWidth * cfg.sizeMultiplier) / z,
      thinning: cfg.thinning,
      smoothing: cfg.smoothing,
      streamline: cfg.streamline,
      easing: (t) => t,
      start: cfg.start,
      end: cfg.end,
      simulatePressure: cfg.simulatePressure,
      last,
    };
  }, [lineWidth, strokeType, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas size = large fixed size for infinite-ish board
  const CANVAS_W = 4000;
  const CANVAS_H = 3000;

  const setupCanvas = useCallback((canvas) => {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return ctx;
  }, []);

  const initCanvases = useCallback(() => {
    bgCtxRef.current = setupCanvas(bgCanvasRef.current);
    fgCtxRef.current = setupCanvas(fgCanvasRef.current);

    if (history.length > 0 && historyIndex >= 0) {
      const img = new Image();
      img.onload = () => {
        bgCtxRef.current.drawImage(img, 0, 0);
      };
      img.src = history[historyIndex];
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initCanvases();
  }, [initCanvases]);

  const renderCanvasFromData = useCallback((dataUrl) => {
    const ctx = bgCtxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }, [CANVAS_H, CANVAS_W]);

  const clampView = useCallback((nextZoom, nextPanX, nextPanY) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return { zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    }

    const rect = wrapper.getBoundingClientRect();
    const scaledW = CANVAS_W * nextZoom;
    const scaledH = CANVAS_H * nextZoom;

    let panXClamped = nextPanX;
    let panYClamped = nextPanY;

    if (scaledW <= rect.width) {
      panXClamped = (rect.width - scaledW) / 2;
    } else {
      panXClamped = Math.min(0, Math.max(rect.width - scaledW, nextPanX));
    }

    if (scaledH <= rect.height) {
      panYClamped = (rect.height - scaledH) / 2;
    } else {
      panYClamped = Math.min(0, Math.max(rect.height - scaledH, nextPanY));
    }

    return { zoom: nextZoom, panX: panXClamped, panY: panYClamped };
  }, [CANVAS_H, CANVAS_W]);

  const animateView = useCallback(() => {
    if (viewRafRef.current !== null) return;

    const tick = () => {
      const current = viewRef.current;
      const target = viewTargetRef.current;

      const dz = target.zoom - current.zoom;
      const dx = target.panX - current.panX;
      const dy = target.panY - current.panY;

      const done = Math.abs(dz) < 0.001 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;

      if (done) {
        viewRef.current = { ...target };
        setZoom(target.zoom);
        setPanX(target.panX);
        setPanY(target.panY);
        viewRafRef.current = null;
        return;
      }

      const eased = {
        zoom: current.zoom + dz * 0.24,
        panX: current.panX + dx * 0.24,
        panY: current.panY + dy * 0.24,
      };

      viewRef.current = eased;
      setZoom(eased.zoom);
      setPanX(eased.panX);
      setPanY(eased.panY);

      viewRafRef.current = requestAnimationFrame(tick);
    };

    viewRafRef.current = requestAnimationFrame(tick);
  }, []);

  const setViewTarget = useCallback((nextZoom, nextPanX, nextPanY, immediate = false) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const target = clampView(clampedZoom, nextPanX, nextPanY);

    viewTargetRef.current = target;

    if (immediate) {
      if (viewRafRef.current !== null) {
        cancelAnimationFrame(viewRafRef.current);
        viewRafRef.current = null;
      }
      viewRef.current = target;
      setZoom(target.zoom);
      setPanX(target.panX);
      setPanY(target.panY);
      return;
    }

    animateView();
  }, [animateView, clampView]);

  useEffect(() => () => {
    if (viewRafRef.current !== null) {
      cancelAnimationFrame(viewRafRef.current);
    }
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const centeredPanX = (rect.width - CANVAS_W) / 2;
    const centeredPanY = (rect.height - CANVAS_H) / 2;
    setViewTarget(1, centeredPanX, centeredPanY, true);
  }, [setViewTarget, CANVAS_W, CANVAS_H]);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (canvas && history.length === 0) {
      setTimeout(() => {
        const initialHistory = [canvas.toDataURL()];
        historyRef.current = initialHistory;
        historyIndexRef.current = 0;
        setHistory(initialHistory);
        setHistoryIndex(0);
        pageStoreRef.current[activePageId] = {
          history: initialHistory,
          historyIndex: 0,
        };
      }, 100);
    }
  }, [activePageId, history.length]);

  // Pinch zoom & scroll pan
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const base = viewTargetRef.current;

      if (e.ctrlKey || e.metaKey) {
        // Pinch zoom
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Point in canvas space before zoom
        const canvasXBefore = (mouseX - base.panX) / base.zoom;
        const canvasYBefore = (mouseY - base.panY) / base.zoom;

        const delta = -e.deltaY * 0.01;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.zoom * (1 + delta)));

        // Adjust pan so zoom centers on mouse
        const newPanX = mouseX - canvasXBefore * newZoom;
        const newPanY = mouseY - canvasYBefore * newZoom;

        setViewTarget(newZoom, newPanX, newPanY);
      } else {
        // Two-finger scroll = pan
        setViewTarget(base.zoom, base.panX - e.deltaX, base.panY - e.deltaY);
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, [setViewTarget]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const redrawFg = useCallback((previewPoints = null) => {
    const fgCtx = fgCtxRef.current;
    if (!fgCtx) return;

    fgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const sel = selectionRef.current;
    if (sel) {
      fgCtx.save();
      fgCtx.drawImage(sel.canvas, sel.x, sel.y);
      fgCtx.strokeStyle = '#2563eb';
      fgCtx.lineWidth = 2 / viewRef.current.zoom;
      fgCtx.setLineDash([8 / viewRef.current.zoom, 6 / viewRef.current.zoom]);
      fgCtx.strokeRect(sel.x, sel.y, sel.width, sel.height);
      fgCtx.restore();
    }

    if (tool === 'pen' && previewPoints && previewPoints.length > 1) {
      fgCtx.fillStyle = color;
      drawFreehandStroke(fgCtx, previewPoints, getOpts(false, viewRef.current.zoom));
      return;
    }

    if (tool === 'highlighter' && previewPoints && previewPoints.length > 1) {
      fgCtx.save();
      fgCtx.globalAlpha = 0.28;
      fgCtx.fillStyle = color;
      const hiOpts = {
        ...getOpts(false, viewRef.current.zoom),
        size: ((lineWidth + 4) * 2.2) / viewRef.current.zoom,
        thinning: 0,
        smoothing: 0.8,
        streamline: 0.45,
      };
      drawFreehandStroke(fgCtx, previewPoints, hiOpts);
      fgCtx.restore();
      return;
    }

    if (tool === 'lasso' && previewPoints && previewPoints.length > 1) {
      fgCtx.save();
      fgCtx.strokeStyle = '#2563eb';
      fgCtx.lineWidth = 2 / viewRef.current.zoom;
      fgCtx.setLineDash([8 / viewRef.current.zoom, 6 / viewRef.current.zoom]);
      fgCtx.beginPath();
      previewPoints.forEach(([x, y], idx) => {
        if (idx === 0) fgCtx.moveTo(x, y);
        else fgCtx.lineTo(x, y);
      });
      fgCtx.stroke();
      fgCtx.restore();
      return;
    }

    if (tool === 'shape' && previewPoints && previewPoints.length >= 2) {
      const start = previewPoints[0];
      const end = previewPoints[previewPoints.length - 1];
      drawShapeStroke(
        fgCtx,
        shapeType,
        start,
        end,
        Math.max(1, (lineWidth * 1.8) / viewRef.current.zoom),
        color
      );
      return;
    }

    if (tool === 'arrow' && previewPoints && previewPoints.length >= 2) {
      drawArrowStroke(
        fgCtx,
        previewPoints[0],
        previewPoints[previewPoints.length - 1],
        Math.max(1, (lineWidth * 1.6) / viewRef.current.zoom),
        color
      );
    }

    if (laserTrailRef.current.length > 1) {
      fgCtx.save();
      fgCtx.strokeStyle = 'rgba(255, 50, 50, 0.92)';
      fgCtx.lineWidth = 5 / viewRef.current.zoom;
      fgCtx.lineCap = 'round';
      fgCtx.lineJoin = 'round';
      fgCtx.shadowColor = 'rgba(255, 50, 50, 0.8)';
      fgCtx.shadowBlur = 18 / viewRef.current.zoom;
      fgCtx.beginPath();
      laserTrailRef.current.forEach(([x, y], idx) => {
        if (idx === 0) fgCtx.moveTo(x, y);
        else fgCtx.lineTo(x, y);
      });
      fgCtx.stroke();
      fgCtx.restore();
    }
  }, [CANVAS_H, CANVAS_W, color, getOpts, lineWidth, shapeType, tool]);

  useEffect(() => {
    redrawFg();
  }, [selection, zoom, panX, panY, redrawFg]);

  useEffect(() => {
    if (tool !== 'pointer') {
      laserIsDrawingRef.current = false;
      setLaserCursor({ visible: false, x: 0, y: 0 });
      if (laserClearTimerRef.current) {
        clearTimeout(laserClearTimerRef.current);
        laserClearTimerRef.current = null;
      }
      laserTrailRef.current = [];
      redrawFg();
    }
  }, [tool, redrawFg]);

  useEffect(() => () => {
    if (laserClearTimerRef.current) {
      clearTimeout(laserClearTimerRef.current);
    }
  }, []);

  const commitSelectionToBoard = useCallback((sel, save = true) => {
    if (!sel) return;
    const bgCtx = bgCtxRef.current;
    bgCtx.drawImage(sel.canvas, sel.x, sel.y);
    if (save) saveHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buildSelectionFromLasso = useCallback((lassoPoints) => {
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCtxRef.current;
    if (!bgCanvas || !bgCtx || !lassoPoints?.length) return null;

    const bounds = getPointsBounds(lassoPoints);
    const pad = 2;
    const x = Math.max(0, Math.floor(bounds.minX - pad));
    const y = Math.max(0, Math.floor(bounds.minY - pad));
    const w = Math.min(CANVAS_W - x, Math.ceil(bounds.width + pad * 2));
    const h = Math.min(CANVAS_H - y, Math.ceil(bounds.height + pad * 2));
    if (w <= 1 || h <= 1) return null;

    const imageData = bgCtx.getImageData(x, y, w, h);
    let hasInk = false;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) {
        hasInk = true;
        break;
      }
    }
    if (!hasInk) return null;

    const selCanvas = document.createElement('canvas');
    selCanvas.width = w;
    selCanvas.height = h;
    const selCtx = selCanvas.getContext('2d');

    selCtx.save();
    selCtx.beginPath();
    lassoPoints.forEach(([px, py], idx) => {
      const lx = px - x;
      const ly = py - y;
      if (idx === 0) selCtx.moveTo(lx, ly);
      else selCtx.lineTo(lx, ly);
    });
    selCtx.closePath();
    selCtx.clip();
    selCtx.drawImage(bgCanvas, -x, -y);
    selCtx.restore();

    bgCtx.save();
    bgCtx.globalCompositeOperation = 'destination-out';
    bgCtx.beginPath();
    lassoPoints.forEach(([px, py], idx) => {
      if (idx === 0) bgCtx.moveTo(px, py);
      else bgCtx.lineTo(px, py);
    });
    bgCtx.closePath();
    bgCtx.fill();
    bgCtx.restore();

    return { canvas: selCanvas, x, y, width: w, height: h };
  }, [CANVAS_H, CANVAS_W]);

  const canSelectFromLasso = useCallback((lassoPoints) => {
    const bgCtx = bgCtxRef.current;
    if (!bgCtx || !lassoPoints?.length) return false;

    const bounds = getPointsBounds(lassoPoints);
    const x = Math.max(0, Math.floor(bounds.minX));
    const y = Math.max(0, Math.floor(bounds.minY));
    const w = Math.min(CANVAS_W - x, Math.ceil(bounds.width));
    const h = Math.min(CANVAS_H - y, Math.ceil(bounds.height));
    if (w <= 1 || h <= 1) return false;

    const imageData = bgCtx.getImageData(x, y, w, h).data;
    const step = 2;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const alpha = imageData[(py * w + px) * 4 + 3];
        if (alpha < 8) continue;
        if (pointInPolygon(x + px, y + py, lassoPoints)) return true;
      }
    }

    return false;
  }, [CANVAS_H, CANVAS_W]);

  const saveHistory = useCallback(() => {
    const data = bgCanvasRef.current.toDataURL();
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    const newHistory = currentHistory.slice(0, currentIndex + 1);
    newHistory.push(data);
    if (newHistory.length > 50) newHistory.shift();
    const newIndex = newHistory.length - 1;

    historyRef.current = newHistory;
    historyIndexRef.current = newIndex;
    setHistory(newHistory);
    setHistoryIndex(newIndex);
    pageStoreRef.current[activePageIdRef.current] = {
      history: newHistory,
      historyIndex: newIndex,
    };
  }, []);

  const restoreFromHistory = (index, sourceHistory = historyRef.current) => {
    const img = new Image();
    img.onload = () => {
      const ctx = bgCtxRef.current;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0);
    };
    img.src = sourceHistory[index];
  };

  const undo = () => {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (currentIndex <= 0) return;

    setSelection(null);
    selectionRef.current = null;

    const i = currentIndex - 1;
    historyIndexRef.current = i;
    setHistoryIndex(i);
    restoreFromHistory(i, currentHistory);
    pageStoreRef.current[activePageIdRef.current] = {
      history: currentHistory,
      historyIndex: i,
    };
    redrawFg();
  };

  const redo = () => {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (currentIndex >= currentHistory.length - 1) return;

    setSelection(null);
    selectionRef.current = null;

    const i = currentIndex + 1;
    historyIndexRef.current = i;
    setHistoryIndex(i);
    restoreFromHistory(i, currentHistory);
    pageStoreRef.current[activePageIdRef.current] = {
      history: currentHistory,
      historyIndex: i,
    };
    redrawFg();
  };

  const clearCanvas = () => {
    bgCtxRef.current.clearRect(0, 0, CANVAS_W, CANVAS_H);
    setSelection(null);
    selectionRef.current = null;
    redrawFg();
    saveHistory();
  };

  const switchPage = useCallback((pageId) => {
    const currentPageId = activePageIdRef.current;
    if (pageId === currentPageId) return;

    pageStoreRef.current[currentPageId] = {
      history: historyRef.current,
      historyIndex: historyIndexRef.current,
    };

    if (selectionRef.current) {
      commitSelectionToBoard(selectionRef.current);
      setSelection(null);
      selectionRef.current = null;
    }

    const nextState = pageStoreRef.current[pageId] || { history: [], historyIndex: -1 };
    pageStoreRef.current[pageId] = nextState;

    activePageIdRef.current = pageId;
    setActivePageId(pageId);
    historyRef.current = nextState.history;
    historyIndexRef.current = nextState.historyIndex;
    setHistory(nextState.history);
    setHistoryIndex(nextState.historyIndex);
    renderCanvasFromData(
      nextState.historyIndex >= 0 ? nextState.history[nextState.historyIndex] : null
    );
    redrawFg();

    if (nextState.history.length === 0) {
      setTimeout(() => {
        const canvas = bgCanvasRef.current;
        if (!canvas) return;
        const initialHistory = [canvas.toDataURL()];
        historyRef.current = initialHistory;
        historyIndexRef.current = 0;
        setHistory(initialHistory);
        setHistoryIndex(0);
        pageStoreRef.current[pageId] = {
          history: initialHistory,
          historyIndex: 0,
        };
      }, 0);
    }
  }, [commitSelectionToBoard, redrawFg, renderCanvasFromData]);

  const addPage = () => {
    const id = nextPageIdRef.current;
    nextPageIdRef.current += 1;
    setPages((prev) => [...prev, { id, name: `Page ${id}` }]);
    pageStoreRef.current[id] = { history: [], historyIndex: -1 };
    switchPage(id);
  };

  const renameActivePage = () => {
    const current = pages.find((p) => p.id === activePageId);
    if (!current) return;
    const nextName = window.prompt('Rename page', current.name);
    if (!nextName || !nextName.trim()) return;
    setPages((prev) => prev.map((p) => (
      p.id === activePageId ? { ...p, name: nextName.trim() } : p
    )));
  };

  const deleteActivePage = () => {
    if (pages.length <= 1) {
      clearCanvas();
      return;
    }
    const index = pages.findIndex((p) => p.id === activePageId);
    if (index < 0) return;

    const nextActive = pages[index + 1] || pages[index - 1];
    delete pageStoreRef.current[activePageId];
    setPages((prev) => prev.filter((p) => p.id !== activePageId));
    if (nextActive) switchPage(nextActive.id);
  };

  const moveActivePage = (direction) => {
    setPages((prev) => {
      const index = prev.findIndex((p) => p.id === activePageId);
      if (index < 0) return prev;
      const target = direction === 'left' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const importPdfAsPages = useCallback(async (file) => {
    if (!file) return;
    setIsImportingPdf(true);

    try {
      const pdfjsLib = await loadPdfJsLib();
      const buffer = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: buffer });
      const pdf = await task.promise;

      if (pdf.numPages <= 0) return;

      const importedPages = [];
      const importedStore = {};
      const margin = 120;

      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          (CANVAS_W - margin * 2) / base.width,
          (CANVAS_H - margin * 2) / base.height
        );
        const viewport = page.getViewport({ scale: Math.max(0.1, scale) });

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = CANVAS_W;
        pageCanvas.height = CANVAS_H;
        const pageCtx = pageCanvas.getContext('2d');
        pageCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = Math.ceil(viewport.width);
        renderCanvas.height = Math.ceil(viewport.height);
        await page.render({
          canvasContext: renderCanvas.getContext('2d'),
          viewport,
        }).promise;

        const x = (CANVAS_W - renderCanvas.width) / 2;
        const y = (CANVAS_H - renderCanvas.height) / 2;
        pageCtx.drawImage(renderCanvas, x, y);

        const data = pageCanvas.toDataURL('image/png');
        const id = nextPageIdRef.current;
        nextPageIdRef.current += 1;
        const name = `${file.name.replace(/\.pdf$/i, '')} - ${i}`;
        importedPages.push({ id, name });
        importedStore[id] = {
          history: [data],
          historyIndex: 0,
        };
      }

      if (importedPages.length > 0) {
        pageStoreRef.current[activePageIdRef.current] = {
          history: historyRef.current,
          historyIndex: historyIndexRef.current,
        };
        Object.assign(pageStoreRef.current, importedStore);
        setPages((prev) => [...prev, ...importedPages]);
        switchPage(importedPages[0].id);
      }
    } catch (error) {
      // Keep failure soft so existing drawing flow is unaffected.
      // eslint-disable-next-line no-alert
      alert('PDF import failed. Please try another PDF file.');
    } finally {
      setIsImportingPdf(false);
    }
  }, [CANVAS_H, CANVAS_W, switchPage]);

  // Convert screen coords to canvas coords
  const getCoords = (e) => {
    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const currentView = viewRef.current;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    // Inverse transform: screen -> canvas
    const canvasX = (screenX - currentView.panX) / currentView.zoom;
    const canvasY = (screenY - currentView.panY) / currentView.zoom;

    return [canvasX, canvasY, pressure];
  };

  const pushSmoothPoint = (coords) => {
    const pts = rawPointsRef.current;

    if (pts.length === 0) {
      pts.push(coords);
      return;
    }

    const [newX, newY, newPressure] = coords;
    const [lastX, lastY, lastPressure] = pts[pts.length - 1];

    // Filter pointer jitter, then densify gaps for smoother touchpad lines.
    // Keep stroke attached to pointer while still reducing jitter.
    const filteredX = lastX * 0.25 + newX * 0.75;
    const filteredY = lastY * 0.25 + newY * 0.75;
    const filteredPressure = lastPressure * 0.35 + newPressure * 0.65;

    const dx = filteredX - lastX;
    const dy = filteredY - lastY;
    const distance = Math.hypot(dx, dy);
    const maxStep = 1.2 / viewRef.current.zoom;
    const steps = Math.max(1, Math.ceil(distance / maxStep));

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      pts.push([
        lastX + dx * t,
        lastY + dy * t,
        lastPressure + (filteredPressure - lastPressure) * t,
      ]);
    }
  };

  const isOnlyCtrlPressed = useCallback(() => {
    const keys = [...pressedKeysRef.current].map((k) => k.toLowerCase());
    if (keys.length === 0) return false;
    return keys.every((k) => k === 'control' || k === 'meta');
  }, []);

  const finalizeCurrentStroke = useCallback(() => {
    if (!isDrawingRef.current) return;

    const pts = rawPointsRef.current;

    if (tool === 'pen' && pts.length >= 2) {
      const bgCtx = bgCtxRef.current;
      bgCtx.fillStyle = color;
      drawFreehandStroke(bgCtx, pts, getOpts(true, viewRef.current.zoom));
      saveHistory();
    } else if (tool === 'highlighter' && pts.length >= 2) {
      const bgCtx = bgCtxRef.current;
      bgCtx.save();
      bgCtx.globalAlpha = 0.28;
      bgCtx.fillStyle = color;
      const hiOpts = {
        ...getOpts(true, viewRef.current.zoom),
        size: ((lineWidth + 4) * 2.2) / viewRef.current.zoom,
        thinning: 0,
        smoothing: 0.8,
        streamline: 0.45,
      };
      drawFreehandStroke(bgCtx, pts, hiOpts);
      bgCtx.restore();
      saveHistory();
    } else if (tool === 'arrow' && pts.length >= 2) {
      const bgCtx = bgCtxRef.current;
      drawArrowStroke(
        bgCtx,
        pts[0],
        pts[pts.length - 1],
        Math.max(1, (lineWidth * 1.6) / viewRef.current.zoom),
        color
      );
      saveHistory();
    } else if (tool === 'shape' && pts.length >= 2) {
      const bgCtx = bgCtxRef.current;
      drawShapeStroke(
        bgCtx,
        shapeType,
        pts[0],
        pts[pts.length - 1],
        Math.max(1, (lineWidth * 1.8) / viewRef.current.zoom),
        color
      );
      saveHistory();
    } else if (tool === 'eraser') {
      saveHistory();
    } else if (tool === 'lasso' && pts.length >= 2 && isClosedLasso(pts, viewRef.current.zoom)) {
      const lassoPoints = pts.map(([x, y]) => [x, y]);
      if (canSelectFromLasso(lassoPoints)) {
        const nextSelection = buildSelectionFromLasso(lassoPoints);
        if (nextSelection) {
          setSelection(nextSelection);
          selectionRef.current = nextSelection;
          saveHistory();
        }
      }
    }

    rawPointsRef.current = [];
    isDrawingRef.current = false;
    isCtrlDrawingRef.current = false;
    redrawFg();
  }, [
    buildSelectionFromLasso,
    canSelectFromLasso,
    color,
    getOpts,
    lineWidth,
    redrawFg,
    saveHistory,
    shapeType,
    tool,
  ]);

  const startDrawing = (e) => {
    if (tool === 'pointer') {
      e.preventDefault();
      const wrapper = wrapperRef.current;
      const rect = wrapper.getBoundingClientRect();
      setLaserCursor({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      const [x, y] = getCoords(e);
      laserTrailRef.current = [[x, y]];
      laserIsDrawingRef.current = true;
      if (laserClearTimerRef.current) {
        clearTimeout(laserClearTimerRef.current);
        laserClearTimerRef.current = null;
      }
      redrawFg();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    if (tool === 'text') {
      e.preventDefault();
      const [x, y] = getCoords(e);
      const text = window.prompt('Enter text');
      if (text && text.trim()) {
        const bgCtx = bgCtxRef.current;
        const fontSize = Math.max(14, (lineWidth * 6) / viewRef.current.zoom);
        bgCtx.fillStyle = color;
        bgCtx.textBaseline = 'top';
        bgCtx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
        bgCtx.fillText(text.trim(), x, y);
        saveHistory();
      }
      return;
    }

    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const [cx, cy] = getCoords(e);
    const activeSelection = selectionRef.current;
    if (activeSelection) {
      const insideSelection = cx >= activeSelection.x
        && cx <= activeSelection.x + activeSelection.width
        && cy >= activeSelection.y
        && cy <= activeSelection.y + activeSelection.height;

      if (insideSelection) {
        isDraggingSelectionRef.current = true;
        selectionDragRef.current = {
          pointerId: e.pointerId,
          startX: cx,
          startY: cy,
          baseX: activeSelection.x,
          baseY: activeSelection.y,
        };
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        return;
      }

      commitSelectionToBoard(activeSelection);
      setSelection(null);
      selectionRef.current = null;
    }

    if (pointerPositionsRef.current.size === 2) {
      const wrapper = wrapperRef.current;
      const rect = wrapper.getBoundingClientRect();
      const points = [...pointerPositionsRef.current.values()];
      const a = points[0];
      const b = points[1];
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      const startDistance = Math.hypot(a.x - b.x, a.y - b.y);
      const screenX = centerX - rect.left;
      const screenY = centerY - rect.top;
      const base = viewTargetRef.current;
      const anchorCanvasX = (screenX - base.panX) / base.zoom;
      const anchorCanvasY = (screenY - base.panY) / base.zoom;

      pinchRef.current = {
        startDistance,
        startZoom: base.zoom,
        anchorCanvasX,
        anchorCanvasY,
      };

      // If second finger touches while drawing, switch cleanly to pinch.
      if (isDrawingRef.current) {
        fgCtxRef.current?.clearRect(0, 0, CANVAS_W, CANVAS_H);
        rawPointsRef.current = [];
        isDrawingRef.current = false;
      }
      return;
    }

    if (!e.isPrimary || pointerPositionsRef.current.size !== 1) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const coords = getCoords(e);
    rawPointsRef.current = [coords];
    isDrawingRef.current = true;
    isCtrlDrawingRef.current = false;
  };

  const draw = (e) => {
    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (tool === 'pointer') {
      const wrapper = wrapperRef.current;
      const rect = wrapper.getBoundingClientRect();
      setLaserCursor({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      if (!laserIsDrawingRef.current) return;
      e.preventDefault();
      const [x, y] = getCoords(e);
      laserTrailRef.current.push([x, y]);
      if (laserTrailRef.current.length > 120) {
        laserTrailRef.current.shift();
      }
      redrawFg();
      return;
    }

    if (pinchRef.current && pointerPositionsRef.current.size >= 2) {
      const wrapper = wrapperRef.current;
      const rect = wrapper.getBoundingClientRect();
      const points = [...pointerPositionsRef.current.values()];
      const a = points[0];
      const b = points[1];
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const baseDistance = Math.max(1, pinchRef.current.startDistance);
      const scale = distance / baseDistance;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.startZoom * scale));
      const screenX = centerX - rect.left;
      const screenY = centerY - rect.top;
      const newPanX = screenX - pinchRef.current.anchorCanvasX * newZoom;
      const newPanY = screenY - pinchRef.current.anchorCanvasY * newZoom;

      setViewTarget(newZoom, newPanX, newPanY, true);
      return;
    }

    if (isDraggingSelectionRef.current && selectionDragRef.current?.pointerId === e.pointerId) {
      e.preventDefault();
      const [cx, cy] = getCoords(e);
      const dx = cx - selectionDragRef.current.startX;
      const dy = cy - selectionDragRef.current.startY;
      const updated = {
        ...selectionRef.current,
        x: selectionDragRef.current.baseX + dx,
        y: selectionDragRef.current.baseY + dy,
      };
      setSelection(updated);
      selectionRef.current = updated;
      redrawFg();
      return;
    }

    if (
      (tool === 'pen' || tool === 'highlighter')
      && isCtrlPressedRef.current
      && isOnlyCtrlPressed()
      && !isDrawingRef.current
      && e.isPrimary
    ) {
      const coords = getCoords(e);
      rawPointsRef.current = [coords];
      isDrawingRef.current = true;
      isCtrlDrawingRef.current = true;
    }

    if (!isDrawingRef.current) return;
    if (!e.isPrimary) return;
    if (pointerPositionsRef.current.size !== 1) return;

    e.preventDefault();

    const samples = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    samples.forEach((sample) => {
      const coords = getCoords(sample);
      pushSmoothPoint(coords);
    });

    if (tool === 'eraser') {
      const bgCtx = bgCtxRef.current;
      const pts = rawPointsRef.current;
      if (pts.length >= 2) {
        bgCtx.globalCompositeOperation = 'destination-out';
        bgCtx.lineCap = 'round';
        bgCtx.lineJoin = 'round';
        bgCtx.lineWidth = eraserSize / viewRef.current.zoom;
        bgCtx.beginPath();
        bgCtx.moveTo(pts[pts.length - 2][0], pts[pts.length - 2][1]);
        bgCtx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        bgCtx.stroke();
        bgCtx.globalCompositeOperation = 'source-over';
      }
    } else {
      redrawFg(rawPointsRef.current);
    }
  };

  const stopDrawing = (e) => {
    if (e?.pointerId !== undefined) {
      pointerPositionsRef.current.delete(e.pointerId);
      try {
        if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore pointer-capture release errors to keep input state stable.
      }
    }

    if (tool === 'pointer') {
      laserIsDrawingRef.current = false;
      if (laserClearTimerRef.current) {
        clearTimeout(laserClearTimerRef.current);
      }
      laserClearTimerRef.current = setTimeout(() => {
        laserTrailRef.current = [];
        redrawFg();
      }, 700);
      if (e?.type === 'pointerleave' || e?.type === 'pointercancel') {
        setLaserCursor((prev) => ({ ...prev, visible: false }));
      }
      redrawFg();
      return;
    }

    if (isDraggingSelectionRef.current && selectionDragRef.current?.pointerId === e?.pointerId) {
      isDraggingSelectionRef.current = false;
      selectionDragRef.current = null;
      redrawFg();
      return;
    }

    if (pointerPositionsRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (!isDrawingRef.current) return;
    e?.preventDefault();
    finalizeCurrentStroke();
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      pressedKeysRef.current.add(e.key);
      if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlPressedRef.current = true;
      }
    };

    const onKeyUp = (e) => {
      pressedKeysRef.current.delete(e.key);
      if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlPressedRef.current = false;
        if (isCtrlDrawingRef.current) {
          finalizeCurrentStroke();
        }
      }
    };

    const onBlur = () => {
      pressedKeysRef.current.clear();
      isCtrlPressedRef.current = false;
      if (isCtrlDrawingRef.current) {
        finalizeCurrentStroke();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [finalizeCurrentStroke]);

  const handleZoomIn = () => {
    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const base = viewTargetRef.current;
    const canvasX = (cx - base.panX) / base.zoom;
    const canvasY = (cy - base.panY) / base.zoom;
    const newZoom = Math.min(MAX_ZOOM, base.zoom * 1.3);
    setViewTarget(newZoom, cx - canvasX * newZoom, cy - canvasY * newZoom);
  };

  const handleZoomOut = () => {
    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const base = viewTargetRef.current;
    const canvasX = (cx - base.panX) / base.zoom;
    const canvasY = (cy - base.panY) / base.zoom;
    const newZoom = Math.max(MIN_ZOOM, base.zoom / 1.3);
    setViewTarget(newZoom, cx - canvasX * newZoom, cy - canvasY * newZoom);
  };

  const handleZoomReset = () => {
    setViewTarget(1, 0, 0);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      importPdfAsPages(file);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setOverlayImage(ev.target.result);
      setShowImageOverlay(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const closeImageOverlay = () => {
    setShowImageOverlay(false);
    setOverlayImage(null);
  };

  const handlePlaceSelection = () => {
    const sel = selectionRef.current;
    if (!sel) return;
    commitSelectionToBoard(sel);
    setSelection(null);
    selectionRef.current = null;
    redrawFg();
  };

  const handleDeleteSelection = () => {
    if (!selectionRef.current) return;
    setSelection(null);
    selectionRef.current = null;
    redrawFg();
  };

  const handleCopySelection = () => {
    const sel = selectionRef.current;
    if (!sel) return;
    const bgCtx = bgCtxRef.current;
    const offset = 24;
    bgCtx.drawImage(sel.canvas, sel.x + offset, sel.y + offset);
    saveHistory();
  };

  const canvasTransform = {
    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
    transformOrigin: '0 0',
  };

  const toScreenRect = (rect) => {
    const v = viewRef.current;
    return {
      left: rect.x * v.zoom + v.panX,
      top: rect.y * v.zoom + v.panY,
      width: rect.width * v.zoom,
      height: rect.height * v.zoom,
    };
  };

  return (
    <div className="whiteboard-container">
      <div className="canvas-wrapper" ref={wrapperRef}>
        <div
          className={`board-surface pattern-${boardPattern} ${isDarkHexColor(boardColor) ? 'dark-board' : 'light-board'}`}
          style={{
            '--board-bg': boardColor,
            '--grid-line-color': hexToRgba(gridColor, 0.24),
            '--dot-color': hexToRgba(gridColor, 0.45),
          }}
        />
        <div className="canvas-transform" style={canvasTransform}>
          <canvas ref={bgCanvasRef} className="drawing-canvas bg-canvas" />
          <canvas ref={fgCanvasRef} className="drawing-canvas fg-canvas" />
        </div>
        <div
          className={`event-layer ${tool === 'pointer' ? 'pointer-mode' : ''}`}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
        />
        {tool === 'pointer' && laserCursor.visible && (
          <div
            className="laser-pointer-cursor"
            style={{ left: laserCursor.x, top: laserCursor.y }}
          />
        )}
        {selection && (
          <div
            className="selection-menu"
            style={{
              left: toScreenRect(selection).left,
              top: toScreenRect(selection).top - 44,
            }}
          >
            <button className="selection-btn primary" onClick={handlePlaceSelection}>
              Place
            </button>
            <button className="selection-btn" onClick={handleCopySelection}>
              Copy
            </button>
            <button className="selection-btn danger" onClick={handleDeleteSelection}>
              Delete
            </button>
          </div>
        )}
      </div>
      {isPagesVisible ? (
        <div className="pages-bar">
          <button
            className="page-panel-btn"
            onClick={() => setIsPagesDropdownOpen((v) => !v)}
            title="Show/Hide Pages"
          >
            Pages ({pages.length}) {isPagesDropdownOpen ? '▲' : '▼'}
          </button>
          <button className="page-add-btn" onClick={addPage} title="Add Page">
            + Page
          </button>
          <button className="page-hide-btn" onClick={renameActivePage} title="Rename Active Page">
            Rename
          </button>
          <button className="page-hide-btn" onClick={() => moveActivePage('left')} title="Move Left">
            ◀
          </button>
          <button className="page-hide-btn" onClick={() => moveActivePage('right')} title="Move Right">
            ▶
          </button>
          <button className="page-hide-btn danger" onClick={deleteActivePage} title="Delete Active Page">
            Delete
          </button>
          <button
            className="page-hide-btn"
            onClick={() => setIsPagesVisible(false)}
            title="Hide Pages"
          >
            Hide
          </button>
          {isImportingPdf && <span className="pdf-import-status">Importing PDF...</span>}
          {isPagesDropdownOpen && (
            <div className="page-tabs">
              {pages.map((page) => (
                <button
                  key={page.id}
                  className={`page-tab ${page.id === activePageId ? 'active' : ''}`}
                  onClick={() => switchPage(page.id)}
                  title={page.name}
                >
                  {page.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          className="pages-toggle-fab"
          onClick={() => setIsPagesVisible(true)}
          title="Show Pages"
        >
          Pages
        </button>
      )}
      {isToolbarVisible ? (
        <Toolbar
          colors={penColors}
          activeColor={color}
          onColorChange={handlePenColorChange}
          boardColor={boardColor}
          onBoardColorChange={setBoardColor}
          boardBackgroundPresets={BOARD_BACKGROUNDS}
          boardPattern={boardPattern}
          onBoardPatternChange={setBoardPattern}
          gridColor={gridColor}
          onGridColorChange={setGridColor}
          lineWidth={lineWidth}
          onLineWidthChange={setLineWidth}
          eraserSize={eraserSize}
          onEraserSizeChange={setEraserSize}
          tool={tool}
          onToolChange={setTool}
          shapeType={shapeType}
          onShapeTypeChange={setShapeType}
          strokeType={strokeType}
          onStrokeTypeChange={setStrokeType}
          onUndo={undo}
          onRedo={redo}
          onClear={clearCanvas}
          onImageUpload={handleImageUpload}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onToggleVisibility={() => setIsToolbarVisible(false)}
        />
      ) : (
        <button
          className="toolbar-toggle-fab"
          onClick={() => setIsToolbarVisible(true)}
          title="Show Toolbar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
      )}
      {showImageOverlay && overlayImage && (
        <ImageOverlay
          imageSrc={overlayImage}
          onClose={closeImageOverlay}
          color={color}
          lineWidth={lineWidth}
        />
      )}
    </div>
  );
};

export default Whiteboard;
