import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * The Earth as a real object: a metal globe, the kind that sits inside a brass armillary sphere.
 * Land is raised, polished brass. Sea is dark, brushed bronze. Nothing is painted on: day and
 * night come from one real light placed where the Sun actually is, so the highlight slides
 * across the metal as time moves.
 *
 * Everything else in the app is flat ink. The Earth is the one physical thing, which is the point.
 *
 * The satellite photo is only read as data (where land is, how rough the terrain is) and turned
 * into three maps: colour, roughness and height.
 */

const W = 2048;
const H = 1024;

const BRASS = [201, 162, 82]; // polished land
const BRASS_DEEP = [150, 112, 52]; // forests and rock: slightly darker, less polished
const BRONZE = [44, 36, 30]; // the sea

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

export function createDayNightMaterial() {
  const material = new MeshStandardMaterial({
    color: new Color('#3a2f27'),
    metalness: 1,
    roughness: 0.5,
    emissive: new Color('#ffcf8a'), // city lights, warm like sodium lamps
    emissiveIntensity: 0,
  });

  const img = new Image();
  img.onload = () => {
    const [src, sctx] = canvas();
    sctx.drawImage(img, 0, 0, W, H);
    const px = sctx.getImageData(0, 0, W, H).data;

    const [colC, colX] = canvas();
    const [roughC, roughX] = canvas();
    const [maskC, maskX] = canvas();
    const col = colX.createImageData(W, H);
    const rough = roughX.createImageData(W, H);
    const mask = maskX.createImageData(W, H);

    for (let i = 0; i < W * H; i++) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      const land = b - Math.max(r, g) * 1.08 < 4; // water is the only thing clearly bluer than red or green
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const dark = land ? Math.min(1, Math.max(0, (0.5 - luma) * 2)) : 0; // forest / rock
      const o = i * 4;
      for (let k = 0; k < 3; k++)
        col.data[o + k] = land ? BRASS[k] + (BRASS_DEEP[k] - BRASS[k]) * dark : BRONZE[k];
      // roughness lives in the green channel: land polished, sea brushed
      const rv = land ? 0.2 + dark * 0.22 : 0.52;
      rough.data[o] = rough.data[o + 1] = rough.data[o + 2] = rv * 255;
      // height: land stands proud of the sea, mountains (bright or very dark terrain) a little more
      const hv = land ? 150 + luma * 60 : 0;
      mask.data[o] = mask.data[o + 1] = mask.data[o + 2] = hv;
      col.data[o + 3] = rough.data[o + 3] = mask.data[o + 3] = 255;
    }
    colX.putImageData(col, 0, 0);
    roughX.putImageData(rough, 0, 0);
    maskX.putImageData(mask, 0, 0);

    // soften the height map a touch so coasts become a bevel, like cast metal, not a cliff
    const [bumpC, bumpX] = canvas();
    bumpX.filter = 'blur(1.6px)';
    bumpX.drawImage(maskC, 0, 0);

    const tex = (c: HTMLCanvasElement, srgb = false) => {
      const t = new CanvasTexture(c);
      t.wrapS = RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = SRGBColorSpace;
      return t;
    };
    material.color.set('#ffffff');
    material.map = tex(colC, true);
    material.roughnessMap = tex(roughC);
    material.roughness = 1;
    material.bumpMap = tex(bumpC);
    material.bumpScale = 2.2;
    material.needsUpdate = true;
    void src;
  };
  img.src = '/textures/earth-day.jpg';

  // city lights: the night photo glows faintly through the metal, visible only where the Sun is not
  const lights = new Image();
  lights.onload = () => {
    const [c, x] = canvas();
    x.drawImage(lights, 0, 0, W, H);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    material.emissiveMap = t;
    material.emissiveIntensity = 0.9;
    material.needsUpdate = true;
  };
  lights.src = '/textures/earth-night.jpg';

  return material;
}
