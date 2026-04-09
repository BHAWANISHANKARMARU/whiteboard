import React, { useRef, useState, useEffect } from 'react';
import './ImageOverlay.css';

const ImageOverlay = ({ imageSrc, onClose, color, lineWidth }) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef(null);
  const velocityRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    const img = new Image();
    img.onload = () => {
      // Fit image in container
      const maxW = container.clientWidth - 40;
      const maxH = container.clientHeight - 40;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;

      canvas.width = w * 2;
      canvas.height = h * 2;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctxRef.current = ctx;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const getCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const coords = getCoords(e);
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.85;

    lastPointRef.current = coords;
    velocityRef.current = 0;
    lastTimeRef.current = Date.now();
    setIsDrawing(true);

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    const coords = getCoords(e);
    const ctx = ctxRef.current;
    if (!ctx) return;

    const last = lastPointRef.current;
    const now = Date.now();
    const dt = now - lastTimeRef.current;
    const dist = Math.sqrt((coords.x - last.x) ** 2 + (coords.y - last.y) ** 2);
    const velocity = dt > 0 ? dist / dt : 0;
    velocityRef.current = velocityRef.current * 0.6 + velocity * 0.4;

    const speedFactor = Math.max(0.3, 1 - velocityRef.current * 0.0015);
    ctx.lineWidth = lineWidth * speedFactor;

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    const midX = (last.x + coords.x) / 2;
    const midY = (last.y + coords.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, midX, midY);
    ctx.stroke();

    lastPointRef.current = coords;
    lastTimeRef.current = now;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = ctxRef.current;
    if (ctx) ctx.globalAlpha = 1;
    setIsDrawing(false);
  };

  return (
    <div className="image-overlay-backdrop" onClick={onClose}>
      <div className="image-overlay-container" onClick={(e) => e.stopPropagation()}>
        <button className="overlay-close-btn" onClick={onClose} title="Close (drawing won't be saved)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <p className="overlay-hint">Draw on the image. Closing discards all changes.</p>
        <div className="image-canvas-wrap">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="image-canvas"
          />
        </div>
      </div>
    </div>
  );
};

export default ImageOverlay;
