import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Light,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LatLng } from '../sky/sun';

/** The bits of globe.gl this needs. */
interface GlobeLike {
  scene(): Scene;
  camera(): unknown;
  renderer(): unknown;
  controls(): unknown;
  lights(lights: Light[]): unknown;
  getGlobeRadius(): number;
  getCoords(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
  pointOfView(pov: { lat?: number; lng?: number; altitude?: number }, ms?: number): unknown;
}

export type View = 'armillary' | 'horizon';

/**
 * Turns the globe into an armillary sphere, the Greek instrument that models the sky as rings
 * around the Earth, and lights it like a real brass object.
 *
 * Every ring is a real thing, not decoration:
 *   night ring    the plane where day meets night (it turns as you move the sun)
 *   aurora ring   the auroral oval, 22° around the geomagnetic pole (flat green ink: it is an event)
 *   orbit ring    the plane the ISS is flying in right now (dashed)
 *   meridian + equator   the instrument's frame, with 24 hour ticks
 *
 * One directional light sits where the Sun is. That single light is the whole day/night model.
 */
export function createArmillary(globe: GlobeLike) {
  const R = globe.getGlobeRadius();
  const Z = new Vector3(0, 0, 1);
  const scene = globe.scene();
  const renderer = globe.renderer() as WebGLRenderer;

  // ---- light: the Sun, plus a soft studio reflection so the metal has something to mirror ----
  const sunLight = new DirectionalLight('#fff1d6', 3.4);
  globe.lights([new AmbientLight('#8fa0c8', 0.12), sunLight]);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32; // low: the night side should stay properly dark
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const brass = new MeshStandardMaterial({ color: '#c9a252', metalness: 1, roughness: 0.28 });
  const hoop = (radius: number, tube: number, mat: MeshStandardMaterial | MeshBasicMaterial) =>
    new Mesh(new TorusGeometry(radius, tube, 16, 220), mat);

  const rings = new Group();

  // the frame: a vertical meridian hoop and a horizontal one, with hour ticks
  const frame = new Group();
  const equator = hoop(R * 1.62, 0.8, brass);
  equator.rotation.x = Math.PI / 2;
  frame.add(hoop(R * 1.62, 1.5, brass), equator);
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2;
    const tick = new Mesh(new TorusGeometry(h % 6 === 0 ? 3 : 1.6, 0.6, 8, 24), brass);
    tick.position.set(Math.cos(a) * R * 1.62, 0, Math.sin(a) * R * 1.62);
    tick.rotation.y = -a; // small rings threaded on the equator hoop, like bearings
    frame.add(tick);
  }
  rings.add(frame);

  const night = hoop(R * 1.3, 1.6, brass);
  rings.add(night);

  // auroral oval: the one flat-ink ring, because it is an event, not part of the instrument
  const auroraInk = new Color();
  const auroraMat = new MeshBasicMaterial({ toneMapped: false });
  auroraMat.color = auroraInk;
  const pole = globe.getCoords(80.7, -72.7);
  const poleDir = new Vector3(pole.x, pole.y, pole.z).normalize();
  const ovalAngle = (22 * Math.PI) / 180;
  const aurora = hoop(R * 1.035 * Math.sin(ovalAngle), 1.3, auroraMat);
  aurora.position.copy(poleDir).multiplyScalar(R * 1.035 * Math.cos(ovalAngle));
  aurora.quaternion.setFromUnitVectors(Z, poleDir);

