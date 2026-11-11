'use client';
/* eslint-disable react-hooks/immutability --
   react-three-fiber is imperative by design: three.js objects (camera, meshes, the canvas cursor) and refs are
   mutated inside useFrame/pointer handlers every frame instead of going through React state (which would re-render
   at 60 fps). See https://r3f.docs.pmnd.rs/advanced/pitfalls#avoid-setstate-in-loops */

// The 3D gumball machine (lazy-loaded; see stage.tsx). Built entirely in code: lathe profiles, rounded bevels,
// transmission glass, chrome, physics gumballs. Nothing here decides a result: it only animates the phase it is given.

import { ContactShadows, Environment, Lightformer, MeshTransmissionMaterial, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  CylinderCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
  useAfterPhysicsStep,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { Quality } from '@/lib/use-machine-mode';
import { ballCount, type CameraView, type StagePhase } from './shared';

export interface Scene3DProps {
  vaultPct: number;
  quality: Quality;
  phase: StagePhase;
  capsules: number;
  crankable: boolean;
  onCrank: () => void;
  onCapsulesOut: () => void;
  view?: CameraView;
}

// ---------------------------------------------------------------------------------------------- dimensions
const COLLAR_Y = 1.06;
const COLLAR_R = 0.74;
const DOME_R = 0.92;
const DOME_Y = COLLAR_Y + Math.sqrt(DOME_R * DOME_R - COLLAR_R * COLLAR_R); // dome rests on the collar ring
const FLOOR_TOP = COLLAR_Y + 0.015;
const CRANK_POS = new THREE.Vector3(0, 0.74, 0.885);
const CHUTE_Y = 0.42;
const TRAY_POS = new THREE.Vector3(0, 0.33, 1.06);

const PALETTE = {
  grape: '#563791',
  plum: '#6e4386',
  lavender: '#b593c7',
  lilac: '#d5b8e3',
  blush: '#fee7fa',
  gold: '#ffc93c',
  ink: '#2b1840',
  sky: '#cdb3e0',
};

function lathe(points: [number, number][], segments: number, samples = 48) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.LatheGeometry(curve.getPoints(samples), segments);
  g.computeVertexNormals();
  return g;
}

// Deterministic pseudo-random (stable ball colours/positions between renders).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------- materials
function useMaterials(quality: Quality) {
  return useMemo(() => {
    const purple = new THREE.MeshPhysicalMaterial({
      color: PALETTE.grape,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.5,
      sheenColor: new THREE.Color(PALETTE.lavender),
      envMapIntensity: 0.65,
    });
    const plum = purple.clone();
    plum.color = new THREE.Color(PALETTE.plum);
    const chrome = new THREE.MeshPhysicalMaterial({ color: '#f6f1fb', metalness: 1, roughness: 0.07, clearcoat: 1, envMapIntensity: 1.5 });
    const dark = new THREE.MeshPhysicalMaterial({ color: PALETTE.ink, roughness: 0.45, clearcoat: 0.5 });
    const floor = new THREE.MeshPhysicalMaterial({ color: PALETTE.lilac, roughness: 0.4, clearcoat: 0.8 });
    const knob = new THREE.MeshPhysicalMaterial({ color: PALETTE.blush, roughness: 0.15, clearcoat: 1, sheen: 0.4 });
    const cheapGlass = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.16,
      roughness: 0.03,
      clearcoat: 1,
      envMapIntensity: 1.6,
      depthWrite: false,
    });
    const ball = new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.25, envMapIntensity: 0.9 });
    const cloud = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const cloudPink = new THREE.MeshStandardMaterial({ color: PALETTE.blush, roughness: 1 });
    return { purple, plum, chrome, dark, floor, knob, cheapGlass, ball, cloud, cloudPink, quality };
  }, [quality]);
}

type Mats = ReturnType<typeof useMaterials>;

