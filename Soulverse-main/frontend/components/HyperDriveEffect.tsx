'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HyperDriveEffectProps {
  isActive: boolean;
  onComplete: () => void;
}

export default function HyperDriveEffect({ isActive, onComplete }: HyperDriveEffectProps) {
  const [phase, setPhase] = useState<'idle' | 'tunnel' | 'whiteout' | 'welcome'>('idle');
  
  useEffect(() => {
    if (isActive) {
      setPhase('tunnel');
      setTimeout(() => {
        setPhase('whiteout');
        setTimeout(() => {
          setPhase('welcome');
          setTimeout(() => {
            onComplete();
          }, 2000);
        }, 800);
      }, 1200);
    } else {
      setPhase('idle');
    }
  }, [isActive, onComplete]);
  
  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* 虫洞隧道效果 */}
          {phase === 'tunnel' && (
            <motion.div
              className="fixed inset-0 pointer-events-none z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="w-96 h-96 rounded-full border-4 border-cyan-500"
                  initial={{ scale: 0, rotate: 0 }}
                  animate={{ scale: 10, rotate: 360 }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                  style={{
                    background: 'radial-gradient(circle, transparent 30%, rgba(157, 78, 221, 0.5) 100%)',
                  }}
                />
              </div>
            </motion.div>
          )}
          
          {/* 白屏效果 */}
          {phase === 'whiteout' && (
            <motion.div
              className="fixed inset-0 bg-white z-[60] pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />
          )}
          
          {/* 欢迎语 */}
          {phase === 'welcome' && (
            <motion.div
              className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <motion.h1
                className="text-6xl font-bold text-gradient"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Welcome to New Planet
              </motion.h1>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

