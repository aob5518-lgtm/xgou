'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { PointMaterial, Points } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import type { Group, Points as ThreePoints } from 'three';

export type BrainFocus = 'left' | 'core' | 'right' | null;

function brainSurface(count: number, side: -1 | 1, layer: 'surface' | 'core') {
  const points = new Float32Array(count * 3);
  const layerScale = layer === 'core' ? .67 : 1;
  for (let index = 0; index < count; index += 1) {
    const u = (index + .5) / count;
    const theta = index * 2.399963229728653;
    const latitude = Math.acos(1 - 2 * u);
    const sx = Math.sin(latitude) * Math.cos(theta);
    const sy = Math.cos(latitude);
    const sz = Math.sin(latitude) * Math.sin(theta);
    const fold = 1 + .08 * Math.sin(theta * 5 + sy * 7) + .05 * Math.sin(theta * 9 - sy * 11);
    const cleft = .17 + (1 - Math.abs(sy)) * .025;
    const sideBulge = Math.pow(Math.abs(sx), .76);
    const topIrregularity = Math.max(0, sy) * (.032 * Math.sin(theta * 4) + .022 * Math.cos(theta * 7));
    let shapedY = Math.sign(sy) * Math.pow(Math.abs(sy), .82) * 1.14 + topIrregularity;
    if (shapedY < -.87) shapedY = -.87 + (shapedY + .87) * .22;
    points[index * 3] = side * (cleft + sideBulge * 1.2 * fold * layerScale);
    points[index * 3 + 1] = shapedY * layerScale;
    points[index * 3 + 2] = sz * .92 * fold * layerScale;
  }
  return points;
}

function Hemisphere({ side, count, focus }: { readonly side: -1 | 1; readonly count: number; readonly focus: BrainFocus }) {
  const group = useRef<Group>(null);
  const outer = useMemo(() => brainSurface(count, side, 'surface'), [count, side]);
  const core = useMemo(() => brainSurface(Math.round(count * .38), side, 'core'), [count, side]);
  const isActive = focus === (side === -1 ? 'left' : 'right');
  const isDimmed = focus !== null && focus !== 'core' && !isActive;
  useFrame((state, delta) => {
    if (!group.current) return;
    const elapsed = state.clock.elapsedTime;
    group.current.rotation.y += delta * .008 * side;
    group.current.position.y = Math.sin(elapsed * .55 + side) * .018;
    const target = 1 + Math.sin(elapsed * .8 + side) * .008 + (isActive ? .035 : 0);
    group.current.scale.setScalar(group.current.scale.x + (target - group.current.scale.x) * .035);
  });
  const outerColor = side === -1 ? '#ff334f' : '#36d9f5';
  const coreColor = side === -1 ? '#ff5a36' : '#276dff';
  return <group ref={group} position={[side * .08, 0, 0]}>
    <Points positions={outer} stride={3} frustumCulled><PointMaterial transparent color={outerColor} size={isActive ? .032 : .025} sizeAttenuation depthWrite={false} opacity={isDimmed ? .28 : .9} /></Points>
    <Points positions={core} stride={3} frustumCulled><PointMaterial transparent color={coreColor} size={isActive ? .036 : .029} sizeAttenuation depthWrite={false} opacity={isDimmed ? .18 : .72} /></Points>
  </group>;
}

function SynapseBridge({ active }: { readonly active: boolean }) {
  const ref = useRef<ThreePoints>(null);
  const positions = useMemo(() => {
    const points = new Float32Array(18 * 3);
    for (let index = 0; index < 18; index += 1) {
      const t = index / 17;
      points[index * 3] = -.22 + t * .44;
      points[index * 3 + 1] = Math.sin(t * Math.PI * 4) * .12;
      points[index * 3 + 2] = Math.cos(t * Math.PI * 3) * .08;
    }
    return points;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * .7) * .025;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * .08;
    ref.current.scale.setScalar(active ? pulse : 1);
  });
  return <Points ref={ref} positions={positions} stride={3} frustumCulled><PointMaterial transparent color="#f4f7fa" size={active ? .045 : .026} sizeAttenuation depthWrite={false} opacity={active ? .9 : .35} /></Points>;
}

export default function BrainParticles({ compact = false, focus = null }: { readonly compact?: boolean; readonly focus?: BrainFocus }) {
  const count = compact ? 630 : 1690;
  return <Canvas camera={{ position: [0, 0, compact ? 4.7 : 4.05], fov: compact ? 43 : 40 }} dpr={[1, compact ? 1.2 : 1.55]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
    <fog attach="fog" args={['#050607', 3.2, 7]} /><Hemisphere side={-1} count={count} focus={focus} /><Hemisphere side={1} count={count} focus={focus} /><SynapseBridge active={focus === 'core'} />
  </Canvas>;
}
