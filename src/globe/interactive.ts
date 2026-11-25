import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three';

/**
 * Everything you can touch on the globe, built as solid engraved objects in the 3D scene:
 * flat ink faces with a darker plate on the sides and cut edge lines, so they read like the
 * armillary's line work but have real thickness, catch the camera at an angle and slip behind
 * the planet.
 *
 * Each kind has its own idle life and its own answer to the pointer:
 *   fireball star   turns slowly, tilting so its thickness shows. Hover: it rises off the ground,
 *                   swells and does one full somersault.
 *   ISS diamond     spins on its axis with its panels half folded. Hover: it climbs, the panels
 *                   swing open and the spin quickens.
 *   night handle    a bead in a gimbal ring. Hover: the ring swings round the bead and the bead
 *                   swells. Dragging lights the ring in fire.
 *
 * Hover also raises a label in the scene itself: a small printed plate on a leader line that
 * grows up out of the object, so it sits in 3D with everything else.
 */

const cssInk = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Critically damped spring toward `to`: quick, and never wobbles past. */
interface Spring {
  x: number;
  v: number;
}
const spring = (s: Spring, to: number, omega: number, dt: number) => {
  if (reduced.matches) return void ((s.x = to), (s.v = 0));
  const e = Math.exp(-omega * dt);
  const d = s.x - to;
  const k = (s.v + omega * d) * dt;
  s.x = to + (d + k) * e;
  s.v = (s.v - omega * k) * e;
};
const sp = (x = 0): Spring => ({ x, v: 0 });

export type Kind = 'fireball' | 'iss' | 'handle';

export interface Touchable {
  kind: Kind;
  /** the object globe.gl places on the surface; local +Z points away from the planet */
  root: Group;
  setAlpha(a: number): void;
  setHover(on: boolean): void;
  setActive(on: boolean): void;
  label: string;
  tick(dt: number, t: number): void;
}

// ---------------------------------------------------------------- materials

interface Inks {
  fire: Color;
  type: Color;
  planet: Color;
  shade: Color;
  ground: Color;
}
const inks = (): Inks => ({
  fire: new Color(cssInk('--ink-fire', '#e8743b')),
  type: new Color(cssInk('--ink-type', '#f1e6c8')),
  planet: new Color(cssInk('--ink-planet', '#5b6fb5')),
  shade: new Color(cssInk('--ink-planet-shade', '#2a3558')),
  ground: new Color(cssInk('--ink-ground', '#0e1524')),
});

/** Flat ink for faces, the same ink darkened for sides (the second plate), cut lines for edges. */
function engraved(face: Color) {
  const faceMat = new MeshBasicMaterial({ color: face, transparent: true, toneMapped: false });
  const sideMat = new MeshBasicMaterial({
    color: face.clone().multiplyScalar(0.55),
    transparent: true,
    toneMapped: false,
  });
  const lineMat = new LineBasicMaterial({ color: inks().ground, transparent: true, toneMapped: false });
  return { faceMat, sideMat, lineMat, all: [faceMat, sideMat, lineMat] as Material[] };
}
const withEdges = (geo: BufferGeometry, mats: Material | Material[], lineMat: LineBasicMaterial) => {
  const g = new Group();
  g.add(new Mesh(geo, mats));
  g.add(new LineSegments(new EdgesGeometry(geo, 25), lineMat));
  return g;
};
const setOpacity = (mats: Material[], a: number) => {
  for (const m of mats) {
    m.opacity = a;
    m.visible = a > 0.003;
  }
};

// ---------------------------------------------------------------- fireball star