// ---------------------------------------------------------------------------------------------- decal
/** A flat plane bent onto a cylinder of radius r around the y axis (keeps plane UVs, so text reads correctly). */
function bentPlane(width: number, height: number, radius: number, segments = 48) {
  const g = new THREE.PlaneGeometry(width, height, segments, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const a = x / radius;
    pos.setXYZ(i, radius * Math.sin(a), pos.getY(i), radius * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}

/** "Gaballs" wrapped around the front of the base, drawn with the page's Fredoka font into a canvas texture. */
function NameDecal() {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const geometry = useMemo(() => bentPlane(0.9, 0.15, 1.152), []);
  useEffect(() => {
    let cancelled = false;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-fredoka').trim() || 'sans-serif';
    const draw = () => {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 178;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.font = `700 132px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 22;
      ctx.strokeStyle = PALETTE.ink;
      ctx.strokeText('Gaballs', 512, 96);
      ctx.fillStyle = PALETTE.blush;
      ctx.fillText('Gaballs', 512, 96);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (!cancelled) setTexture(t);
    };
    document.fonts.load(`700 132px ${family}`).then(draw, draw);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} position={[0, 0.135, 0]}>
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------- machine body
function MachineBody({
  mats,
  segments,
  crankRef,
  flapRef,
  crankable,
  onCrankPointerDown,
}: {
  mats: Mats;
  segments: number;
  crankRef: React.RefObject<THREE.Group | null>;
  flapRef: React.RefObject<THREE.Group | null>;
  crankable: boolean;
  onCrankPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const geo = useMemo(
    () => ({
      base: lathe(
        [
          [0, 0],
          [0.92, 0],
          [1.07, 0.03],
          [1.13, 0.14],
          [1.09, 0.25],
          [0.97, 0.31],
          [0.87, 0.335],
          [0, 0.335],
        ],
        segments,
      ),
      body: lathe(
        [
          [0, 0.3],
          [0.82, 0.3],
          [0.87, 0.37],
          [0.865, 0.55],
          [0.82, 0.82],
          [0.775, 0.99],
          [0.745, COLLAR_Y],
          [0, COLLAR_Y],
        ],
        segments,
      ),
      lid: lathe(
        [
          [0, DOME_Y + DOME_R + 0.12],
          [0.16, DOME_Y + DOME_R + 0.105],
          [0.3, DOME_Y + DOME_R + 0.04],
          [0.39, DOME_Y + DOME_R - 0.05],
          [0.37, DOME_Y + DOME_R - 0.1],
          [0, DOME_Y + DOME_R - 0.1],
        ],
        segments,
      ),
      tray: lathe(
        [
          [0, 0.015],
          [0.15, 0.015],
          [0.23, 0.06],
          [0.25, 0.1],
          [0.215, 0.105],
          [0.14, 0.05],
          [0, 0.045],
        ],
        Math.max(24, segments / 2),
        24,
      ),
      hub: lathe(
        [
          [0, 0.075],
          [0.06, 0.07],
          [0.1, 0.045],
          [0.12, 0.0],
          [0, 0.0],
        ],
        40,
        24,
      ),
    }),
    [segments],
  );

  return (
    <group>
      <mesh geometry={geo.base} material={mats.purple} />
      <mesh geometry={geo.body} material={mats.purple} />
      <NameDecal />

      {/* chrome collar + lavender floor the gumballs sit on */}
      <mesh position={[0, COLLAR_Y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
        <torusGeometry args={[COLLAR_R + 0.02, 0.05, 18, segments]} />
      </mesh>
      <mesh position={[0, COLLAR_Y + 0.004, 0]} material={mats.floor}>
        <cylinderGeometry args={[COLLAR_R, COLLAR_R, 0.022, segments]} />
      </mesh>

      {/* lid + chrome trim + gumball-shaped knob */}
      <mesh geometry={geo.lid} material={mats.purple} />
      <mesh position={[0, DOME_Y + DOME_R - 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
        <torusGeometry args={[0.38, 0.022, 12, segments]} />
      </mesh>
      <mesh position={[0, DOME_Y + DOME_R + 0.2, 0]} material={mats.knob}>
        <sphereGeometry args={[0.09, 28, 18]} />
      </mesh>

      {/* front plate */}
      <RoundedBox args={[0.74, 0.5, 0.14]} radius={0.07} smoothness={5} position={[0, 0.76, 0.795]} material={mats.plum} />
      {/* coin slot */}
      <RoundedBox args={[0.12, 0.16, 0.04]} radius={0.018} smoothness={3} position={[0.255, 0.88, 0.868]} material={mats.chrome} />
      <RoundedBox args={[0.026, 0.1, 0.03]} radius={0.01} smoothness={2} position={[0.255, 0.88, 0.886]} material={mats.dark} />

      {/* crank: chrome hub, arm and a blush knob — rotates about its own z axis */}
      <group ref={crankRef} position={CRANK_POS.toArray()} onPointerDown={onCrankPointerDown}>
        <mesh geometry={geo.hub} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome} />
        <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]} material={mats.purple}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 20]} />
        </mesh>
        <RoundedBox args={[0.34, 0.07, 0.05]} radius={0.028} smoothness={4} position={[0.15, 0, 0.07]} material={mats.chrome} />
        <mesh position={[0.29, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
          <cylinderGeometry args={[0.02, 0.02, 0.1, 14]} />
        </mesh>
        <mesh position={[0.29, 0, 0.19]} material={mats.knob}>
          <sphereGeometry args={[0.07, 28, 18]} />
        </mesh>
        {/* generous invisible grab area */}
        <mesh position={[0.1, 0, 0.12]} visible={false}>
          <boxGeometry args={[0.62, 0.42, 0.22]} />
        </mesh>
        {crankable && (
          <mesh position={[0, 0, 0.012]}>
            <ringGeometry args={[0.37, 0.39, 64]} />
            <meshBasicMaterial color={PALETTE.blush} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        )}
      </group>

      {/* chute opening + hinged chrome flap + tray */}
      <RoundedBox args={[0.34, 0.19, 0.12]} radius={0.05} smoothness={4} position={[0, CHUTE_Y, 0.83]} material={mats.dark} />
      <group ref={flapRef} position={[0, CHUTE_Y + 0.085, 0.892]}>
        <RoundedBox args={[0.32, 0.17, 0.024]} radius={0.012} smoothness={3} position={[0, -0.085, 0]} material={mats.chrome} />
      </group>
      <mesh geometry={geo.tray} position={TRAY_POS.toArray()} material={mats.chrome} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------- glass
/**
 * Fresnel rim: bright at grazing angles, clear when facing the camera. Costs one cheap pass. Writes a matching alpha
 * (not additive) because the canvas is transparent over the page: opaque output would turn the "empty" glass black.
 */
const rimMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { color: { value: new THREE.Color('#fbefff') } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 color; varying vec3 vN; varying vec3 vV;
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
      gl_FragColor = vec4(color, 0.04 + f * 0.75);
    }`,
});

function Dome({ mats, quality }: { mats: Mats; quality: Quality }) {
  const background = useMemo(() => new THREE.Color(PALETTE.sky), []);
  if (quality === 'low') {
    // Phones: no refraction pass. A faint reflective shell plus a cheap fresnel rim so the dome still reads as glass.
    return (
      <group position={[0, DOME_Y, 0]}>
        <mesh material={mats.cheapGlass} renderOrder={2}>
          <sphereGeometry args={[DOME_R, 40, 28]} />
        </mesh>
        <mesh material={rimMaterial} renderOrder={3}>
          <sphereGeometry args={[DOME_R + 0.003, 40, 28]} />
        </mesh>
      </group>
    );
  }
  return (
    <mesh position={[0, DOME_Y, 0]} renderOrder={2}>
      <sphereGeometry args={[DOME_R, 72, 54]} />
      <MeshTransmissionMaterial
        background={background}
        samples={5}
        resolution={768}
        transmission={1}
        thickness={0.14}
        roughness={0.02}
        ior={1.32}
        chromaticAberration={0.012}
        anisotropy={0}
        distortion={0}
        clearcoat={1}
        clearcoatRoughness={0.02}
        envMapIntensity={1.2}
        color="#ffffff"
        attenuationColor="#fbf3ff"
        attenuationDistance={4}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------- cloud platform
function CloudPlatform({ mats }: { mats: Mats }) {
  const puffs: [number, number, number, number, boolean][] = [
    [0, -0.27, 0, 1.25, false],
    [-1.05, -0.25, 0.3, 0.58, true],
    [1.08, -0.25, 0.2, 0.62, false],
    [-0.5, -0.24, 0.85, 0.5, false],
    [0.6, -0.24, 0.85, 0.5, true],
    [0.1, -0.26, -0.85, 0.6, true],
  ];
  return (
    <group>
      {puffs.map(([x, y, z, r, pink], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1, 0.36, 1]} material={pink ? mats.cloudPink : mats.cloud}>
          <sphereGeometry args={[r, 32, 20]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------- gumballs (physics)
/** Packed starting positions on a grid inside the dome, lowest first, so no two balls start overlapping. */
function startPositions(count: number, radius: number): [number, number, number][] {
  const step = radius * 2 + 0.012;
  const inner = DOME_R - 0.05 - radius;
  const r = rng(11);
  const pts: [number, number, number][] = [];
  for (let y = FLOOR_TOP + radius + 0.02; y < DOME_Y + inner; y += step) {
    for (let x = -inner; x <= inner; x += step) {
      for (let z = -inner; z <= inner; z += step) {
        const jx = x + (r() - 0.5) * 0.01;
        const jz = z + (r() - 0.5) * 0.01;
        if (Math.hypot(jx, y - DOME_Y, jz) < inner) pts.push([jx, y, jz]);
      }
    }
  }
  return pts.slice(0, count);
}

function Gumballs({
  count,
  quality,
  mats,
  phase,
  angleRef,
}: {
  count: number;
  quality: Quality;
  mats: Mats;
  phase: StagePhase;
  angleRef: React.RefObject<number>;
}) {
  const radius = quality === 'low' ? 0.12 : 0.105;
  const bodies = useRef<RapierRigidBody[]>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(
    () => new THREE.SphereGeometry(radius, quality === 'low' ? 14 : 24, quality === 'low' ? 10 : 16),
    [radius, quality],
  );

  const instances = useMemo<InstancedRigidBodyProps[]>(
    () => startPositions(count, radius).map((p, i) => ({ key: `ball-${count}-${i}`, position: p })),
    [count, radius],
  );

  // Candy colours from the palette, plus exactly one gold "Mythic" ball.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const r = rng(42);
    const choices = [PALETTE.grape, PALETTE.grape, PALETTE.grape, PALETTE.lavender, PALETTE.lavender, PALETTE.lilac, PALETTE.blush];
    const goldAt = Math.floor(instances.length * 0.6);
    const c = new THREE.Color();
    for (let i = 0; i < instances.length; i++) {
      c.set(i === goldAt ? PALETTE.gold : choices[Math.floor(r() * choices.length)]);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);

  // Keep every ball inside the (wobbling) glass sphere: project back onto the inner surface and bounce.
  useAfterPhysicsStep(() => {
    const list = bodies.current;
    if (!list) return;
    const a = angleRef.current ?? 0;
    const cx = -Math.sin(a) * DOME_Y;
    const cy = Math.cos(a) * DOME_Y;
    const limit = DOME_R - 0.04 - radius;
    for (const b of list) {
      // Bodies from a previous ball count may already be removed from the world: never touch those.
      if (!b || !b.isValid()) continue;
      const p = b.translation();
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy, p.z);
      if (d > limit) {
        const k = limit / d;
        b.setTranslation({ x: cx + dx * k, y: cy + dy * k, z: p.z * k }, true);
        const v = b.linvel();
        const nx = dx / d;
        const ny = dy / d;
        const nz = p.z / d;
        const vn = v.x * nx + v.y * ny + v.z * nz;
        if (vn > 0) b.setLinvel({ x: v.x - 1.5 * vn * nx, y: v.y - 1.5 * vn * ny, z: v.z - 1.5 * vn * nz }, true);
      }
      if (p.y < FLOOR_TOP - 0.15) b.setTranslation({ x: 0, y: DOME_Y + 0.3, z: 0 }, true); // safety net
    }
  });

  // Pending: tumble. Idle: an occasional ball settles.
  const nextKick = useRef(0);
  useFrame((state) => {
    const list = bodies.current;
    if (!list || list.length === 0) return;
    const t = state.clock.elapsedTime;
    if (t < nextKick.current) return;
    if (phase === 'pending') {
      nextKick.current = t + 0.22;
      for (const b of list) {
        if (!b || !b.isValid() || Math.random() > 0.5) continue;
        const m = b.mass();
        b.applyImpulse({ x: (Math.random() - 0.5) * 1.8 * m, y: (1.6 + Math.random() * 1.8) * m, z: (Math.random() - 0.5) * 1.8 * m }, true);
      }
    } else {
      nextKick.current = t + 2.5 + Math.random() * 3;
      const b = list[Math.floor(Math.random() * list.length)];
      if (!b || !b.isValid()) return;
      const m = b.mass();
      b.applyImpulse({ x: (Math.random() - 0.5) * 0.4 * m, y: 0.9 * m, z: (Math.random() - 0.5) * 0.4 * m }, true);
    }
  });

  return (
    <InstancedRigidBodies
      key={count}
      ref={bodies}
      instances={instances}
      colliders="ball"
      restitution={0.4}
      friction={0.3}
      linearDamping={0.12}
      angularDamping={0.3}
    >
      <instancedMesh ref={meshRef} args={[geometry, mats.ball, instances.length]} count={instances.length} frustumCulled={false} />
    </InstancedRigidBodies>
  );
}

/** The floor the balls rest on; kinematic so it follows the machine's wobble. */
function DomeFloor({ angleRef }: { angleRef: React.RefObject<number> }) {
  const body = useRef<RapierRigidBody>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  useFrame(() => {
    if (!body.current) return;
    e.set(0, 0, angleRef.current ?? 0);
    q.setFromEuler(e);
    body.current.setNextKinematicRotation(q);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <CylinderCollider args={[0.2, COLLAR_R]} position={[0, FLOOR_TOP - 0.2, 0]} />
    </RigidBody>
  );
}

// ---------------------------------------------------------------------------------------------- capsules
function Capsule({ mats }: { mats: Mats }) {
  const top = useMemo(() => new THREE.SphereGeometry(0.085, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const bottom = useMemo(() => new THREE.SphereGeometry(0.085, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), []);
  return (
    <group>
      <mesh geometry={top} material={mats.purple} />
      <mesh geometry={bottom} material={mats.knob} />
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
        <torusGeometry args={[0.085, 0.011, 10, 32]} />
      </mesh>
    </group>
  );
}

function trayOffset(i: number, n: number): [number, number] {
  if (n === 1) return [0, 0];
  const a = (i / n) * Math.PI * 2 + Math.PI / 2;
  return [Math.cos(a) * 0.085, Math.sin(a) * 0.05];
}

/** Capsules roll out of the chute one by one — only rendered once the contract has answered (phase dropping). */
function Capsules({
  mats,
  phase,
  count,
  flapRef,
  onOut,
}: {
  mats: Mats;
  phase: StagePhase;
  count: number;
  flapRef: React.RefObject<THREE.Group | null>;
  onOut: () => void;
}) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  const n = Math.max(1, Math.min(count, 5));

  useEffect(() => {
    start.current = null;
    done.current = false;
  }, [phase, count]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flap = flapRef.current;
    if (phase !== 'dropping') {
      if (flap) flap.rotation.x += (0 - flap.rotation.x) * 0.2;
      if (phase === 'resting') {
        refs.current.forEach((g, i) => {
          if (!g) return;
          const [ox, oz] = trayOffset(i, n);
          g.visible = true;
          g.position.set(TRAY_POS.x + ox, TRAY_POS.y + 0.12, TRAY_POS.z + oz);
        });
      }
      return;
    }
    if (start.current === null) start.current = t;
    const elapsed = t - start.current;
    const per = 0.75;
    let flapOpen = 0;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const local = elapsed - i * per;
      const [ox, oz] = trayOffset(i, n);
      if (local < 0) {
        g.visible = false;
        return;
      }
      g.visible = true;
      if (local < 0.85) flapOpen = Math.max(flapOpen, Math.min(1, local / 0.18) * (local < 0.65 ? 1 : (0.85 - local) / 0.2));
      const k = Math.min(1, Math.max(0, (local - 0.08) / 0.6));
      const ease = 1 - Math.pow(1 - k, 3);
      const x = TRAY_POS.x + ox * ease;
      const z = 0.8 + (TRAY_POS.z + oz - 0.8) * ease;
      const arc = Math.sin(Math.min(1, k) * Math.PI) * 0.06;
      const bounce = k >= 1 ? Math.abs(Math.sin((local - 0.68) * 14)) * Math.exp(-(local - 0.68) * 7) * 0.05 : 0;
      const y = CHUTE_Y + (TRAY_POS.y + 0.12 - CHUTE_Y) * ease + arc + bounce;
      g.position.set(x, y, z);
      g.rotation.x = ease * 5.5;
    });
    if (flap) flap.rotation.x += (-1.15 * flapOpen - flap.rotation.x) * 0.35;
    if (!done.current && elapsed > (n - 1) * per + 1.1) {
      done.current = true;
      onOut();
    }
  });

  if (phase !== 'dropping' && phase !== 'resting') return null;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={phase === 'resting'}>
          <Capsule mats={mats} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------------------------- camera
const VIEWS: Record<CameraView, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  default: { pos: [0, 1.65, 7.2], target: [0, 1.22, 0], fov: 30 },
  front: { pos: [0, 1.5, 7.3], target: [0, 1.22, 0], fov: 30 },
  'three-quarter': { pos: [4.5, 2.55, 5.3], target: [0, 1.15, 0], fov: 30 },
  closeup: { pos: [1.2, 1.0, 2.6], target: [0, 0.6, 0.82], fov: 30 },
};

function CameraRig({ view, dragging }: { view: CameraView; dragging: React.RefObject<boolean> }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const v = VIEWS[view];
    const parallax = view === 'default' && !dragging.current ? 0.35 : 0;
    camera.position.x += (v.pos[0] + pointer.x * parallax - camera.position.x) * 0.05;
    camera.position.y += (v.pos[1] + pointer.y * parallax * 0.4 - camera.position.y) * 0.05;
    camera.position.z += (v.pos[2] - camera.position.z) * 0.05;
    target.set(...v.target);
    camera.lookAt(target);
  });
  useLayoutEffect(() => {
    const v = VIEWS[view];
    camera.position.set(...v.pos);
    (camera as THREE.PerspectiveCamera).fov = v.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(...v.target));
  }, [camera, view]);
  return null;
}

// ---------------------------------------------------------------------------------------------- the machine
function Machine(props: Scene3DProps & { dragging: React.RefObject<boolean> }) {
  const { quality, phase, crankable, onCrank } = props;
  const mats = useMaterials(quality);
  const segments = quality === 'low' ? 40 : 96;
  const group = useRef<THREE.Group>(null);
  const crankRef = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const amp = useRef(0);
  const glint = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();

  // ---- crank drag: one full turn (either direction) = open pack
  const crank = useRef({ accum: 0, last: 0 });
  const crankWorld = useMemo(() => new THREE.Vector3(), []);
  const screenOf = (v: THREE.Vector3) => {
    const p = v.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };
  const onCrankPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!crankable) return;
    e.stopPropagation();
    crankRef.current?.getWorldPosition(crankWorld);
    const c = screenOf(crankWorld);
    const ang = (x: number, y: number) => Math.atan2(y - c.y, x - c.x);
    props.dragging.current = true;
    crank.current.last = ang(e.clientX, e.clientY);
    crank.current.accum = 0;
    gl.domElement.style.cursor = 'grabbing';
    const move = (ev: PointerEvent) => {
      const a = ang(ev.clientX, ev.clientY);
      let d = a - crank.current.last;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      crank.current.last = a;
      crank.current.accum += d;
      if (Math.abs(crank.current.accum) >= Math.PI * 2) {
        crank.current.accum = 0;
        end();
        onCrank();
      }
    };
    const end = () => {
      props.dragging.current = false;
      gl.domElement.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    // wobble while the transaction is pending, ease back otherwise
    amp.current += ((phase === 'pending' ? 1 : 0) - amp.current) * Math.min(1, dt * 4);
    angle.current = (Math.sin(t * 15) * 0.035 + Math.sin(t * 6.7) * 0.014) * amp.current;
    if (group.current) {
      group.current.rotation.z = angle.current;
      group.current.scale.y = 1 + Math.sin(t * 1.7) * 0.004; // gentle "breathing"
    }
    // crank: follows the drag; spins while pending; settles to the nearest full turn otherwise
    const c = crankRef.current;
    if (c) {
      if (props.dragging.current) c.rotation.z = -crank.current.accum;
      else if (phase === 'pending') c.rotation.z -= dt * 5;
      else c.rotation.z += (Math.round(c.rotation.z / (Math.PI * 2)) * Math.PI * 2 - c.rotation.z) * Math.min(1, dt * 6);
    }
    // a moving highlight glinting over the glass
    if (glint.current) glint.current.position.set(Math.cos(t * 0.35) * 1.7, DOME_Y + 0.7 + Math.sin(t * 0.5) * 0.2, 1.8);
    // crank screen position, for pointer hints and the automated recording
    if (Math.floor(t * 10) % 3 === 0 && crankRef.current) {
      crankRef.current.getWorldPosition(crankWorld);
      const s = screenOf(crankWorld);
      const el = gl.domElement.parentElement;
      if (el) {
        el.dataset.crankX = String(Math.round(s.x));
        el.dataset.crankY = String(Math.round(s.y));
      }
    }
  });

  return (
    <>
      <group ref={group}>
        <MachineBody
          mats={mats}
          segments={segments}
          crankRef={crankRef}
          flapRef={flapRef}
          crankable={crankable}
          onCrankPointerDown={onCrankPointerDown}
        />
        <Dome mats={mats} quality={quality} />
        <Capsules mats={mats} phase={phase} count={props.capsules} flapRef={flapRef} onOut={props.onCapsulesOut} />
      </group>
      <Physics gravity={[0, -9.81, 0]}>
        <DomeFloor angleRef={angle} />
        <Gumballs count={ballCount(props.vaultPct, quality)} quality={quality} mats={mats} phase={phase} angleRef={angle} />
      </Physics>
      <CloudPlatform mats={mats} />
      <pointLight ref={glint} intensity={8} distance={4.5} color="#ffffff" />
    </>
  );
}

function FirstFrame({ onFirstFrame }: { onFirstFrame: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    requestAnimationFrame(onFirstFrame);
  });
  return null;
}

/** Frames per second, published on the canvas wrapper (data-fps) for the self-check. */
function FpsProbe() {
  const { gl } = useThree();
  const frames = useRef(0);
  const since = useRef(0);
  useFrame((state) => {
    frames.current++;
    const t = state.clock.elapsedTime;
    if (t - since.current >= 1) {
      const el = gl.domElement.parentElement;
      if (el) el.dataset.fps = String(Math.round(frames.current / (t - since.current)));
      frames.current = 0;
      since.current = t;
    }
  });
  return null;
}

/** Unit sphere with a vertical colour gradient: deep plum below the horizon, soft lilac above. */
const studioRoom = (() => {
  const g = new THREE.SphereGeometry(1, 32, 24);
  const pos = g.attributes.position;
  const low = new THREE.Color('#3b2160');
  const high = new THREE.Color('#e9def3');
  const c = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.smoothstep(y, -0.35, 0.3);
    c.copy(low).lerp(high, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
})();

/** Studio lighting built in code (no HDR download): soft boxes inside a lilac-to-plum room. */
function Studio({ high }: { high: boolean }) {
  return (
    <Environment resolution={high ? 256 : 128} frames={1}>
      {/* bright above the horizon, deep plum below, blended smoothly: gives chrome its silver-with-dark-edge look
          without a hard horizon line reflecting in the glass */}
      <mesh scale={30} geometry={studioRoom}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} />
      </mesh>
      <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 6, 1]} />
      <Lightformer form="rect" intensity={2.2} position={[-5, 2, 2]} rotation-y={Math.PI / 2} scale={[2, 7, 1]} />
      <Lightformer form="rect" intensity={2.2} position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[2, 7, 1]} />
      <Lightformer form="rect" intensity={1.0} color="#fee7fa" position={[0, 2, 7]} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#b593c7" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="ring" intensity={2.6} color="#ffffff" position={[2.5, 3, 4]} scale={1.2} />
    </Environment>
  );
}

