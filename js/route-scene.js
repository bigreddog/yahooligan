import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/loaders/GLTFLoader.js";
import { sampleWorkout, random, clamp, smoothstep } from "./workout.js";

const COURSE_SPEED = 7; // Scheduled scenic metres/second, independent of measured speed.
const STEP = 16;
const SKY = 0xb5d5d3;
const TERRAIN_OFFSETS = [
  -420, -200, -100, -40, -12, -6, 0, 6, 12, 40, 100, 200, 420,
];

export class RouteScene {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.onError = onError;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(SKY);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 170, 780);
    this.scene.add(new THREE.HemisphereLight(0xe9fff6, 0x354c34, 2.2));
    const sun = new THREE.DirectionalLight(0xffe5b1, 2.4);
    sun.position.set(-100, 180, -50);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 1800);
    this.course = new THREE.Group();
    this.scene.add(this.course);
    this.cameraMode = "first";
    this.time = 0;
    this.assets = null;
    this.loadAssets();
    this.bike = this.makeBike();
    this.scene.add(this.bike);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      onError(
        "3D graphics were interrupted. Your workout is paused; reload to restore the scene.",
      );
    });
    this.resize();
  }
  async loadAssets() {
    const loader = new GLTFLoader();
    try {
      const models = await Promise.all(
        ["pine", "rock", "chalet"].map((name) =>
          loader.loadAsync(`assets/${name}.glb`),
        ),
      );
      this.assets = models.map((model) => model.scene);
      if (this.workout) this.addScenery();
    } catch {
      // Procedural trees still give a complete scene if optional Blender models fail.
      this.assets = [
        this.fallbackTree(),
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(1),
          new THREE.MeshLambertMaterial({ color: 0x64736b }),
        ),
        null,
      ];
      if (this.workout) this.addScenery();
    }
  }
  fallbackTree() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 2, 5),
      new THREE.MeshLambertMaterial({ color: 0x604531 }),
    );
    trunk.position.y = 1;
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 4.5, 7),
      new THREE.MeshLambertMaterial({ color: 0x24513c }),
    );
    top.position.y = 3.3;
    group.add(trunk, top);
    return group;
  }
  setWorkout(workout) {
    this.workout = workout;
    this.time = 0;
    this.disposeGroup(this.course);
    this.scene.remove(this.course);
    this.course = new THREE.Group();
    this.scene.add(this.course);
    const count = Math.ceil((workout.duration * COURSE_SPEED) / STEP) + 50;
    this.points = [];
    let elevation = 0;
    for (let i = 0; i <= count; i++) {
      const distance = i * STEP;
      if (i)
        elevation +=
          (sampleWorkout(workout, (distance - STEP / 2) / COURSE_SPEED).grade /
            100) *
          STEP;
      this.points.push({ distance, x: this.centerX(distance), y: elevation });
    }
    this.createTerrain();
    if (this.assets) this.addScenery();
    this.render(0);
  }
  centerX(z) {
    return Math.sin(z / 240) * 22 + Math.sin(z / 700) * 36;
  }
  point(z) {
    const index = clamp(Math.floor(z / STEP), 0, this.points.length - 2);
    const fraction = clamp(z / STEP - index, 0, 1);
    const a = this.points[index];
    const b = this.points[index + 1];
    return new THREE.Vector3(this.centerX(z), a.y + (b.y - a.y) * fraction, z);
  }
  ground(z, offset) {
    const away = Math.max(0, Math.abs(offset) - 6);
    const ridge =
      Math.sin(z / 140 + offset / 90) * 8 +
      Math.cos(z / 230 - offset / 60) * 13 +
      20;
    return (
      this.point(z).y -
      0.12 +
      smoothstep(clamp((away - 12) / 140, 0, 1)) * ridge +
      away * 0.015
    );
  }
  terrainHeight(z, offset) {
    // Scenery sits on the triangulated ground, not its underlying analytic curve.
    const row = clamp(Math.floor(z / STEP), 0, this.points.length - 2);
    const z0 = row * STEP,
      fractionZ = clamp((z - z0) / STEP, 0, 1);
    let column = TERRAIN_OFFSETS.findIndex((value) => value > offset) - 1;
    column = clamp(
      column < 0 ? TERRAIN_OFFSETS.length - 2 : column,
      0,
      TERRAIN_OFFSETS.length - 2,
    );
    const left = TERRAIN_OFFSETS[column],
      right = TERRAIN_OFFSETS[column + 1];
    const fractionX = clamp((offset - left) / (right - left), 0, 1);
    const a = this.ground(z0, left),
      b = this.ground(z0 + STEP, left);
    const c = this.ground(z0, right),
      d = this.ground(z0 + STEP, right);
    // Match the diagonal used by the terrain triangles.
    return fractionX + fractionZ <= 1
      ? a + fractionZ * (b - a) + fractionX * (c - a)
      : d + (1 - fractionX) * (b - d) + (1 - fractionZ) * (c - d);
  }
  createTerrain() {
    const offsets = TERRAIN_OFFSETS;
    const positions = [],
      colors = [],
      indices = [];
    const color = new THREE.Color();
    this.points.forEach((point, row) => {
      offsets.forEach((offset) => {
        positions.push(
          point.x + offset,
          this.ground(point.distance, offset),
          point.distance,
        );
        const variation = Math.sin(point.distance / 110 + offset / 70) * 0.025;
        color.setHSL(
          0.27 + variation,
          0.22,
          0.28 + Math.cos(point.distance / 180 + offset / 30) * 0.035,
        );
        colors.push(color.r, color.g, color.b);
      });
      if (row)
        for (let column = 0; column < offsets.length - 1; column++) {
          const a = (row - 1) * offsets.length + column,
            b = a + offsets.length;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.course.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.ribbon(-3.4, 3.4, 0x4a5454, 0.025);
    this.ribbon(-3.6, -3.35, 0xa6b49c, 0.03);
    this.ribbon(3.35, 3.6, 0xa6b49c, 0.03);
    // Dashed centre line, represented as one mesh rather than hundreds of draw calls.
    this.ribbon(-0.065, 0.065, 0xe3d9b1, 0.04, true);
    const rng = random(this.workout.seed + 109);
    for (let i = 0; i < 36; i++) {
      const z = rng() * this.workout.duration * COURSE_SPEED;
      const side = i % 2 ? -1 : 1;
      const height = 90 + rng() * 180;
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(height * 1.3, height, 5),
        new THREE.MeshLambertMaterial({
          color: i % 3 ? 0x647e76 : 0x9bada6,
          flatShading: true,
        }),
      );
      mesh.position.set(
        this.centerX(z) + side * (380 + height * 0.7 + rng() * 180),
        this.point(z).y + height * 0.25 - 10,
        z,
      );
      mesh.rotation.y = rng() * Math.PI;
      this.course.add(mesh);
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(height * 0.26, height * 0.2, 5),
        new THREE.MeshLambertMaterial({ color: 0xdce8df, flatShading: true }),
      );
      cap.position.copy(mesh.position);
      cap.position.y += height * 0.4;
      cap.rotation.copy(mesh.rotation);
      this.course.add(cap);
    }
  }
  ribbon(left, right, color, lift, dashed = false) {
    const positions = [],
      indices = [];
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      positions.push(
        p.x + left,
        p.y + lift,
        p.distance,
        p.x + right,
        p.y + lift,
        p.distance,
      );
      if (i && (!dashed || i % 2 === 0)) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.course.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
      ),
    );
  }
  addScenery() {
    if (this.scenery) {
      this.course.remove(this.scenery);
      this.disposeGroup(this.scenery, false);
    }
    this.scenery = new THREE.Group();
    this.course.add(this.scenery);
    const rng = random(this.workout.seed);
    const length = this.workout.duration * COURSE_SPEED + 500;
    const groups = [[], [], []];
    const count = Math.min(1600, Math.ceil(length / 14));
    for (let i = 0; i < count; i++) {
      const z = rng() * length;
      const offset = (i % 2 ? -1 : 1) * (7 + Math.pow(rng(), 2) * 95);
      const type = i % 11 === 0 ? 1 : i % 67 === 0 ? 2 : 0;
      const scale = type === 0 ? 1.1 + rng() * 1.8 : 0.8 + rng() * 1.4;
      groups[type].push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(
            this.centerX(z) + offset,
            this.terrainHeight(z, offset),
            z,
          ),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rng() * Math.PI * 2,
          ),
          new THREE.Vector3(scale, scale, scale),
        ),
      );
    }
    this.assets.forEach((asset, type) => {
      if (!asset || !groups[type].length) return;
      asset.updateMatrixWorld(true);
      asset.traverse((node) => {
        if (!node.isMesh) return;
        const mesh = new THREE.InstancedMesh(
          node.geometry,
          node.material,
          groups[type].length,
        );
        groups[type].forEach((matrix, index) =>
          mesh.setMatrixAt(index, matrix.clone().multiply(node.matrixWorld)),
        );
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.scenery.add(mesh);
      });
    });
  }
  makeBike() {
    const bike = new THREE.Group();
    const rubber = new THREE.MeshLambertMaterial({ color: 0x172925 });
    const frame = new THREE.MeshLambertMaterial({ color: 0xe6ab62 });
    for (const z of [-0.6, 0.6]) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.035, 5, 16),
        rubber,
      );
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.38, z);
      bike.add(wheel);
    }
    const bar = (a, b, material, radius = 0.04) => {
      const axis = b.clone().sub(a);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, axis.length(), 5),
        material,
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        axis.normalize(),
      );
      bike.add(mesh);
    };
    const rear = new THREE.Vector3(0, 0.38, -0.6),
      front = new THREE.Vector3(0, 0.38, 0.6),
      seat = new THREE.Vector3(0, 0.95, -0.25),
      head = new THREE.Vector3(0, 0.88, 0.4),
      crank = new THREE.Vector3(0, 0.42, -0.05);
    for (const [a, b] of [
      [rear, seat],
      [seat, head],
      [head, front],
      [seat, crank],
      [crank, rear],
      [crank, head],
    ])
      bar(a, b, frame);
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.42, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xee8d54 }),
    );
    torso.position.set(0, 1.26, -0.05);
    torso.rotation.x = 0.5;
    bike.add(torso);
    const helmet = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      rubber,
    );
    helmet.position.set(0, 1.68, 0.12);
    bike.add(helmet);
    for (const side of [-1, 1]) {
      bar(
        new THREE.Vector3(side * 0.12, 1.08, -0.2),
        new THREE.Vector3(side * 0.12, 0.5, 0),
        rubber,
        0.07,
      );
      bar(
        new THREE.Vector3(side * 0.15, 1.4, 0.05),
        new THREE.Vector3(side * 0.18, 0.9, 0.48),
        rubber,
        0.045,
      );
    }
    return bike;
  }
  render(seconds) {
    if (!this.workout) return;
    this.time = seconds;
    const z = seconds * COURSE_SPEED;
    const point = this.point(z);
    const follow = this.cameraMode === "follow";
    const ahead = this.point(z + (follow ? 4 : 24));
    const camera = this.point(Math.max(0, z - (follow ? 9 : 0)));
    this.camera.position.set(
      camera.x,
      camera.y + (follow ? 3 : 1.65),
      z - (follow ? 9 : 0),
    );
    this.camera.lookAt(ahead.x, ahead.y + (follow ? 0.2 : 1.3), ahead.z);
    this.bike.visible = follow;
    this.bike.position.copy(point);
    this.bike.rotation.set(
      -Math.atan(sampleWorkout(this.workout, seconds).grade / 100),
      Math.atan2(ahead.x - point.x, ahead.z - point.z),
      0,
    );
    this.renderer.render(this.scene, this.camera);
  }
  resize() {
    const width = this.canvas.clientWidth,
      height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render(this.time);
  }
  disposeGroup(group, disposeShared = true) {
    group.traverse((node) => {
      if (!node.isMesh) return;
      if (node.isInstancedMesh) {
        node.dispose();
        return;
      }
      if (disposeShared) {
        node.geometry.dispose();
        for (const material of [].concat(node.material)) material.dispose();
      }
    });
  }
}
