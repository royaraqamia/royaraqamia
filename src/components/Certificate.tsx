import { useState, useRef, useEffect, useMemo } from 'react';
import { Trophy } from '@phosphor-icons/react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { LazyImage } from './LazyImage';

// Animation variants defined outside component to avoid recreation
const headerVariants = {
  hidden: { opacity: 0, y: -50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.25, 0.4, 0.25, 1] as const,
      staggerChildren: 0.2,
    },
  },
} as const;

const iconVariants = {
  hidden: { opacity: 0, scale: 0, rotate: -180 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 15,
      duration: 0.8,
    },
  },
} as const;

const textVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
} as const;

const descriptionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay: 0.2,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
} as const;

const certificateContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 1,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
} as const;

const certificateCardVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 30,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
} as const;

// Floating particles array defined outside to avoid recreation
const PARTICLE_COUNT = 8;
const particleIndices = [...Array(PARTICLE_COUNT)].map((_, i) => i);

export function Certificate() {
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const certificateRef = useRef<HTMLDivElement>(null);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const isHeaderInView = useInView(headerRef, { once: true, margin: '-50px' });
  const isCertificateInView = useInView(certificateRef, { once: true, margin: '200px' });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // All useTransform hooks at component top level (React hooks rules)
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0.5]);
  const secondBlobY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const thirdBlobY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  // Memoize particle animations to avoid recreation on every render
  const particleAnimations = useMemo(
    () =>
      particleIndices.map((i) => ({
        initial: {
          opacity: 0,
          scale: 0,
          x: `${20 + i * 12}%`,
          y: `${15 + (i % 3) * 30}%`,
        },
        animate: {
          opacity: [0, 1, 0.8, 0],
          scale: [0, 1.5, 1, 0],
          y: [
            `${15 + (i % 3) * 30}%`,
            `${15 + (i % 3) * 30 - 40}%`,
            `${15 + (i % 3) * 30 - 20}%`,
            `${15 + (i % 3) * 30 - 50}%`,
          ],
          x: [
            `${20 + i * 12}%`,
            `${20 + i * 12 + 10}%`,
            `${20 + i * 12 - 5}%`,
            `${20 + i * 12 + 15}%`,
          ],
        },
        hidden: { opacity: 0, scale: 0 },
        transition: {
          duration: 3,
          delay: i * 0.3,
          ease: 'easeInOut' as const,
        },
      })),
    []
  );

  return (
    <section
      ref={sectionRef}
      id="certificate"
      className="section-spacing-sm bg-gradient-to-b from-muted/20 via-background to-muted/30 relative overflow-hidden"
    >
      {/* Premium Animated Background Elements with Parallax */}
      <motion.div
        className="absolute top-20 right-10 w-32 h-32 bg-[#7766EE] opacity-5 rounded-full blur-3xl pointer-events-none"
        style={{ y: backgroundY, opacity }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.05, 0.1, 0.05],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute bottom-40 left-20 w-40 h-40 bg-[#A78BFA] opacity-5 rounded-full blur-3xl pointer-events-none"
        style={{ y: secondBlobY }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.05, 0.12, 0.05],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#6366F1] opacity-3 rounded-full blur-3xl pointer-events-none"
        style={{ y: thirdBlobY }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.03, 0.08, 0.03],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />

      <div className="max-w-5xl mx-auto container-padding relative z-10">
        {/* Section Header with Premium Animation */}
        <motion.div
          ref={headerRef}
          initial="hidden"
          animate={isHeaderInView ? 'visible' : 'hidden'}
          variants={headerVariants}
          className="text-center section-header mb-12"
        >
          <motion.div
            variants={iconVariants}
            className="inline-flex items-center justify-center mb-6"
          >
            <motion.div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7766EE] to-[#A78BFA] flex items-center justify-center shadow-lg shadow-primary/25 relative overflow-hidden"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{
                  x: ['-100%', '100%'],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
              <Trophy className="w-8 h-8 text-white relative z-10" />
            </motion.div>
          </motion.div>

          <motion.h2
            variants={textVariants}
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 font-bold"
            style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}
          >
            <span className="text-teal-400">نموذج عن الشَّهادة</span>
          </motion.h2>

          <motion.p
            variants={descriptionVariants}
            className="text-sm sm:text-base lg:text-lg text-foreground/70 max-w-2xl mx-auto leading-[1.8] sm:leading-[1.9]"
          >
            وثيقة تُثبت جدارتك المهنيَّة، وتُعَد جواز مرورك لفرص وظيفيَّة ومشاريع حقيقيَّة في
            السُّوق الرَّقمي.
          </motion.p>
        </motion.div>

        {/* Certificate Image with Premium Scroll Animations */}
        <motion.div
          ref={certificateRef}
          initial="hidden"
          animate={isCertificateInView ? 'visible' : 'hidden'}
          variants={certificateContainerVariants}
          className="flex justify-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <motion.div
            variants={certificateCardVariants}
            whileHover={{
              scale: 1.03,
              y: -8,
              transition: { duration: 0.5, ease: 'easeOut' },
            }}
            className="certificate-container glass-card rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 group relative"
            style={{ perspective: 1000 }}
          >
            {/* Premium Animated gradient overlay on hover */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-[#7766EE] via-[#A78BFA] to-[#6366F1] rounded-3xl pointer-events-none z-20"
              initial={{ opacity: 0 }}
              animate={{
                opacity: isHovered ? 0.15 : 0,
              }}
              transition={{ duration: 0.7 }}
            />

            {/* Premium Animated border glow with pulse */}
            <motion.div
              className="absolute inset-0 rounded-3xl pointer-events-none z-30"
              animate={{
                boxShadow: isHovered
                  ? [
                      '0_0_60px_rgba(119,102,238,0.6),inset_0_0_60px_rgba(167,139,250,0.2)',
                      '0_0_80px_rgba(119,102,238,0.8),inset_0_0_80px_rgba(167,139,250,0.3)',
                      '0_0_60px_rgba(119,102,238,0.6),inset_0_0_60px_rgba(167,139,250,0.2)',
                    ]
                  : '0_0_0px_rgba(119,102,238,0),inset_0_0_0px_rgba(167,139,250,0)',
              }}
              transition={{
                duration: 2,
                repeat: isHovered ? Infinity : 0,
                ease: 'easeInOut',
              }}
            />

            {/* Enhanced Floating particles effect - respects reduced motion */}
            {!prefersReducedMotion && (
              <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none z-40">
                {particleIndices.map((i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-white/40 rounded-full"
                    initial={particleAnimations[i].initial}
                    animate={
                      isHovered ? particleAnimations[i].animate : particleAnimations[i].hidden
                    }
                    transition={{
                      ...particleAnimations[i].transition,
                      repeat: isHovered ? Infinity : 0,
                    }}
                  />
                ))}
              </div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={
                isCertificateInView
                  ? {
                      opacity: 1,
                      transition: {
                        duration: 0.4,
                        ease: 'easeOut',
                      },
                    }
                  : {}
              }
              whileHover={{
                scale: 1.02,
                transition: { duration: 0.5 },
              }}
            >
              <LazyImage
                src="/certificate.png"
                webpSrc="/certificate.webp"
                alt="نموذج شهادة إتمام الدورة التدريبية"
                className="w-full h-auto max-w-4xl relative z-10"
                priority={true}
              />
            </motion.div>

            {/* Premium Shine sweep effect on hover - respects reduced motion */}
            {!prefersReducedMotion && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-3xl pointer-events-none z-50"
                initial={{ x: '-100%' }}
                animate={isHovered ? { x: '200%' } : { x: '-100%' }}
                transition={{
                  duration: 1.5,
                  ease: 'easeInOut',
                  repeat: isHovered ? Infinity : 0,
                  repeatDelay: 2,
                }}
              />
            )}
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        .certificate-container {
          position: relative;
          transform-style: preserve-3d;
        }

        .certificate-container::before {
          content: '';
          position: absolute;
          inset: -3px;
          background: linear-gradient(135deg, #7766EE, #A78BFA, #6366F1, #7766EE);
          background-size: 300% 300%;
          border-radius: 3rem;
          opacity: 0;
          transition: opacity 0.7s;
          z-index: -1;
          animation: gradient-shift 3s ease infinite;
        }

        .certificate-container:hover::before {
          opacity: 0.4;
          filter: blur(25px);
        }

        @keyframes gradient-shift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        /* Reduced motion preferences */
        @media (prefers-reduced-motion: reduce) {
          .certificate-container::before {
            animation: none;
          }
          
          .certificate-container:hover::before {
            opacity: 0.3;
            filter: blur(20px);
          }
        }
      `}</style>
    </section>
  );
}
