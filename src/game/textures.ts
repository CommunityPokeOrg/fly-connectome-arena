import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  draw(context, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createWingVenationTexture(): CanvasTexture {
  const texture = canvasTexture(256, (context, size) => {
    context.clearRect(0, 0, size, size);
    // transparent membrane with dark vein strokes fanning from the root edge
    context.fillStyle = 'rgba(210, 200, 170, 0.16)';
    context.fillRect(0, 0, size, size);
    context.strokeStyle = 'rgba(40, 30, 22, 0.85)';
    context.lineWidth = 2;
    for (let index = 0; index < 7; index += 1) {
      const spread = (index / 6 - 0.5) * 1.8;
      context.beginPath();
      context.moveTo(0, size * 0.5);
      context.bezierCurveTo(
        size * 0.3, size * (0.5 + spread * 0.35),
        size * 0.7, size * (0.5 + spread * 0.75),
        size, size * (0.5 + spread),
      );
      context.stroke();
    }
    context.lineWidth = 1;
    for (let x = size * 0.25; x < size; x += size * 0.12) {
      context.beginPath();
      context.moveTo(x, size * 0.2);
      context.lineTo(x + 6, size * 0.8);
      context.stroke();
    }
  });
  texture.repeat.set(1, 1);
  return texture;
}
