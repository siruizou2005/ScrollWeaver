'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

export default function Planet() {
  const ref = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.005;
      ref.current.rotation.x += 0.002;
    }
  });
  
  return (
    <Sphere ref={ref} args={[2, 64, 64]} position={[0, 0, 0]}>
      <MeshDistortMaterial
        color="#9d4edd"
        attach="material"
        distort={0.3}
        speed={2}
        roughness={0.1}
        metalness={0.8}
        emissive="#9d4edd"
        emissiveIntensity={0.5}
      />
    </Sphere>
  );
}

