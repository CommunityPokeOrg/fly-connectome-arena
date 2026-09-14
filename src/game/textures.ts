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

export function createHexPlateTexture(): CanvasTexture {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = '#071326';
    context.fillRect(0, 0, size, size);
    const radius = 22;
    for (let row = -1; row < 8; row += 1) {
      for (let column = -1; column < 8; column += 1) {
        const x = column * radius * 1.72 + (row % 2) * radius * 0.86;
        const y = row * radius * 1.5;
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = Math.PI / 6 + index * Math.PI / 3;
          const pointX = x + Math.cos(angle) * radius * 0.82;
          const pointY = y + Math.sin(angle) * radius * 0.82;
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        }
        context.closePath();
        context.fillStyle = (row + column) % 3 === 0 ? '#0b1d34' : '#09182b';
        context.fill();
        context.strokeStyle = '#164762';
        context.lineWidth = 1.5;
        context.stroke();
        if ((row * 7 + column) % 5 === 0) {
          context.fillStyle = '#8d394c55';
          context.fillRect(x - 5, y - 2, 11, 3);
        }
      }
    }
  });
}

export function createMetalWallTexture(): CanvasTexture {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = '#111827';
    context.fillRect(0, 0, size, size);
    for (let index = 0; index < 8; index += 1) {
      const offset = index * 32;
      context.fillStyle = index % 2 === 0 ? '#182940' : '#122136';
      context.fillRect(offset + 2, 0, 27, size);
      context.fillStyle = '#36d8ed';
      context.globalAlpha = 0.22;
      context.fillRect(offset, 0, 2, size);
      context.globalAlpha = 1;
      context.fillStyle = '#00000044';
      context.fillRect(offset + 4, 8, 19, 2);
      context.fillRect(offset + 4, size - 12, 19, 2);
    }
  });
}

export function createWarningStripeTexture(): CanvasTexture {
  return canvasTexture(128, (context, size) => {
    context.fillStyle = '#2b1029';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#ffd447';
    for (let x = -size; x < size * 2; x += 26) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 15, 0);
      context.lineTo(x - 35, size);
      context.lineTo(x - 50, size);
      context.closePath();
      context.fill();
    }
  });
}
