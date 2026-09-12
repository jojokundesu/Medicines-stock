// Canvas-based texture helpers for readable in-world labels.
import * as THREE from 'three';

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy + lineHeight;
}

/** Label for a medicine box: product name + MRP. */
export function productLabel(name: string, mrp: number, pack: number, partialAllowed: boolean, unit: number | null): THREE.CanvasTexture {
  return canvasTexture(512, 320, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = '#0f766e';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 310);
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DUKAAN MEDICOS', 256, 44);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 34px system-ui, sans-serif';
    const bottom = wrapText(ctx, name, 256, 120, 460, 40);

    ctx.fillStyle = '#0f766e';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(`MRP ₹${mrp}`, 256, bottom + 30);

    ctx.fillStyle = '#6b7280';
    ctx.font = '26px system-ui, sans-serif';
    const sub = partialAllowed && unit != null
      ? `Strip of ${pack}  •  ₹${unit} / unit`
      : `Pack of ${pack}`;
    ctx.fillText(sub, 256, bottom + 68);
  });
}

const NOTE_COLORS: Record<string, string> = {
  n10: '#c17a3f', n20: '#4f9d5d', n50: '#7b6fc0', n100: '#6f9fbd',
  n200: '#d9a62e', n500: '#9aa0a6', n2000: '#b04a8b',
  c1: '#8c8c8c', c2: '#a9a9a9', c5: '#8c8c8c', c10: '#c9a227', c20: '#c9a227'
};

/** Currency note texture (portrait). */
export function noteTexture(id: string, label: string): THREE.CanvasTexture {
  const color = NOTE_COLORS[id] || '#999';
  return canvasTexture(256, 512, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(12, 12, 232, 488);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, 216, 472);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 60px system-ui, sans-serif';
    ctx.fillText(label, 128, 268);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillText('₹', 128, 320);
  });
}
