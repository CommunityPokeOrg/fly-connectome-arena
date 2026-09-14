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

function speckle(
  context: CanvasRenderingContext2D,
  size: number,
  count: number,
  colors: string[],
  minRadius: number,
  maxRadius: number,
): void {
  let state = 123456789;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let index = 0; index < count; index += 1) {
    const radius = minRadius + next() * (maxRadius - minRadius);
    context.fillStyle = colors[Math.floor(next() * colors.length)] ?? colors[0]!;
    context.globalAlpha = 0.12 + next() * 0.3;
    context.beginPath();
    context.arc(next() * size, next() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export function createMossFloorTexture(): CanvasTexture {
  const texture = canvasTexture(512, (context, size) => {
    context.fillStyle = '#26301e';
    context.fillRect(0, 0, size, size);
    speckle(context, size, 900, ['#2f3d24', '#3d4b2a', '#22301c', '#4a4326', '#31402b'], 6, 26);
    speckle(context, size, 500, ['#1c2417', '#55603a', '#3a2f22'], 2, 8);
    speckle(context, size, 120, ['#6a7040', '#8a7a4c'], 1, 3);
  });
  texture.repeat.set(4, 4);
  return texture;
}

export function createStoneTexture(): CanvasTexture {
  return canvasTexture(256, (context, size) => {
    context.fillStyle = '#5a5d58';
    context.fillRect(0, 0, size, size);
    speckle(context, size, 320, ['#4c4f4a', '#686b64', '#3f423e', '#767a70'], 4, 18);
    speckle(context, size, 140, ['#33362f', '#8b8f83'], 1, 4);
    // faint horizontal weathering bands
    context.globalAlpha = 0.1;
    for (let y = 0; y < size; y += 24) {
      context.fillStyle = y % 48 === 0 ? '#2f322d' : '#787c72';
      context.fillRect(0, y, size, 6);
    }
    context.globalAlpha = 1;
  });
}

export function createBarkTexture(): CanvasTexture {
  return canvasTexture(128, (context, size) => {
    context.fillStyle = '#2b241d';
    context.fillRect(0, 0, size, size);
    let state = 987654321;
    const next = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let x = 0; x < size; x += 6) {
      context.strokeStyle = next() > 0.5 ? '#1e1811' : '#3a3025';
      context.globalAlpha = 0.5 + next() * 0.4;
      context.lineWidth = 1 + next() * 2;
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + next() * 8 - 4, size * 0.33, x + next() * 8 - 4, size * 0.66, x, size);
      context.stroke();
    }
    context.globalAlpha = 1;
  });
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
