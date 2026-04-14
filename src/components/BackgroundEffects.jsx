import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default memo(function BackgroundEffects() {
  // PERF: respect user's prefers-reduced-motion setting
  const shouldReduceMotion = useReducedMotion()

  // On reduced motion or low-end devices, skip expensive background animations
  if (shouldReduceMotion) {
    return (
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-red-600/[0.03] rounded-full blur-3xl" />
        <div className="absolute inset-0 dot-pattern opacity-30" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Subtle gradient orbs */}
      <motion.div
        className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-red-600/[0.03] rounded-full blur-3xl"
        animate={{
          scale: [1, 1.1, 1],
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute -bottom-60 -left-40 w-[500px] h-[500px] bg-red-500/[0.02] rounded-full blur-3xl"
        animate={{
          scale: [1.1, 1, 1.1],
          x: [0, -20, 0],
          y: [0, 30, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-600/[0.01] rounded-full blur-3xl"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
      />

      {/* Dot pattern overlay */}
      <div className="absolute inset-0 dot-pattern opacity-30" />

      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />

      {/* ✅ FIX 8 — CSS-only floating particles (no Framer Motion overhead) */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-red-500/20 rounded-full"
          style={{
            left: `${15 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
            animation: `float-particle ${4 + i * 0.5}s ease-in-out ${i * 0.8}s infinite`,
          }}
        />
      ))}
    </div>
  )
})
