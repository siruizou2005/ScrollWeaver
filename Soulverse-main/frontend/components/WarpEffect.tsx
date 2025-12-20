'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WarpEffectProps {
  isActive: boolean;
  onComplete: () => void;
}

export default function WarpEffect({ isActive, onComplete }: WarpEffectProps) {
  const [phase, setPhase] = useState<'idle' | 'warping' | 'blackout'>('idle');

  useEffect(() => {
    if (isActive) {
      setPhase('warping');
      const timer1 = setTimeout(() => {
        setPhase('blackout');
      }, 1000);

      const timer2 = setTimeout(() => {
        onComplete();
      }, 2000); // Slightly longer to allow full fade to black

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      setPhase('idle');
    }
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* 星星拉长效果 - 光速线条 */}
          {phase === 'warping' && (
            <motion.div
              className="fixed inset-0 pointer-events-none z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[...Array(50)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 bg-gradient-to-b from-cyan-400 via-purple-500 to-transparent"
                  initial={{
                    x: `${Math.random() * 100}%`,
                    y: '-10%',
                    height: '0px',
                    opacity: 0,
                  }}
                  animate={{
                    y: '110%',
                    height: '500px', // Longer lines for more speed sensation
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 0.5, // Faster lines
                    delay: Math.random() * 0.5,
                    repeat: Infinity,
                    repeatDelay: Math.random() * 0.1,
                  }}
                  style={{
                    filter: 'blur(1px)',
                    boxShadow: '0 0 10px rgba(0, 255, 255, 0.5)'
                  }}
                />
              ))}
            </motion.div>
          )}

          {/* 黑屏效果 */}
          {phase === 'blackout' && (
            <motion.div
              className="fixed inset-0 bg-black z-[60] pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

