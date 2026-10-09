import * as THREE from "three";
import { clamp } from "./workout.js";

export function pedalPhase(phase, cadence, seconds) {
  if (!Number.isFinite(cadence) || !Number.isFinite(seconds)) return phase;
  return (
    (phase +
      ((clamp(cadence, 0, 220) * Math.max(0, seconds)) / 60) * Math.PI * 2) %
    (Math.PI * 2)
  );
}

export function makeCyclist() {
  const bike = new THREE.Group();
  const rubber = new THREE.MeshLambertMaterial({ color: 0x172925 });
  const frame = new THREE.MeshLambertMaterial({ color: 0xe6ab62 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xdbab85 });
  const jersey = new THREE.MeshLambertMaterial({ color: 0xee8d54 });
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const up = new THREE.Vector3(0, 1, 0);
  const connect = (mesh, a, b, radius) => {
    const axis = b.clone().sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, axis.length(), radius);
    mesh.quaternion.setFromUnitVectors(up, axis.normalize());
  };
  const bar = (a, b, material, radius = 0.035) => {
    const mesh = new THREE.Mesh(cylinder, material);
    connect(mesh, a, b, radius);
    bike.add(mesh);
    return mesh;
  };
  const wheels = [];
  for (const z of [-0.6, 0.6]) {
    const hub = new THREE.Group();
    hub.position.set(0, 0.38, z);
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 5, 20),
      rubber,
    );
    tire.rotation.y = Math.PI / 2;
    hub.add(tire);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      const spoke = new THREE.Mesh(cylinder, frame);
      connect(
        spoke,
        new THREE.Vector3(0, Math.cos(a) * 0.32, Math.sin(a) * 0.32),
        new THREE.Vector3(0, -Math.cos(a) * 0.32, -Math.sin(a) * 0.32),
        0.008,
      );
      hub.add(spoke);
    }
    bike.add(hub);
    wheels.push(hub);
  }
  const v = (y, z) => new THREE.Vector3(0, y, z);
  const rear = v(0.38, -0.6),
    front = v(0.38, 0.6),
    seat = v(0.96, -0.25),
    head = v(0.88, 0.4),
    crank = v(0.46, -0.05);
  for (const [a, b] of [
    [rear, seat],
    [seat, head],
    [head, front],
    [seat, crank],
    [crank, rear],
    [crank, head],
  ])
    bar(a, b, frame);
  bar(
    new THREE.Vector3(-0.24, 0.96, 0.48),
    new THREE.Vector3(0.24, 0.96, 0.48),
    rubber,
  );
  const saddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.27),
    rubber,
  );
  saddle.position.copy(seat);
  bike.add(saddle);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.17, 0.38, 3, 6),
    jersey,
  );
  torso.position.set(0, 1.24, -0.02);
  torso.rotation.x = 0.55;
  bike.add(torso);
  const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), rubber);
  helmet.position.set(0, 1.62, 0.19);
  bike.add(helmet);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(side * 0.12, 1.02, -0.22);
    const thigh = bar(hip, hip.clone().add(v(-0.35, 0.1)), rubber, 0.075);
    const calf = bar(hip, crank, skin, 0.045);
    const crankArm = bar(crank, crank, frame, 0.025);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.07, 0.24),
      rubber,
    );
    bike.add(shoe);
    legs.push({ side, hip, thigh, calf, crankArm, shoe });
    bar(
      new THREE.Vector3(side * 0.15, 1.38, 0.07),
      new THREE.Vector3(side * 0.2, 1.14, 0.28),
      jersey,
      0.05,
    );
    bar(
      new THREE.Vector3(side * 0.2, 1.14, 0.28),
      new THREE.Vector3(side * 0.22, 0.96, 0.48),
      skin,
      0.04,
    );
  }
  bike.userData.pose = (phase, distance) => {
    wheels.forEach((wheel) => (wheel.rotation.x = -distance / 0.34));
    for (const leg of legs) {
      const angle = phase + (leg.side === 1 ? Math.PI : 0);
      const ankle = new THREE.Vector3(
        leg.side * 0.16,
        0.46 + Math.sin(angle) * 0.16,
        -0.05 + Math.cos(angle) * 0.16,
      );
      const dy = ankle.y - leg.hip.y,
        dz = ankle.z - leg.hip.z;
      const length = Math.hypot(dy, dz);
      const bend = Math.sqrt(Math.max(0, 0.39 ** 2 - (length / 2) ** 2));
      const knee = new THREE.Vector3(
        leg.hip.x,
        (leg.hip.y + ankle.y) / 2 + (dz / length) * bend,
        (leg.hip.z + ankle.z) / 2 + (dy / length) * -bend,
      );
      connect(leg.thigh, leg.hip, knee, 0.075);
      connect(leg.calf, knee, ankle, 0.045);
      connect(
        leg.crankArm,
        new THREE.Vector3(leg.side * 0.16, 0.46, -0.05),
        ankle,
        0.025,
      );
      leg.shoe.position.copy(ankle);
    }
  };
  bike.userData.pose(0, 0);
  return bike;
}