  // ISS orbit: a dashed circle in the plane of the two latest trail points
  const circle: number[] = [];
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    circle.push(Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, 0);
  }
  const orbitGeo = new BufferGeometry();
  orbitGeo.setAttribute('position', new Float32BufferAttribute(circle, 3));
  const orbit = new Line(
    orbitGeo,
    new LineDashedMaterial({ color: '#f1e6c8', dashSize: 5, gapSize: 4, toneMapped: false }),
  );
  orbit.computeLineDistances();
  orbit.visible = false;
  rings.add(orbit);

  scene.add(rings, aurora);

  const readInk = () =>
    auroraInk.set(getComputedStyle(document.documentElement).getPropertyValue('--ink-aurora').trim() || '#9bd24a');
  readInk();
  new MutationObserver(readInk).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-phase'],
  });

  // ---- motion ----
  // Everything below moves on one rAF loop that runs only while something is settling.
  // Critically damped smoothing (Unity's SmoothDamp): frame-rate independent, never overshoots,
  // and a retarget mid-flight keeps the current velocity instead of restarting or jumping.
  type Spring = { x: number; v: number; to: number };
  const damp = (s: Spring, smoothTime: number, dt: number) => {
    const omega = 2 / smoothTime;
    const k = omega * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = s.x - s.to;
    const temp = (s.v + omega * change) * dt;
    s.v = (s.v - omega * temp) * e;
    const next = s.to + (change + temp) * e;
    s.x = change > 0 === next > s.to ? next : s.to; // clamp overshoot
    if (Math.abs(s.x - s.to) < 1e-4 && Math.abs(s.v) < 1e-3) {
      s.x = s.to;
      s.v = 0;
      return false;
    }
    return true;
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- views ----
  const cam = globe.camera() as PerspectiveCamera;
  const shift: Spring = { x: 0, v: 0, to: 0 }; // 0 = whole instrument, 1 = standing at the limb
  // camera altitude, damped in log space so the zoom feels even from far to near
  const zoom: Spring = { x: 0, v: 0, to: 0 };
  let flying = false;
  // the user grabbing the globe takes the camera back; only the view slide finishes
  (globe.controls() as { addEventListener(type: string, fn: () => void): void }).addEventListener(
    'start',
    () => {
      flying = false;
      zoom.v = 0;
    },
  );

  // the sun direction eases along the great circle, so a jump in time sweeps instead of snapping
  const sunQ = new Quaternion();
  const sunTo = new Quaternion();
  let sunSet = false;

  const layout = () => {
    const s = shift.x;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // armillary: the instrument sits right of centre, leaving the left for the counter.
    // horizon: slide the picture down so only the top arc of the Earth stays in frame.
    const dx = w > 1100 ? -w * 0.09 * (1 - s) : 0;
    cam.setViewOffset(w, h, dx, -h * (0.03 + 0.74 * s), w, h);
    rings.scale.setScalar(Math.max(1 - s, 0.001));
    rings.visible = s < 0.97;
    if (sunSet) {
      night.quaternion.copy(sunQ);
      sunLight.position.copy(Z).applyQuaternion(sunQ).multiplyScalar(R * 10);
    }
  };

  let raf = 0;
  let last = 0;
  const step = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    let moving = damp(shift, 0.3, dt);
    if (flying) {
      flying = damp(zoom, 0.35, dt);
      globe.pointOfView({ altitude: Math.exp(zoom.x) });
      moving = moving || flying;
    }
    if (sunQ.angleTo(sunTo) > 1e-4) {
      sunQ.slerp(sunTo, 1 - Math.exp(-dt / 0.07));
      moving = true;
    } else sunQ.copy(sunTo);
    layout();
    raf = moving ? requestAnimationFrame(step) : 0;
    if (!moving) last = 0;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(step);
  };
  window.addEventListener('resize', kick); // re-apply the view offset at the new size
  kick();

  return {
    setSun(dir: Vector3) {
      sunTo.setFromUnitVectors(Z, dir);
      if (!sunSet || reducedMotion.matches) sunQ.copy(sunTo);
      sunSet = true;
      kick();
    },
    setOrbit(trail: LatLng[]) {
      if (trail.length < 2) return;
      const a = globe.getCoords(trail[0].lat, trail[0].lng);
      const b = globe.getCoords(trail[trail.length - 1].lat, trail[trail.length - 1].lng);
      const n = new Vector3(a.x, a.y, a.z).cross(new Vector3(b.x, b.y, b.z));
      if (n.lengthSq() < 1e-6) return;
      orbit.quaternion.setFromUnitVectors(Z, n.normalize());
      orbit.visible = true;
    },
    setView(next: View) {
      const altitude = next === 'horizon' ? 1.15 : 2.9;
      shift.to = next === 'horizon' ? 1 : 0;
      if (reducedMotion.matches) {
        // cut straight to the destination
        flying = false;
        shift.x = shift.to;
        shift.v = zoom.v = 0;
        globe.pointOfView({ altitude });
      } else {
        // fresh flight: start from wherever the user left the camera; mid-flight: keep velocity
        if (!flying) {
          zoom.x = Math.log((globe.pointOfView({}) as { altitude: number }).altitude);
          zoom.v = 0;
        }
        zoom.to = Math.log(altitude);
        flying = true;
      }
      kick();
    },
  };
}
