import * as THREE from "three";
import { random, clamp } from "./workout.js";

export const SKY_MOODS = ["clear", "sunset", "moon", "rain", "hail", "storm"];
const PALETTES = {
  clear: [0x70b7d9, 0xd5e4cc, 0xffe9b5, 2.3, 2.1, 0xffffff],
  sunset: [0x6668a3, 0xf6ad79, 0xffa361, 1.8, 1.5, 0xf1b9a1],
  moon: [0x101d3e, 0x64798c, 0xaac9ff, 0.9, 0.75, 0x8194ac],
  rain: [0x536c80, 0xabbcba, 0xd0dbdf, 1.25, 1.2, 0x9eafb6],
  hail: [0x687b92, 0xbac9c6, 0xd7e4e9, 1.4, 1.3, 0xb9c6cf],
  storm: [0x263a53, 0x849799, 0xacc4d5, 1, 1.1, 0x70838e],
};
export function skyMood(mode, elapsed) {
  return mode === "auto"
    ? SKY_MOODS[Math.floor(Math.max(0, elapsed) / 150) % SKY_MOODS.length]
    : SKY_MOODS.includes(mode)
      ? mode
      : "clear";
}

export class Atmosphere {
  constructor(scene, sun, ambient) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;
    this.mode = "auto";
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.top = new THREE.Color(PALETTES.clear[0]);
    this.horizon = new THREE.Color(PALETTES.clear[1]);
    this.uniforms = {
      top: { value: this.top },
      horizon: { value: this.horizon },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          "varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 horizon;
          varying vec3 direction;
          void main() {
            float h = max(0.0, normalize(direction).y);
            gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.85, h)), 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.dome.renderOrder = -10;
    this.group.add(this.dome);
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(25, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdd9c, fog: false }),
    );
    this.sunDisc.position.set(140, 170, 650);
    this.group.add(this.sunDisc);
    this.moon = new THREE.Group();
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe5edf1,
      fog: false,
    });
    this.moon.add(
      new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), moonMat),
    );
    const craterMat = new THREE.MeshBasicMaterial({
      color: 0xbbcbd7,
      fog: false,
    });
    for (const [x, y, r] of [
      [-6, 4, 3],
      [6, -7, 4],
      [3, 7, 2],
    ]) {
      const crater = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6),
        craterMat,
      );
      crater.position.set(x, y, -Math.sqrt(400 - x * x - y * y));
      this.moon.add(crater);
    }
    this.moon.position.set(-95, 170, 650);
    this.group.add(this.moon);
    const rng = random(741);
    const stars = [];
    for (let i = 0; i < 180; i++) {
      const az = rng() * Math.PI * 2,
        h = 0.12 + rng() * 0.86,
        r = Math.sqrt(1 - h * h) * 1000;
      stars.push(Math.cos(az) * r, h * 1000, Math.sin(az) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(stars, 3),
    );
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xf2f4ef,
        size: 2.5,
        fog: false,
        transparent: true,
        opacity: 0,
      }),
    );
    this.group.add(this.stars);
    this.clouds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 6),
      new THREE.MeshLambertMaterial({
        emissive: 0x8295a4,
        emissiveIntensity: 0.45,
        color: 0xffffff,
        flatShading: true,
        fog: false,
      }),
      72,
    );
    const transform = new THREE.Object3D();
    this.cloudSeeds = [];
    for (let i = 0; i < 72; i++) {
      const cluster = Math.floor(i / 6),
        part = i % 6;
      const x = ((cluster % 4) - 1.5) * 220 + (part - 2.5) * 18;
      const z = 100 + Math.floor(cluster / 4) * 300 + rng() * 50;
      this.cloudSeeds.push({
        x,
        z,
        y: 130 + rng() * 24,
        sx: 25 + rng() * 18,
        sy: 9 + rng() * 6,
        sz: 17 + rng() * 13,
      });
    }
    this.transform = transform;
    this.group.add(this.clouds);
    this.drops = new Float32Array(520 * 6);
    this.hailPositions = new Float32Array(260 * 3);
    this.particleSeeds = Array.from({ length: 520 }, () => ({
      x: (rng() - 0.5) * 60,
      y: rng() * 35,
      z: 5 + rng() * 75,
    }));
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.drops, 3));
    this.rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: 0xd0e5f2,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    const hailGeo = new THREE.BufferGeometry();
    hailGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.hailPositions, 3),
    );
    this.hail = new THREE.Points(
      hailGeo,
      new THREE.PointsMaterial({
        color: 0xf3f8ff,
        size: 0.065,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.group.add(this.rain, this.hail);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -155, 150, 370, -145, 125, 370, -145, 125, 370, -154, 108, 370, -154,
          108, 370, -135, 83, 370, -145, 125, 370, -120, 115, 370, -120, 115,
          370, -108, 94, 370,
        ],
        3,
      ),
    );
    this.lightning = new THREE.LineSegments(
      boltGeo,
      new THREE.LineBasicMaterial({ color: 0xe7dfff, fog: false }),
    );
    this.group.add(this.lightning);
    this.update(0, new THREE.Vector3(), 0, true);
  }
  setMode(mode) {
    this.mode = mode;
    this.snap = true;
  }
  update(seconds, camera, dt, snap = false, heading = 0) {
    const mood = skyMood(this.mode, seconds),
      p = PALETTES[mood];
    this.mood = mood;
    const blend = snap || this.snap ? 1 : 1 - Math.exp(-clamp(dt, 0, 2) * 0.65);
    this.snap = false;
    this.top.lerp(new THREE.Color(p[0]), blend);
    this.horizon.lerp(new THREE.Color(p[1]), blend);
    this.scene.fog.color.copy(this.horizon);
    this.scene.background.copy(this.horizon);
    this.sun.color.lerp(new THREE.Color(p[2]), blend);
    this.sun.intensity += (p[3] - this.sun.intensity) * blend;
    this.ambient.intensity += (p[4] - this.ambient.intensity) * blend;
    this.clouds.material.color.lerp(new THREE.Color(p[5]), blend);
    this.group.position.copy(camera);
    this.sunDisc.visible = mood === "clear" || mood === "sunset";
    // Keep the selected sky's focal point within the narrow portrait view on bends.
    this.sunDisc.position.set(
      Math.sin(heading) * 650 + 140,
      mood === "sunset" ? 55 : 170,
      Math.cos(heading) * 650,
    );
    this.moon.position.set(
      Math.sin(heading) * 650 - 95,
      115,
      Math.cos(heading) * 650,
    );
    this.moon.visible = mood === "moon";
    this.stars.material.opacity +=
      (Number(mood === "moon") - this.stars.material.opacity) * blend;
    const drift = this.reducedMotion ? 0 : seconds * 1.3;
    this.cloudSeeds.forEach((c, i) => {
      this.transform.position.set(
        ((((c.x + drift + 650) % 1300) + 1300) % 1300) - 650,
        c.y,
        c.z,
      );
      this.transform.scale.set(c.sx, c.sy, c.sz);
      this.transform.updateMatrix();
      this.clouds.setMatrixAt(i, this.transform.matrix);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.clouds.computeBoundingSphere();
    this.rain.visible =
      !this.reducedMotion && (mood === "rain" || mood === "storm");
    this.hail.visible = !this.reducedMotion && mood === "hail";
    if (this.rain.visible || this.hail.visible) {
      this.particleSeeds.forEach((p, i) => {
        const falling =
          ((((p.y - seconds * (this.hail.visible ? 13 : 22)) % 35) + 35) % 35) -
          3;
        if (this.rain.visible)
          this.drops.set(
            [p.x, falling, p.z, p.x - 0.16, falling + 1.2, p.z + 0.15],
            i * 6,
          );
        if (this.hail.visible && i < 260)
          this.hailPositions.set(
            [p.x + Math.sin(seconds * 2 + i) * 0.2, falling, p.z],
            i * 3,
          );
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.hail.geometry.attributes.position.needsUpdate = true;
      // Geometry is camera-local and moves throughout these fixed volumes.
      this.rain.geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 16, 45),
        70,
      );
      this.hail.geometry.boundingSphere = this.rain.geometry.boundingSphere;
    }
    this.lightning.visible =
      !this.reducedMotion &&
      mood === "storm" &&
      seconds % 23 > 19 &&
      seconds % 23 < 19.18;
  }
}
