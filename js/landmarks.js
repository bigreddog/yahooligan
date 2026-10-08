import * as THREE from "three";
import { random } from "./workout.js";

function goatModel() {
  const group = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({
    color: 0xe4ddc8,
    flatShading: true,
  });
  const dark = new THREE.MeshLambertMaterial({ color: 0x564c40 });
  const horn = new THREE.MeshLambertMaterial({ color: 0xaaa18b });
  const box = new THREE.BoxGeometry(1, 1, 1),
    sphere = new THREE.IcosahedronGeometry(1, 1);
  const part = (geometry, material, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    return mesh;
  };
  part(sphere, fur, 0, 0.8, 0, 0.32, 0.4, 0.65);
  part(sphere, fur, 0, 1.25, 0.52, 0.22, 0.3, 0.25);
  part(sphere, dark, 0, 1.17, 0.74, 0.17, 0.1, 0.1);
  for (const side of [-1, 1]) {
    for (const z of [-0.38, 0.4]) {
      part(box, fur, side * 0.2, 0.38, z, 0.12, 0.64, 0.12);
      part(box, dark, side * 0.2, 0.09, z + 0.02, 0.13, 0.15, 0.18);
    }
    part(box, fur, side * 0.28, 1.37, 0.51, 0.24, 0.08, 0.14).rotation.z =
      side * 0.3;
    const h = part(
      new THREE.ConeGeometry(1, 1, 5),
      horn,
      side * 0.12,
      1.64,
      0.4,
      0.065,
      0.45,
      0.07,
    );
    h.rotation.x = -0.45;
    part(sphere, dark, side * 0.18, 1.32, 0.68, 0.025, 0.025, 0.025);
  }
  part(
    new THREE.ConeGeometry(1, 1, 5),
    fur,
    0,
    1.0,
    0.7,
    0.09,
    0.23,
    0.09,
  ).rotation.z = Math.PI;
  part(box, fur, 0, 0.98, -0.66, 0.1, 0.12, 0.26).rotation.x = -0.5;
  return group;
}

export function addLandmarks(route) {
  const group = new THREE.Group();
  route.course.add(group);
  route.landmarks = group;
  const rng = random(route.workout.seed + 239);
  const length = route.workout.duration * 7;
  const count = Math.min(450, Math.ceil(length / 130));
  const rockMatrices = [],
    cliffMatrices = [],
    goatMatrices = [];
  const transform = new THREE.Object3D();
  const matrix = (x, y, z, sx, sy, sz, rotation = 0) => {
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(0, rotation, 0);
    transform.updateMatrix();
    return transform.matrix.clone();
  };
  for (let i = 0; i < count; i++) {
    // Regular landmarks keep the entire course populated, including its opening stretch.
    const z = 55 + (i * length) / count + rng() * 35;
    const side = i % 2 ? -1 : 1;
    const offset = side * (9 + rng() * 7),
      height = 2.3 + rng() * 2.5;
    const y = route.terrainHeight(z, offset);
    rockMatrices.push(
      matrix(
        route.centerX(z) + offset,
        y + height * 0.35,
        z,
        3 + rng() * 2,
        height,
        3 + rng() * 2,
        rng() * Math.PI,
      ),
    );
    if (i % 3 === 0) {
      goatMatrices.push(
        matrix(
          route.centerX(z) + offset,
          y + height * 1.32,
          z,
          0.95,
          0.95,
          0.95,
          rng() * Math.PI * 2,
        ),
      );
      if (i % 6 === 0)
        goatMatrices.push(
          matrix(
            route.centerX(z) + offset + 0.9,
            y + height * 1.26,
            z + 0.6,
            0.55,
            0.55,
            0.55,
            rng() * Math.PI * 2,
          ),
        );
    }
    if (i % 4 === 1)
      for (let j = 0; j < 4; j++) {
        const cz = z + j * 12,
          co = side * (24 + rng() * 4),
          h = 9 + rng() * 14;
        cliffMatrices.push(
          matrix(
            route.centerX(cz) + co,
            route.terrainHeight(cz, co) + h * 0.3,
            cz,
            5 + rng() * 4,
            h,
            10,
            rng() * 0.3,
          ),
        );
      }
    for (let j = 0; j < 3; j++) {
      const bz = z + 12 + j * 9,
        bo = -side * (7 + rng() * 20),
        s = 0.5 + rng() * 1.6;
      rockMatrices.push(
        matrix(
          route.centerX(bz) + bo,
          route.terrainHeight(bz, bo) + s * 0.4,
          bz,
          s * 1.4,
          s,
          s * 1.7,
          rng() * Math.PI,
        ),
      );
    }
  }
  const instances = (geometry, material, matrices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.ownsResources = true;
    group.add(mesh);
    return mesh;
  };
  instances(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0x7e8071, flatShading: true }),
    rockMatrices,
  );
  instances(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0x7a7166, flatShading: true }),
    cliffMatrices,
  );
  const goat = goatModel();
  goat.updateMatrixWorld(true);
  goat.traverse((node) => {
    if (node.isMesh)
      instances(
        node.geometry,
        node.material,
        goatMatrices.map((m) => m.clone().multiply(node.matrixWorld)),
      );
  });
  group.userData.goats = goatMatrices.length;
  group.userData.boulders = rockMatrices.length;
  group.userData.cliffs = cliffMatrices.length;
}
