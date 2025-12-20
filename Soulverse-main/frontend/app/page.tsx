'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ChevronDown, Sparkles, Rocket, Brain, Heart, Zap, BookOpen } from 'lucide-react';
import Scene3D from '@/components/Scene3D';
import WarpEffect from '@/components/WarpEffect';
import HelpGuide from '@/components/HelpGuide';

export default function Home() {
  const router = useRouter();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isWarping, setIsWarping] = useState(false);
  const { scrollYProgress } = useScroll();
  const helpGuideRef = useRef(null);

  useEffect(() => {
    let lastValue = 0;

    const updateProgress = (latest: number) => {
      if (Math.abs(latest - lastValue) > 0.01) {
        setScrollProgress(latest);
        lastValue = latest;
      }
    };

    const unsubscribe = scrollYProgress.on('change', updateProgress);
    return () => {
      unsubscribe();
    };
  }, [scrollYProgress]);

  const handleLaunch = () => {
    setIsWarping(true);
  };

  const handleWarpComplete = () => {
    router.push('/login');
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* 3D 背景 */}
      <Scene3D scrollProgress={scrollProgress} showPlanet={false} />

      {/* 全局暗角叠加 */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_center,transparent_0%,#000000_130%)]" />

      <WarpEffect isActive={isWarping} onComplete={handleWarpComplete} />

      {/* 帮助指南 */}
      <HelpGuide triggerRef={helpGuideRef} />

      <motion.div
        className="relative z-10"
        animate={isWarping ? {
          scale: [1, 5],
          opacity: [1, 0],
          filter: ['blur(0px)', 'blur(10px)']
        } : {
          scale: 1,
          opacity: 1,
          filter: 'blur(0px)'
        }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      >
        {/* Section 1: Hero */}
        <section className="h-screen flex flex-col items-center justify-center relative px-4">
          <motion.div
            className="text-center mb-16 relative"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            {/* 标题背景光晕 */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[200px] bg-black/50 blur-[50px] pointer-events-none" />

            <motion.h1
              className="text-6xl md:text-8xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 tracking-tight drop-shadow-[0_0_15px_rgba(0,255,255,0.3)]"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.8 }}
            >
              SOULVERSE
            </motion.h1>
            <motion.p
              className="text-xl md:text-2xl text-gray-300 font-light tracking-wide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              基于多 Agent 模拟的“平行时空”社交沙盒
            </motion.p>
          </motion.div>

          <motion.div
            className="text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <div className="flex flex-col items-center gap-4">
              <motion.button
                onClick={handleLaunch}
                className="group relative px-12 py-6 text-2xl font-bold text-white glass rounded-full hover:bg-white/10 transition-all duration-500 overflow-hidden"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="relative z-10">进入平行时空</span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                <div className="absolute inset-0 border border-cyan-500/30 rounded-full group-hover:border-cyan-500/60 transition-colors" />
              </motion.button>
              
              <motion.button
                onClick={() => helpGuideRef.current?.open()}
                className="flex items-center gap-2 px-6 py-3 text-sm text-gray-400 hover:text-cyan-400 transition-colors group"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <BookOpen className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
                <span>使用指南</span>
              </motion.button>
            </div>
          </motion.div>

          <motion.div
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <p className="text-xs text-gray-500 uppercase tracking-widest">Scroll to Explore</p>
            <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
              <ChevronDown className="w-5 h-5 text-gray-500" />
            </motion.div>
          </motion.div>
        </section>

        {/* Section 2: Project Overview */}
        <section className="min-h-screen flex items-center justify-center px-4 py-20">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-8">
                <h2 className="text-4xl font-bold mb-4 text-white">项目概述</h2>
                <div className="w-20 h-1 bg-gradient-to-r from-cyan-500 to-purple-500" />
              </div>

              <div className="space-y-8 text-gray-300 leading-relaxed">
                <div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-2">1.1 一句话定位</h3>
                  <p>Soulverse 是一个“平行时空”社交沙盒。每位用户都能基于兴趣图谱生成一个“AI 灵魂”（数字孪生 Agent）。这个 AI 灵魂可以在虚拟世界中自主生活、结识同类，而用户既可以“零压力”观察，也能随时“灵魂降临”亲自互动。</p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-purple-400 mb-2">1.2 核心痛点与目标</h3>
                  <ul className="space-y-3 list-disc list-inside marker:text-purple-500">
                    <li><span className="text-white font-medium">社交启动困难：</span> 解决“破冰”尴尬，降低社交消耗。</li>
                    <li><span className="text-white font-medium">匹配质量肤浅：</span> 用动态互动证据取代静态标签。</li>
                    <li><span className="text-white font-medium">时间精力有限：</span> 即使离线，AI 也在为你延续故事。</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-2">1.3 目标用户与价值</h3>
                  <p>专为 Z 世代打造，提供“低压力、高沉浸”的全新社交体验。观察者模式让你零压力看戏，灵魂降临让你随时接管人生。</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="aspect-square rounded-2xl overflow-hidden relative glass border border-white/10">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 to-purple-900/20" />
                {/* 示意图：AI 灵魂网络 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-64 h-64">
                    <motion.div
                      className="absolute inset-0 border-2 border-cyan-500/30 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-4 border-2 border-purple-500/30 rounded-full"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Brain className="w-24 h-24 text-white/80" />
                    </div>
                    {/* 环绕的小点 */}
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                        style={{
                          top: '50%',
                          left: '50%',
                          transformOrigin: '0 100px', // 旋转半径
                        }}
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 10,
                          repeat: Infinity,
                          ease: "linear",
                          delay: i * (10 / 6)
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Section 3: Core Gameplay */}
        <section className="min-h-screen flex flex-col justify-center px-4 py-20 relative bg-black/20">
          <div className="max-w-7xl mx-auto w-full">
            <motion.div
              className="text-center mb-20"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-5xl font-bold mb-6 text-gradient">核心玩法</h2>
              <p className="text-xl text-gray-400">观察—降临—再观察的低压社交闭环</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              <GameplayCard
                icon={<Sparkles className="w-12 h-12" />}
                title="观察者模式"
                subtitle="零压力社交"
                description="看着你的 AI 替你破冰、交友、生活。全天候自主运行，坐看剧情发展。"
                color="cyan"
                delay={0.1}
              />
              <GameplayCard
                icon={<Zap className="w-12 h-12" />}
                title="灵魂降临"
                subtitle="高沉浸互动"
                description="关键时刻一键接管，亲自改写剧情。从旁观者变身主角，掌握命运走向。"
                color="purple"
                delay={0.2}
              />
              <GameplayCard
                icon={<Heart className="w-12 h-12" />}
                title="动态匹配"
                subtitle="拒绝静态标签"
                description="基于 AI 互动产生的真实故事来寻找灵魂伴侣。看见灵魂共振的每一个瞬间。"
                color="cyan"
                delay={0.3}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Innovation & Tech */}
        <section className="min-h-screen flex items-center justify-center px-4 py-20 relative bg-black/20">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-5xl font-bold mb-6 text-gradient">技术特色</h2>
              <p className="text-xl text-gray-400">前沿AI技术与创新架构的完美融合</p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-8 mb-12">
              {/* 核心创新点 */}
              <motion.div
                className="glass p-8 rounded-2xl border border-cyan-500/20 hover:border-cyan-500/40 transition-all"
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-cyan-400">核心创新点</h3>
                </div>
                <ul className="space-y-4 text-gray-300">
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>从"单聊关系"升级为"世界级互动"多 Agent 社会系统，支持复杂的社会网络模拟。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>完整的 Generative Agents "记忆—反思—规划"范式，每个Agent都有独立的认知系统。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>可回溯的"社交证据"，基于真实互动数据而非静态标签进行智能匹配。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>多用户实时协作系统，支持多人同时参与同一对话场景，智能调度确保流畅体验。</p>
                  </li>
                </ul>
              </motion.div>

              {/* 技术架构 */}
              <motion.div
                className="glass p-8 rounded-2xl border border-purple-500/20 hover:border-purple-500/40 transition-all"
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-purple-400">技术架构</h3>
                </div>
                <ul className="space-y-4 text-gray-300">
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>基于 <span className="text-white font-bold">ScrollWeaver</span> 多智能体引擎，支持大规模Agent并发模拟。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>RAG 向量检索 + ChromaDB 长期记忆存储，实现Agent的持久化记忆和情境感知。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>灵活的大模型适配层，支持 OpenAI GPT、Google Gemini、DeepSeek 等多种LLM。</p>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-2.5 flex-shrink-0" />
                    <p>实时 WebSocket 通信架构，确保多用户场景下的低延迟同步体验。</p>
                  </li>
                </ul>
              </motion.div>
            </div>

            {/* 技术亮点卡片 */}
            <div className="grid md:grid-cols-3 gap-6">
              <motion.div
                className="glass p-6 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-3xl mb-3">🧠</div>
                <h4 className="text-lg font-bold text-white mb-2">智能记忆系统</h4>
                <p className="text-sm text-gray-400">每个Agent都有独立的记忆库，能够回忆过往互动，形成连贯的人格表现。</p>
              </motion.div>

              <motion.div
                className="glass p-6 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                <div className="text-3xl mb-3">🌐</div>
                <h4 className="text-lg font-bold text-white mb-2">多用户协作</h4>
                <p className="text-sm text-gray-400">支持多人同时参与，实时同步对话状态，智能调度确保每个用户都能参与互动。</p>
              </motion.div>

              <motion.div
                className="glass p-6 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <div className="text-3xl mb-3">⚡</div>
                <h4 className="text-lg font-bold text-white mb-2">实时响应</h4>
                <p className="text-sm text-gray-400">基于WebSocket的实时通信，毫秒级消息同步，流畅的交互体验。</p>
              </motion.div>
            </div>

            <motion.div
              className="mt-12 text-center"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              <p className="text-gray-400 text-sm">
                * 本项目聚焦于"灵魂创新"赛道，旨在为 Soul App 孵化下一代社交范式。
              </p>
            </motion.div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="py-20 text-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="text-5xl font-bold mb-8 text-gradient">准备好开启你的平行人生了吗？</h2>
            <div className="flex flex-col items-center gap-4">
              <motion.button
                onClick={handleLaunch}
                className="px-16 py-6 text-2xl font-bold text-black bg-white rounded-full hover:bg-cyan-50 transition-colors shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.5)]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                立即启动 Soulverse
              </motion.button>
              <motion.button
                onClick={() => helpGuideRef.current?.open()}
                className="flex items-center gap-2 px-6 py-3 text-sm text-gray-400 hover:text-cyan-400 transition-colors group"
              >
                <BookOpen className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
                <span>查看使用指南</span>
              </motion.button>
            </div>
          </motion.div>
        </section>
      </motion.div>
    </main>
  );
}

function GameplayCard({ icon, title, subtitle, description, color, delay }: any) {
  const isCyan = color === 'cyan';
  const colorClass = isCyan ? 'text-cyan-400' : 'text-purple-400';
  const borderClass = isCyan ? 'group-hover:border-cyan-500/50' : 'group-hover:border-purple-500/50';

  return (
    <motion.div
      className={`glass p-8 rounded-2xl border border-white/5 transition-all duration-300 group relative overflow-hidden ${borderClass}`}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      whileHover={{ y: -10 }}
    >
      <div className={`mb-6 ${colorClass}`}>{icon}</div>
      <h3 className={`text-2xl font-bold mb-2 ${colorClass}`}>{title}</h3>
      <h4 className="text-lg text-white font-medium mb-4">{subtitle}</h4>
      <p className="text-gray-400 leading-relaxed">{description}</p>

      {/* Hover Glow */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none ${isCyan ? 'bg-cyan-500' : 'bg-purple-500'}`} />
    </motion.div>
  );
}
