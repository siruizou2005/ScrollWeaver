'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HyperspaceProps {
  particleCount?: number; // 粒子数量，默认少量
}

export default function Hyperspace({ particleCount = 200 }: HyperspaceProps) {
  const points = useRef<THREE.Points>(null);
  const count = particleCount;

  // 粒子数据：从中心向外统一移动
  const { positions, velocities, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // 从中心（登录框位置）开始
      const startRadius = Math.random() * 3; // 从中心附近开始
      const angle = Math.random() * Math.PI * 2; // 随机角度
      const elevation = (Math.random() - 0.5) * Math.PI * 0.2; // 上下角度
      
      // 初始位置
      pos[i3] = Math.cos(elevation) * Math.cos(angle) * startRadius;
      pos[i3 + 1] = Math.sin(elevation) * startRadius;
      pos[i3 + 2] = Math.cos(elevation) * Math.sin(angle) * startRadius;
      
      // 速度：统一向外移动
      const speed = Math.random() * 0.04 + 0.015; // 稍微加快速度
      vel[i3] = Math.cos(elevation) * Math.cos(angle) * speed;
      vel[i3 + 1] = Math.sin(elevation) * speed;
      vel[i3 + 2] = Math.cos(elevation) * Math.sin(angle) * speed;
      
      phases[i] = Math.random() * Math.PI * 2; // 闪烁相位
    }
    
    return { positions: pos, velocities: vel, phases };
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    
    const time = state.clock.getElapsedTime();
    const positions = points.current.geometry.attributes.position.array as Float32Array;
    const colors = points.current.geometry.attributes.color.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // 更新位置
      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];
      
      // 如果飞出屏幕太远，重置到中心
      const radius = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2);
      if (radius > 30) {
        // 重置到中心附近
        const startRadius = Math.random() * 3;
        const angle = Math.random() * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * Math.PI * 0.2;
        
        positions[i3] = Math.cos(elevation) * Math.cos(angle) * startRadius;
        positions[i3 + 1] = Math.sin(elevation) * startRadius;
        positions[i3 + 2] = Math.cos(elevation) * Math.sin(angle) * startRadius;
        
        // 重新设置速度方向
        const speed = Math.random() * 0.04 + 0.015;
        velocities[i3] = Math.cos(elevation) * Math.cos(angle) * speed;
        velocities[i3 + 1] = Math.sin(elevation) * speed;
        velocities[i3 + 2] = Math.cos(elevation) * Math.sin(angle) * speed;
      }
      
      // 闪烁效果：使用 sin 函数创建闪烁
      const twinkle = (Math.sin(time * 2 + phases[i]) + 1) * 0.5; // 0-1
      const brightness = 0.3 + twinkle * 0.7; // 0.3-1.0
      
      colors[i3] = brightness;     // R
      colors[i3 + 1] = brightness; // G
      colors[i3 + 2] = brightness; // B
    }
    
    points.current.geometry.attributes.position.needsUpdate = true;
    points.current.geometry.attributes.color.needsUpdate = true;
  });

  // 初始化颜色数组
  const colors = useMemo(() => {
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = 1;     // R
      cols[i * 3 + 1] = 1; // G
      cols[i * 3 + 2] = 1; // B
    }
    return cols;
  }, []);

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors={true}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        sizeAttenuation={true}
      />
    </points>
  );
}

