'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointMaterial, Points } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

function Hemisphere({ side, count, color }: { readonly side: -1 | 1; readonly count: number; readonly color: string }) {
  const group = useRef<Group>(null);
  const { pointer } = useThree();
  const positions = useMemo(() => {
    const points = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const theta = (index * 2.399963) % (Math.PI * 2);
      const y = 1 - (index / Math.max(1, count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const wobble = 1 + Math.sin(index * 1.71) * .09;
      points[index * 3] = (Math.abs(Math.cos(theta) * radius) * side * 1.35 + side * .05) * wobble;
      points[index * 3 + 1] = y * 1.18 * wobble;
      points[index * 3 + 2] = Math.sin(theta) * radius * .86 * wobble;
    }
    return points;
  }, [count, side]);
  useFrame((state, delta) => {
    if (!group.current) return;
    const active = side === -1 ? pointer.x < 0 : pointer.x >= 0;
    group.current.rotation.y += delta * (active ? .09 : .035);
    group.current.rotation.x += (pointer.y * .08 - group.current.rotation.x) * .025;
    group.current.position.x += (pointer.x * .07 - group.current.position.x) * .025;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.4 + side) * .012 + (active ? .025 : 0);
    group.current.scale.setScalar(pulse);
  });
  return <group ref={group}><Points positions={positions} stride={3} frustumCulled><PointMaterial transparent color={color} size={.024} sizeAttenuation depthWrite={false} opacity={.92} /></Points></group>;
}

export default function BrainParticles({ compact = false }: { readonly compact?: boolean }) {
  const count = compact ? 620 : 1550;
  return (
    <Canvas camera={{ position: [0, 0, 4.4], fov: 42 }} dpr={[1, compact ? 1.25 : 1.6]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <fog attach="fog" args={['#050607', 3.2, 7]} />
      <Hemisphere side={-1} count={count} color="#ff334f" />
      <Hemisphere side={1} count={count} color={compact ? '#36d9f5' : '#276dff'} />
    </Canvas>
  );
}
