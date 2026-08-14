import React, { useEffect, useRef } from 'react';

interface OscillogramProps {
  timeData: Float32Array | null;
}

export const Oscillogram: React.FC<OscillogramProps> = ({ timeData }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      // Background clear
      ctx.fillStyle = isDark ? '#0a0e17' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Grid line
      ctx.strokeStyle = isDark ? '#182236' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (timeData && timeData.length > 0) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = isDark ? '#00f0ff' : '#0284c7';
        ctx.shadowColor = isDark ? '#00f0ff' : 'transparent';
        ctx.shadowBlur = isDark ? 8 : 0;

        ctx.beginPath();
        const sliceWidth = width / timeData.length;
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i];
          const y = ((v + 1) / 2) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow
      } else {
        // Flat line idle state
        ctx.strokeStyle = isDark ? '#1e293b' : '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [timeData]);

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="visualizer-canvas"
        width={400}
        height={180}
      />
    </div>
  );
};
