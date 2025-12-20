'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Rocket } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import HyperDriveEffect from '@/components/HyperDriveEffect';
import Hyperspace from '@/components/Hyperspace';
import Constellation from '@/components/Constellation';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHyperDriving, setIsHyperDriving] = useState(false);
  const [hyperspaceIntensity, setHyperspaceIntensity] = useState(200); // 默认少量粒子

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // 登录时增加粒子数量，营造星际穿越感
    setHyperspaceIntensity(1500); // 大幅增加粒子数量

    // 模拟提交延迟
    setTimeout(() => {
      setIsHyperDriving(true);
    }, 2000); // 给更多时间看星际穿越效果
  };

  const handleHyperDriveComplete = () => {
    setIsHyperDriving(false);
    setIsSubmitting(false);
    // 这里可以添加导航到主应用的逻辑
    // router.push('/dashboard');
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
      {/* 3D 背景 */}
      <div className="absolute inset-0 z-0">
        <Canvas gl={{ antialias: false }}>
          <color attach="background" args={['#000000']} />
          {/* 摄像机位置调整，配合粒子运动方向 */}
          <PerspectiveCamera makeDefault position={[0, 0, 20]} fov={75} />

          {/* 一直显示星系 */}
          <Constellation />

          {/* 少量粒子往前移动，登录时增加 */}
          <Hyperspace particleCount={hyperspaceIntensity} />
        </Canvas>
      </div>

      {/* Hyper-Drive 动画效果 (全屏覆盖) */}
      <HyperDriveEffect isActive={isHyperDriving} onComplete={handleHyperDriveComplete} />

      {/* 驾驶舱面板 */}
      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="glass rounded-3xl p-8 glow-cyan border-2 border-cyan-500/30">
          {/* 标题 */}
          <motion.div
            className="text-center mb-8"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-4xl font-bold text-gradient mb-2">Soulverse</h1>
            <p className="text-gray-400">进入平行时空</p>
          </motion.div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email 输入框 */}
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <label className="block text-sm font-medium text-gray-300 mb-2">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 glass border border-cyan-500/20 rounded-lg focus:outline-none focus:border-cyan-500 focus:glow-cyan transition-all duration-300 text-white placeholder-gray-500"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </motion.div>

            {/* Password 输入框 */}
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-sm font-medium text-gray-300 mb-2">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-cyan-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 glass border border-cyan-500/20 rounded-lg focus:outline-none focus:border-cyan-500 focus:glow-cyan transition-all duration-300 text-white placeholder-gray-500"
                  placeholder="••••••••"
                  required
                />
              </div>
            </motion.div>

            {/* 提交按钮 */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 glass rounded-lg glow-cyan hover:glow-purple transition-all duration-300 font-bold text-lg text-gradient relative overflow-hidden group"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <motion.div
                      className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                    启动中...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5" />
                    Start Journey
                  </>
                )}
              </span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.5 }}
              />
            </motion.button>
          </form>

          {/* 底部链接 */}
          <motion.div
            className="mt-6 text-center text-sm text-gray-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <a href="#" className="hover:text-cyan-400 transition-colors">
              忘记密码？
            </a>
            <span className="mx-2">|</span>
            <a href="#" className="hover:text-cyan-400 transition-colors">
              注册新账户
            </a>
          </motion.div>
        </div>

        {/* 装饰性元素 - 驾驶舱风格 */}
        <div className="absolute -top-20 -left-20 w-40 h-40 border border-cyan-500/20 rounded-full blur-xl" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 border border-purple-500/20 rounded-full blur-xl" />
      </motion.div>
    </main>
  );
}