export default function Scene3D(props: Scene3DProps) {
  const dragging = useRef(false);
  const high = props.quality === 'high';
  // WebGL context loss (GPU pressure, driver reset, tab backgrounding): show the flat machine meanwhile, then
  // rebuild the whole scene on restore so the one-time studio lighting is regenerated too.
  const [lost, setLost] = useState(false);
  const lostRef = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [generation, setGeneration] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapper} style={{ position: 'absolute', inset: 0 }}>
      {(lost || !drawn) && (
        // Flat machine until the 3D scene has drawn its first frame (no empty flash), and while the GPU context is lost.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/art/machine/machine-2d.svg" alt="" style={{ position: 'absolute', inset: 0, margin: 'auto', height: '92%', opacity: 0.6 }} />
      )}
      <SceneCanvas
        key={generation}
        {...props}
        high={high}
        dragging={dragging}
        hidden={lost}
        onFirstFrame={() => setDrawn(true)}
        onLost={() => {
          const el = wrapper.current;
          if (el) el.dataset.contextLost = String(Number(el.dataset.contextLost ?? 0) + 1);
          lostRef.current = true;
          setLost(true);
          // Browsers may never restore a lost context: if nothing happens soon, start a fresh canvas.
          window.setTimeout(() => {
            if (!lostRef.current) return;
            lostRef.current = false;
            setLost(false);
            setGeneration((g) => g + 1);
          }, 2500);
        }}
        onRestored={() => {
          lostRef.current = false;
          setLost(false);
          setGeneration((g) => g + 1);
        }}
      />
    </div>
  );
}