function starShape(outer: number, inner: number) {
  const s = new Shape();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 4 + Math.PI / 2;
    const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function fireballStar(size: number, label: string, twinklePhase = Math.random() * 6.28): Touchable {
  const ink = inks();
  const { faceMat, sideMat, lineMat, all } = engraved(ink.fire);
  const geo = new ExtrudeGeometry(starShape(size * 0.5, size * 0.13), {
    depth: size * 0.16,
    bevelEnabled: true,
    bevelThickness: size * 0.04,
    bevelSize: size * 0.03,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -size * 0.08);
  const body = withEdges(geo, [faceMat, sideMat], lineMat);
  const pivot = new Group(); // hover lift + somersault happen here
  pivot.add(body);
  const root = new Group();
  root.add(pivot);

  const hover = sp();
  const flip = sp();
  let flipTarget = 0;
  let hoverOn = false;
  let alpha = 1;
  const phase = Math.random() * Math.PI * 2;
  const spin = 0.35 + Math.random() * 0.2;
  let active = 0;

  return {
    kind: 'fireball',
    root,
    label,
    setAlpha(a) {
      alpha = a;
      setOpacity(all, a);
    },
    setHover(on) {
      if (on && !hoverOn) flipTarget += Math.PI * 2; // one somersault per arrival
      hoverOn = on;
    },
    setActive(on) {
      active = on ? 1 : 0;
    },
    tick(dt, t) {
      spring(hover, hoverOn || active ? 1 : 0, 11, dt);
      spring(flip, flipTarget, 7, dt);
      const h = hover.x;
      const idle = reduced.matches ? 0 : t;
      // idle: a slow turn about the ground normal, tipped a little so the extrusion shows
      body.rotation.z = idle * spin + phase;
      pivot.rotation.x = 0.35 + 0.12 * Math.sin(idle * 0.8 + phase) + flip.x;
      pivot.position.z = size * (0.25 + 0.9 * h);
      // a slow twinkle: each star breathes on its own phase, so the field never looks frozen
      const breathe = 1 + 0.14 * Math.sin(idle * 2.1 + twinklePhase) * (1 - h);
      pivot.scale.setScalar((1 + 0.38 * h) * breathe);
      faceMat.color.copy(ink.fire).lerp(ink.type, 0.28 * h); // it runs hotter while you hold it
      setOpacity(all, Math.min(1, alpha + 0.3 * h));
    },
  };
}

// ---------------------------------------------------------------- ISS diamond

export function issDiamond(label: string): Touchable {
  const ink = inks();
  const { faceMat, sideMat, lineMat, all } = engraved(ink.type);
  // the legend's diamond, made solid: faces alternate between the two plates so it reads as cut
  const geo = new OctahedronGeometry(2.6, 0).toNonIndexed();
  geo.clearGroups();
  const faces = geo.getAttribute('position').count / 3;
  for (let f = 0; f < faces; f++) geo.addGroup(f * 3, 3, f % 2);
  geo.scale(1, 1, 0.7);
  const diamond = withEdges(geo, [faceMat, sideMat], lineMat);

  const panel = engraved(ink.planet);
  const panelGeo = new BoxGeometry(4.2, 1.5, 0.25);
  const wings = [-1, 1].map((side) => {
    const hinge = new Group();
    const w = withEdges(panelGeo, [panel.sideMat, panel.sideMat, panel.sideMat, panel.sideMat, panel.faceMat, panel.faceMat], panel.lineMat);
    w.position.x = side * 2.1; // hinge at the diamond's edge
    hinge.add(w);
    hinge.position.x = side * 1.9;
    return { hinge, side };
  });
  const body = new Group();
  body.add(diamond, ...wings.map((w) => w.hinge));
  const pivot = new Group();
  pivot.add(body);
  const root = new Group();
  root.add(pivot);
  const mats = [...all, ...panel.all];

  const hover = sp();
  const spinRate = sp(0.6);
  let angle = 0;
  // globe.gl moves the station once a second; carry it across each jump instead of teleporting
  const lastPos = new Vector3();
  const glide = new Vector3();
  const jump = new Vector3();
  const inv = new Quaternion();
  let placed = false;
  let hoverOn = false;
  let alpha = 1;
  return {
    kind: 'iss',
    root,
    label,
    setAlpha(a) {
      alpha = a;
      setOpacity(mats, a);
    },
    setHover(on) {
      hoverOn = on;
    },
    setActive() {},
    tick(dt, t) {
      spring(hover, hoverOn ? 1 : 0, 10, dt);
      spring(spinRate, hoverOn ? 3.2 : 0.6, 4, dt);
      const h = hover.x;
      if (!reduced.matches) angle += spinRate.x * dt;
      body.rotation.z = angle; // spins about the line to the planet's centre
      pivot.rotation.x = 0.5 + 0.08 * Math.sin(t * 1.3); // nodding a touch on its orbit
      if (!root.position.equals(lastPos)) {
        if (placed && !reduced.matches && root.position.distanceTo(lastPos) < 30) {
          jump.copy(lastPos).sub(root.position).applyQuaternion(inv.copy(root.quaternion).invert());
          glide.add(jump);
        }
        lastPos.copy(root.position);
        placed = true;
      }
      glide.multiplyScalar(Math.exp(-dt * 2.2)); // eases out over about a second, meeting the next fix
      pivot.position.copy(glide);
      pivot.position.z += 1.5 + 4 * h;
      pivot.scale.setScalar(1 + 0.25 * h);
      // panels half folded at rest, swinging fully open on hover
      for (const w of wings) w.hinge.rotation.y = w.side * (1 - h) * 0.9;
      setOpacity(mats, Math.min(1, alpha + 0.3 * h));
    },
  };
}

// ---------------------------------------------------------------- night handle

export function nightHandle(): Touchable {
  const ink = inks();
  const bead = engraved(ink.type);
  const ring = engraved(ink.type);
  const beadMesh = withEdges(new SphereGeometry(1.5, 16, 10), bead.faceMat, bead.lineMat);
  // the ring stands upright on the surface, like a gimbal round the bead
  const ringMesh = withEdges(new TorusGeometry(3.2, 0.38, 8, 40), ring.faceMat, ring.lineMat);
  const gimbal = new Group();
  gimbal.add(ringMesh);
  ringMesh.rotation.x = Math.PI / 2;
  const pivot = new Group();
  pivot.add(beadMesh, gimbal);
  pivot.position.z = 3;
  const root = new Group();
  root.add(pivot);
  const mats = [...bead.all, ...ring.all];

  const hover = sp();
  const grab = sp();
  const swing = sp();
  let hoverOn = false;
  let active = false;
  let alpha = 1;
  return {
    kind: 'handle',
    root,
    label: 'Drag the night · double-click for now',
    setAlpha(a) {
      alpha = a;
      setOpacity(mats, a);
    },
    setHover(on) {
      hoverOn = on;
    },
    setActive(on) {
      active = on;
    },
    tick(dt, t) {
      spring(hover, hoverOn || active ? 1 : 0, 12, dt);
      spring(grab, active ? 1 : 0, 16, dt);
      spring(swing, hoverOn || active ? Math.PI / 2 : 0, 6, dt);
      const h = hover.x;
      const idle = reduced.matches ? 0 : t;
      // the ring swings a quarter turn round the bead to face you, and keeps drifting while held
      gimbal.rotation.z = swing.x + (active ? idle * 2 : 0) + 0.15 * Math.sin(idle * 0.9);
      beadMesh.scale.setScalar(1 + 0.45 * h - 0.15 * grab.x); // a squeeze when you take hold
      gimbal.scale.setScalar(1 + 0.25 * h);
      ring.faceMat.color.copy(ink.type).lerp(ink.fire, grab.x);
      setOpacity(mats, alpha);
    },
  };
}

// ---------------------------------------------------------------- 3D hover labels

/** A printed plate on a leader line that grows up out of the object it names. */
export function createLabels(scene: Scene) {
  interface Live {
    sprite: Sprite;
    line: Line;
    target: Object3D;
    t: Spring;
    on: boolean;
    w: number;
    h: number;
  }
  const live: Live[] = [];
  const up = new Vector3();
  const at = new Vector3();
  const q = new Quaternion();

  const plate = (text: string) => {
    const ink = inks();
    const font = `400 44px "Londrina Solid", "Arial Narrow", sans-serif`;
    const c = document.createElement('canvas');
    const x = c.getContext('2d')!;
    x.font = font;
    const pad = 18;
    const words = text.toUpperCase();
    const tw = Math.ceil(x.measureText(words).width);
    c.width = tw + pad * 2;
    c.height = 64;
    x.font = font;
    x.fillStyle = `#${ink.ground.getHexString()}`;
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = `#${ink.type.getHexString()}`;
    x.lineWidth = 4;
    x.strokeRect(2, 2, c.width - 4, c.height - 4);
    x.fillStyle = `#${ink.type.getHexString()}`;
    x.textBaseline = 'middle';
    x.fillText(words, pad, c.height / 2 + 2);
    const tex = new CanvasTexture(c);
    tex.anisotropy = 4;
    return { tex, aspect: c.width / c.height };
  };

  const show = (target: Object3D, text: string) => {
    for (const l of live) if (l.target === target) return void (l.on = true);
    const { tex, aspect } = plate(text);
    const sprite = new Sprite(
      new SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    sprite.center.set(0, 0); // anchored at its lower-left corner, on the end of the leader
    sprite.renderOrder = 20;
    const line = new Line(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3)),
      new LineBasicMaterial({ color: inks().type, transparent: true, opacity: 0, toneMapped: false }),
    );
    line.renderOrder = 19;
    line.frustumCulled = false;
    scene.add(line, sprite);
    const h = 4.2;
    live.push({ sprite, line, target, t: sp(), on: true, w: h * aspect, h });
  };
  const hide = (target: Object3D) => {
    for (const l of live) if (l.target === target) l.on = false;
  };

  const tick = (dt: number) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i];
      spring(l.t, l.on ? 1 : 0, l.on ? 12 : 16, dt); // labels leave quicker than they come
      const k = Math.max(0, l.t.x);
      // leader rises along the object's own "up" (away from the planet)
      l.target.getWorldPosition(at);
      l.target.getWorldQuaternion(q);
      up.set(0, 0, 1).applyQuaternion(q);
      const len = 6 + 8 * k;
      const end = at.clone().addScaledVector(up, len);
      const pos = l.line.geometry.getAttribute('position') as Float32BufferAttribute;
      pos.setXYZ(0, at.x + up.x * 3, at.y + up.y * 3, at.z + up.z * 3);
      pos.setXYZ(1, end.x, end.y, end.z);
      pos.needsUpdate = true;
      l.sprite.position.copy(end);
      l.sprite.scale.set(l.w * (0.85 + 0.15 * k), l.h * (0.85 + 0.15 * k), 1);
      (l.sprite.material as SpriteMaterial).opacity = k;
      (l.line.material as LineBasicMaterial).opacity = k * 0.9;
      if (!l.on && l.t.x < 0.01) {
        l.sprite.removeFromParent();
        l.line.removeFromParent();
        (l.sprite.material as SpriteMaterial).map?.dispose();
        l.sprite.material.dispose();
        l.line.geometry.dispose();
        (l.line.material as Material).dispose();
        live.splice(i, 1);
      }
    }
  };
  return { show, hide, tick };
}
