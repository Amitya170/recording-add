import React, { useEffect, useRef } from 'react';

interface SpectrumProps {
  freqData: Uint8Array | null;
}

export const Spectrum: React.FC<SpectrumProps> = ({ freqData }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakHoldRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);

      if (freqData && freqData.length > 0) {
        const barCount = 48;
        const barWidth = width / barCount - 2;

        if (peakHoldRef.current.length !== barCount) {
          peakHoldRef.current = new Array(barCount).fill(0);
        }

        // Gradient for Spectrum Bars
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#00f0ff');
        gradient.addColorStop(0.6, '#ffb700');
        gradient.addColorStop(1.0, '#ff2a5f');

        ctx.fillStyle = gradient;

        for (let i = 0; i < barCount; i++) {
          // Logarithmic bin sampling
          const binIdx = Math.floor(Math.pow(i / barCount, 2) * (freqData.length / 2));
          const val = freqData[binIdx] || 0;
          const barHeight = (val / 255) * height;

          // Peak decay hold
          if (barHeight > peakHoldRef.current[i]) {
            peakHoldRef.current[i] = barHeight;
          } else {
            peakHoldRef.current[i] = Math.max(0, peakHoldRef.current[i] - 1.5);
          }

          const x = i * (barWidth + 2);
          const y = height - barHeight;

          // Render bar
          ctx.fillRect(x, y, barWidth, barHeight);

          // Render peak hold indicator line
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, height - peakHoldRef.current[i] - 2, barWidth, 2);
          ctx.fillStyle = gradient;
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [freqData]);

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