function SceneCanvas({
  high,
  dragging,
  hidden,
  onFirstFrame,
  onLost,
  onRestored,
  ...props
}: Scene3DProps & {
  high: boolean;
  dragging: React.RefObject<boolean>;
  hidden: boolean;
  onFirstFrame: () => void;
  onLost: () => void;
  onRestored: () => void;
}) {
  return (
    <Canvas
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (e) => {
          // react-three-fiber deliberately drops the context when a canvas unmounts: that is not a failure.
          if (!canvas.isConnected) return;
          e.preventDefault(); // allow the browser to restore it
          console.warn('[gaballs] WebGL context lost', { connected: canvas.isConnected });
          onLost();
        });
        canvas.addEventListener('webglcontextrestored', () => {
          console.warn('[gaballs] WebGL context restored');
          onRestored();
        });
      }}
      dpr={high ? [1, 1.75] : [1, 1.3]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
      camera={{ position: VIEWS.default.pos, fov: VIEWS.default.fov, near: 0.1, far: 60 }}
      style={{ touchAction: 'none', visibility: hidden ? 'hidden' : 'visible' }}
    >
      <CameraRig view={props.view ?? 'default'} dragging={dragging} />
      <hemisphereLight args={['#fee7fa', '#b593c7', 0.5]} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -2]} intensity={0.5} color="#d5b8e3" />
      <Studio high={high} />
      <Machine {...props} dragging={dragging} />
      <ContactShadows
        position={[0, 0.005, 0]}
        scale={3.8}
        blur={2.6}
        opacity={0.5}
        far={1.2}
        resolution={high ? 512 : 256}
        color="#563791"
        frames={1}
      />
      <FpsProbe />
      <FirstFrame onFirstFrame={onFirstFrame} />
    </Canvas>
  );
}
