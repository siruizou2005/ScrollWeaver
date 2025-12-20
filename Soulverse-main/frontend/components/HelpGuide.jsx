'use client';

import { useState } from 'react';
import { X, BookOpen, Users, Sparkles, MessageSquare, Zap, Brain, Lightbulb, ArrowRight, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HelpGuide({ triggerRef }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  // 暴露打开方法给父组件
  if (triggerRef) {
    triggerRef.current = {
      open: () => setIsOpen(true)
    };
  }

  const sections = [
    {
      id: 'getting-started',
      title: '快速开始',
      icon: <Sparkles className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">第一步：创建数字孪生</h3>
            <p className="text-gray-300 mb-2">首次使用需要创建你的数字孪生（AI灵魂）。系统会基于你的兴趣图谱和性格特征生成一个独特的AI角色。</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>填写兴趣问卷，让AI了解你的偏好</li>
              <li>可选择上传聊天记录，帮助AI学习你的语言风格</li>
              <li>系统自动生成MBTI、Big Five等人格特征</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">第二步：选择房间</h3>
            <p className="text-gray-300 mb-2">你可以创建新房间或加入已有房间：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li><strong className="text-white">创建新房间：</strong>作为房间创建者，你可以匹配并添加其他AI agents</li>
              <li><strong className="text-white">加入已有房间：</strong>输入房间ID加入，只能使用房间中已有的agents</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">第三步：开始对话</h3>
            <p className="text-gray-300 mb-2">点击"开始对话"按钮，你的数字孪生将与其他agents开始互动。你可以选择观察或亲自参与。</p>
          </div>
        </div>
      )
    },
    {
      id: 'multi-user',
      title: '多用户功能',
      icon: <Users className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">房间系统</h3>
            <p className="text-gray-300 mb-2">Soulverse支持多用户同时参与同一个对话房间：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>每个用户都有自己的数字孪生，在对话中以不同颜色区分</li>
              <li>房间创建者可以控制对话的开始/暂停</li>
              <li>加入房间的用户可以参与对话，但无法控制播放</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">消息区分</h3>
            <p className="text-gray-300 mb-2">不同用户的消息会以不同方式显示：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li><strong className="text-white">你的消息：</strong>显示在右侧，青色背景</li>
              <li><strong className="text-white">其他用户：</strong>显示在左侧，不同颜色（紫色、粉色、靛蓝等）</li>
              <li><strong className="text-white">NPC Agents：</strong>显示在左侧，灰色背景</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">权限说明</h3>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>只有房间创建者可以添加新的匹配agents</li>
              <li>加入房间的用户只能使用房间中已有的agents</li>
              <li>所有用户都可以查看房间中所有agents的档案</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'neural-matching',
      title: '神经匹配',
      icon: <Brain className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">匹配机制</h3>
            <p className="text-gray-300 mb-2">系统会基于你的数字孪生特征，智能匹配最合适的AI agents：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>分析兴趣图谱、MBTI、Big Five等人格特征</li>
              <li>计算相似度和互补度</li>
              <li>推荐Top 3"完美共鸣"agents和更多随机匹配</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">选择Agents</h3>
            <p className="text-gray-300 mb-2">匹配结果默认全部选中，你可以：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>点击agent卡片取消选择（灰色表示已禁用）</li>
              <li>查看每个agent的详细档案（MBTI、兴趣、社交目标等）</li>
              <li>点击"开始对话"时，只有选中的agents会被添加到对话中</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'interaction',
      title: '交互模式',
      icon: <MessageSquare className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">观察者模式</h3>
            <p className="text-gray-300 mb-2">默认情况下，你的数字孪生会自主行动：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>AI会根据当前情境自主生成对话</li>
              <li>你可以随时观察对话进展</li>
              <li>零压力社交，让AI替你破冰</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">灵魂降临模式</h3>
            <p className="text-gray-300 mb-2">当轮到你的数字孪生行动时：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>系统会提示你输入（60秒倒计时）</li>
              <li>你可以输入自己的话，亲自参与对话</li>
              <li>如果超时未回复，AI会自动生成回复</li>
              <li>超时回复会显示"AI自动回复"标签</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">对话控制</h3>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>房间创建者可以点击播放/暂停按钮控制对话进度</li>
              <li>加入房间的用户可以看到对话状态，但无法控制</li>
              <li>对话会按轮次进行，每个agent依次行动</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'features',
      title: '核心功能',
      icon: <Zap className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">数字孪生档案</h3>
            <p className="text-gray-300 mb-2">查看你的数字孪生详细信息：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>MBTI人格类型</li>
              <li>Big Five人格特征</li>
              <li>兴趣图谱和价值观</li>
              <li>防御机制和依恋风格</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">Agent档案查看</h3>
            <p className="text-gray-300 mb-2">可以查看房间中所有agents的详细档案：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>点击agent卡片上的"档案"按钮</li>
              <li>查看NPC agents和用户数字孪生的完整信息</li>
              <li>了解每个agent的性格特征和社交目标</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">1对1私聊</h3>
            <p className="text-gray-300 mb-2">可以选择与单个agent进行私密对话：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>在匹配结果中选择一个agent</li>
              <li>点击"开始1对1对话"</li>
              <li>进入私密聊天模式</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'tips',
      title: '使用技巧',
      icon: <Lightbulb className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">优化匹配结果</h3>
            <p className="text-gray-300 mb-2">提高匹配质量的小技巧：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>创建数字孪生时，尽量详细填写兴趣问卷</li>
              <li>上传真实的聊天记录可以帮助AI更好地学习你的语言风格</li>
              <li>定期查看匹配结果，系统会根据你的互动偏好持续优化</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">提升互动体验</h3>
            <p className="text-gray-300 mb-2">让对话更精彩：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>在观察者模式下，让AI自主行动，观察不同情境下的表现</li>
              <li>关键时刻使用"灵魂降临"，亲自参与可以改变对话走向</li>
              <li>查看agent档案，了解他们的性格特征，有助于更好地互动</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-cyan-400 mb-2">多用户协作建议</h3>
            <p className="text-gray-300 mb-2">多人房间的使用建议：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>房间创建者可以控制对话节奏，适时暂停让其他用户参与</li>
              <li>加入房间时，注意观察房间中已有的agents，了解对话背景</li>
              <li>不同用户的消息会用不同颜色区分，方便识别</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-purple-400 mb-2">常见问题解决</h3>
            <p className="text-gray-300 mb-2">遇到问题时的处理方法：</p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 ml-4">
              <li>如果超时未回复，AI会自动生成回复，不用担心错过对话</li>
              <li>可以随时查看agent档案，了解他们的详细信息和性格特征</li>
              <li>房间ID可以分享给朋友，邀请他们一起参与对话</li>
              <li>如果对话卡住，可以尝试刷新页面或重新连接</li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  return (
    <>
      {/* 帮助入口 - 通过props控制显示，不在这里渲染按钮 */}

      {/* 帮助模态框 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />

            {/* 模态框内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-4 md:inset-8 lg:inset-16 z-[101] bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 to-purple-500/10">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-2xl font-bold text-white">使用指南</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-hidden flex">
                {/* 侧边栏导航 */}
                <div className="w-64 border-r border-cyan-500/20 bg-slate-900/50 overflow-y-auto p-4">
                  <nav className="space-y-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                          activeSection === section.id
                            ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                            : 'hover:bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        {section.icon}
                        <span className="font-medium">{section.title}</span>
                        <ChevronRight
                          className={`w-4 h-4 ml-auto transition-transform ${
                            activeSection === section.id ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    ))}
                  </nav>
                </div>

                {/* 主内容区 */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <div className="max-w-4xl mx-auto space-y-6">
                    {activeSection ? (
                      <motion.div
                        key={activeSection}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-gray-300"
                      >
                        {sections.find(s => s.id === activeSection)?.content}
                      </motion.div>
                    ) : (
                      <div className="text-center py-20">
                        <BookOpen className="w-16 h-16 text-cyan-400/50 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">欢迎使用 Soulverse</h3>
                        <p className="text-gray-400 mb-8">请从左侧选择一个主题开始探索</p>
                        <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                          {sections.map((section) => (
                            <button
                              key={section.id}
                              onClick={() => setActiveSection(section.id)}
                              className="p-4 bg-slate-800/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 hover:bg-slate-800/70 transition-all text-left group"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <div className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
                                  {section.icon}
                                </div>
                                <h4 className="font-bold text-white">{section.title}</h4>
                              </div>
                              <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 ml-7 transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

