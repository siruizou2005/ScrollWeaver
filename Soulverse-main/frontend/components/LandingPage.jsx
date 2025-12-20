import { ArrowRight } from 'lucide-react';
import CosmicBackground from './CosmicBackground';

export default function LandingPage({ onEnter }) {
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center text-white">
      <CosmicBackground intensity={0.5} />
      
      <div className="z-10 text-center space-y-8 animate-fade-in-up px-4">
        <div className="inline-block mb-4 px-4 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-sm font-mono tracking-widest backdrop-blur-md">
          NEURAL LINK ESTABLISHED
        </div>
        
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white via-cyan-200 to-slate-500 drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
          数字宇宙
        </h1>
        
        <p className="text-slate-400 max-w-lg mx-auto text-lg leading-relaxed">
          在这里，碳基生命与硅基灵魂共舞。创建你的数字孪生，探索无尽的意识网络。
        </p>

        <div className="pt-8 group">
          <button
            onClick={onEnter}
            className="relative px-12 py-4 bg-white text-black font-bold text-xl rounded-full hover:scale-105 transition-transform duration-300 shadow-[0_0_40px_rgba(255,255,255,0.4)] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              进入宇宙 <ArrowRight className="w-5 h-5" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-purple-500 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
          </button>
          <p className="mt-4 text-slate-600 text-sm font-mono">SYSTEM STATUS: ONLINE</p>
        </div>
      </div>
      
      {/* 底部装饰 */}
      <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-black to-transparent z-0"></div>
    </div>
  );
}

