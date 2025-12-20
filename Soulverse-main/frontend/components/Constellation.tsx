'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function Constellation() {
  const linesRef = useRef<THREE.LineSegments>(null);
  const pointsRef = useRef<THREE.Points>(null);
  
  const count = 150; // 增加节点数量，让星系更丰富
  const connectionDistance = 6; // 减小连接距离，让连线更精细
  
  const particles = useMemo(() => {
    const pos = [];
    const vel = [];
    for(let i=0; i<count; i++) {
      pos.push(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20
      );
      vel.push(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      );
    }
    return { pos: new Float32Array(pos), vel: new Float32Array(vel) };
  }, []);

  useFrame(() => {
    if (!pointsRef.current || !linesRef.current) return;
    
    const positions = particles.pos;
    const velocities = particles.vel;
    
    // 更新粒子位置
    for(let i=0; i<count; i++) {
      positions[i*3] += velocities[i*3];
      positions[i*3+1] += velocities[i*3+1];
      positions[i*3+2] += velocities[i*3+2];
      
      // 边界反弹
      if(Math.abs(positions[i*3]) > 20) velocities[i*3] *= -1;
      if(Math.abs(positions[i*3+1]) > 15) velocities[i*3+1] *= -1;
      if(Math.abs(positions[i*3+2]) > 10) velocities[i*3+2] *= -1;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    
    // 更新连线
    const linePositions = [];
    // 简单的 O(N^2) 距离检测
    for(let i=0; i<count; i++) {
      for(let j=i+1; j<count; j++) {
        const dx = positions[i*3] - positions[j*3];
        const dy = positions[i*3+1] - positions[j*3+1];
        const dz = positions[i*3+2] - positions[j*3+2];
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < connectionDistance) {
          // 添加起点和终点
          linePositions.push(
            positions[i*3], positions[i*3+1], positions[i*3+2],
            positions[j*3], positions[j*3+1], positions[j*3+2]
          );
        }
      }
    }
    
    // 更新连线几何体
    const lineGeo = linesRef.current.geometry;
    if (linePositions.length > 0) {
      const vertices = new Float32Array(linePositions);
      lineGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      lineGeo.setDrawRange(0, linePositions.length / 3);
    } else {
      lineGeo.setDrawRange(0, 0);
    }
  });

  return (
    <group>
      {/* 节点 */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={particles.pos}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.15} color="#00ffff" transparent opacity={0.7} />
      </points>
      
      {/* 连线 */}
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial 
          color="#00ffff" 
          transparent 
          opacity={0.15} 
          linewidth={0.5}
          blending={THREE.AdditiveBlending} 
        />
      </lineSegments>
    </group>
  );
}

