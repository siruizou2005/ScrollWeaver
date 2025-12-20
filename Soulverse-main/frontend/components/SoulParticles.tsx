'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// 顶点着色器
const vertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uMouse;
  
  attribute float aScale;
  attribute float aSpeed;
  
  varying vec3 vColor;

  void main() {
    vec3 pos = position;
    
    // 1. 基础悬浮运动 (Anti-gravity float)
    pos.y += sin(uTime * aSpeed + pos.x) * 0.1;
    pos.x += cos(uTime * aSpeed * 0.5 + pos.y) * 0.1;
    
    // 2. 鼠标交互：斥力场 (增强版)
    vec3 mousePos = vec3(uMouse.x * 40.0, uMouse.y * 20.0, 0.0);
    float dist = distance(pos, mousePos);
    float radius = 12.0; // 增大影响半径
    
    if (dist < radius) {
      float force = (radius - dist) / radius;
      force = pow(force, 2.0); // 非线性衰减，中心斥力极强
      vec3 dir = normalize(pos - mousePos);
      pos += dir * force * 5.0; // 大幅增强推力
      
      // 额外的 Z 轴扰动，增加立体感
      pos.z += force * 2.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // 大小随距离衰减
    gl_PointSize = aScale * uPixelRatio * (60.0 / -mvPosition.z); // 粒子稍微变大
    
    // 颜色逻辑：核心青色，外围深蓝
    float colorDist = length(pos) / 20.0;
    vec3 colorCyan = vec3(0.0, 1.0, 1.0); 
    vec3 colorBlue = vec3(0.1, 0.3, 0.8); // 稍微提亮蓝色
    
    vColor = mix(colorCyan, colorBlue, colorDist + sin(uTime) * 0.2);
    
    // 鼠标高亮：变白且变亮
    if (dist < radius) {
      float highlight = (radius - dist) / radius;
      vColor = mix(vColor, vec3(1.0), highlight * 0.8);
    }
  }
`;

// 片元着色器：绘制圆形光点
const fragmentShader = `
  varying vec3 vColor;

  void main() {
    // 完美的圆形裁剪
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    
    // 边缘柔化
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);

    gl_FragColor = vec4(vColor, alpha);
  }
`;

export default function SoulParticles() {
  const points = useRef<THREE.Points>(null);
  const { gl, viewport } = useThree();

  // 参数配置 - 极简风格
  const count = 1200; // 减少数量，保持稀疏感
  
  const { positions, scales, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // 随机分布在宽广的空间
      // 扁平化分布，类似银河盘面
      const r = 15 + Math.random() * 25; // 环状分布
      const theta = Math.random() * Math.PI * 2;
      
      // 加上一些垂直随机性
      const x = Math.cos(theta) * r;
      const y = (Math.random() - 0.5) * 10;
      const z = Math.sin(theta) * r * 0.5; // 椭圆
      
      // 填充中心区域
      const fillX = (Math.random() - 0.5) * 40;
      const fillY = (Math.random() - 0.5) * 20;
      const fillZ = (Math.random() - 0.5) * 10;
      
      // 混合两种分布
      if (Math.random() > 0.3) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      } else {
        positions[i * 3] = fillX;
        positions[i * 3 + 1] = fillY;
        positions[i * 3 + 2] = fillZ;
      }

      scales[i] = Math.random() * 0.5 + 0.5;
      speeds[i] = Math.random() * 0.5 + 0.5;
    }

    return { positions, scales, speeds };
  }, []);

  useFrame((state) => {
    if (points.current) {
      const material = points.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
      
      // 平滑更新鼠标 uniforms
      // 映射鼠标坐标到 -1 ~ 1
      const targetX = (state.pointer.x * viewport.width) / viewport.width; // normalized
      const targetY = (state.pointer.y * viewport.height) / viewport.height;
      
      material.uniforms.uMouse.value.x = state.pointer.x;
      material.uniforms.uMouse.value.y = state.pointer.y;
      
      // 缓慢自转
      points.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aScale"
          count={scales.length}
          array={scales}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aSpeed"
          count={speeds.length}
          array={speeds}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors={true}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uPixelRatio: { value: gl.getPixelRatio() },
          uMouse: { value: new THREE.Vector2(0, 0) }
        }}
        transparent={true}
      />
    </points>
  );
}
