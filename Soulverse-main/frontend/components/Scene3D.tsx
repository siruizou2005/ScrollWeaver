'use client';

import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import SoulParticles from './SoulParticles';
import Planet from './Planet';

interface Scene3DProps {
  scrollProgress: number;
  showPlanet?: boolean;
}

export default function Scene3D({ scrollProgress, showPlanet = false }: Scene3DProps) {
  return (
    <div className="fixed inset-0 -z-10 bg-black">
      <Canvas
        dpr={[1, 2]}
        gl={{ 
          antialias: true, // Antigravity 风格需要锐利的边缘
          alpha: false,
          powerPreference: "high-performance"
        }} 
      >
        <color attach="background" args={['#050508']} />
        
        {/* 极简风格不需要浓雾，只需要一点点深度 */}
        <fogExp2 attach="fog" args={['#050508', 0.02]} />

        <PerspectiveCamera makeDefault position={[0, 0, 30]} fov={45} />
        
        <SoulParticles />
        
        {showPlanet && <Planet />}
      </Canvas>
    </div>
  );
}

