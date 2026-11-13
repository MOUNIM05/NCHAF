import React, {useCallback, useEffect, useRef, useState} from 'react'
import {AnimatePresence, animate, motion, useInView, useMotionValue, useSpring} from 'framer-motion'
import {ChevronLeft, ChevronRight, Pause, Play} from 'lucide-react'
import './HeroBackgroundCarousel.css'

const imagePath = `${import.meta.env.BASE_URL}images/`
const DEFAULT_SLIDES = [
  {id: 'home', label: 'NCHAF HOME', position: '90% 55%'},
  {id: 'go', label: 'NCHAF GO', position: '95% 55%'},
  {id: 'classic', label: 'NCHAF CLASSIC+', position: '100% 55%', zoomOriginX: '95%'},
].map(slide => ({
  ...slide,
  src: `${imagePath}nchaf-${slide.id}-hero.webp`,
  tabletSrc: `${imagePath}nchaf-${slide.id}-tablet.webp`,
  mobileSrc: `${imagePath}nchaf-${slide.id}-mobile.webp`,
}))

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function Slide({slide, running, reducedMotion, interval, transitionDuration, first}) {
  const scale = useMotionValue(1)

  useEffect(() => {
    if (reducedMotion) {
      scale.set(1)
      return
    }
    if (!running) return
    const animation = animate(scale, 1.035, {
      duration: Math.max(0.01, (1.035 - scale.get()) / 0.035 * (interval / 1000 + transitionDuration)),
      ease: 'linear',
    })
    return () => animation.stop()
  }, [running, reducedMotion, interval, transitionDuration, scale])

  return <motion.div
    className="hero-carousel__slide"
    initial={{opacity: 0}}
    animate={{opacity: 1}}
    exit={{opacity: 0}}
    transition={{duration: reducedMotion ? 0 : transitionDuration, ease: [0.4, 0, 0.2, 1]}}
    style={{'--hero-image-position': slide.position || 'right center', '--hero-zoom-x': slide.zoomOriginX}}
  >
    <picture>
      {slide.mobileSrc && <source media="(max-width: 700px)" srcSet={slide.mobileSrc}/>}
      {slide.tabletSrc && <source media="(max-width: 1100px)" srcSet={slide.tabletSrc}/>}
      <motion.img
        src={slide.src}
        alt=""
        width="1920"
        height="1080"
        loading="eager"
        fetchpriority={first ? 'high' : 'auto'}
        decoding="async"
        draggable="false"
        style={{scale}}
      />
    </picture>
  </motion.div>
}

export default function HeroBackgroundCarousel({slides = DEFAULT_SLIDES, interval = 5000, transitionDuration = 1.2}) {
  const [index, setIndex] = useState(0)
  const [playback, setPlayback] = useState('auto')
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const [error, setError] = useState('')
  const sceneRef = useRef(null)
  const readyImages = useRef(new Map())
  const requestId = useRef(0)
  const mounted = useRef(false)
  const inView = useInView(sceneRef, {amount: 0.1})
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const mobile = useMediaQuery('(max-width: 700px)')
  const tablet = useMediaQuery('(max-width: 1100px)')
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine) and (min-width: 1101px)')
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const x = useSpring(pointerX, {stiffness: 80, damping: 30})
  const y = useSpring(pointerY, {stiffness: 80, damping: 30})
  const wantsPlayback = playback === 'play' || (playback === 'auto' && !reducedMotion)
  const running = wantsPlayback && visible && inView && slides.length > 1
  const activeIndex = index % Math.max(1, slides.length)
  const playbackAllowed = useRef(running)
  playbackAllowed.current = running

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestId.current += 1
    }
  }, [])

  useEffect(() => {
    const update = () => {
      setVisible(document.visibilityState !== 'hidden')
      // An image requested just before leaving the tab must not advance it in the background.
      requestId.current += 1
    }
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (reducedMotion) setPlayback('pause')
  }, [reducedMotion])

  const loadSlide = useCallback(slide => {
    const src = (mobile && slide.mobileSrc) || (tablet && slide.tabletSrc) || slide.src
    if (!readyImages.current.has(src)) {
      const ready = new Promise((resolve, reject) => {
        const image = new Image()
        image.decoding = 'async'
        image.onload = async () => {
          // Keep the outgoing image visible until the incoming bitmap is decoded.
          try { await image.decode() } catch { /* onload already guarantees a usable bitmap */ }
          resolve()
        }
        image.onerror = () => reject(new Error(`Image indisponible : ${slide.label}`))
        image.src = src
      })
      readyImages.current.set(src, ready)
      ready.catch(() => readyImages.current.delete(src))
    }
    return readyImages.current.get(src)
  }, [mobile, tablet])

  const goTo = useCallback(async (target, automatic = false) => {
    if (slides.length < 2) return
    const nextIndex = (target + slides.length) % slides.length
    const request = ++requestId.current
    try {
      await loadSlide(slides[nextIndex])
      if (!mounted.current || request !== requestId.current) return
      if (automatic && !playbackAllowed.current) return
      setError('')
      setIndex(nextIndex)
    } catch {
      if (!mounted.current || request !== requestId.current) return
      setPlayback('pause')
      setError('Cette image est indisponible. Réessayez avec les commandes du carrousel.')
    }
  }, [slides, loadSlide])

  useEffect(() => {
    if (slides.length > 1) {
      // Only warm the next responsive image; the other models stay off the network for now.
      loadSlide(slides[(activeIndex + 1) % slides.length]).catch(() => {})
    }
  }, [activeIndex, slides, loadSlide])

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => goTo(activeIndex + 1, true), interval)
    return () => window.clearTimeout(timer)
  }, [activeIndex, running, goTo, interval])

  useEffect(() => {
    const hero = sceneRef.current?.parentElement
    const reset = () => { pointerX.set(0); pointerY.set(0) }
    if (!hero || !finePointer || reducedMotion || !visible || !inView) {
      reset()
      return
    }
    const move = event => {
      if (event.pointerType !== 'mouse') return
      const rect = hero.getBoundingClientRect()
      pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 14)
      pointerY.set(((event.clientY - rect.top) / rect.height - 0.5) * 8)
    }
    hero.addEventListener('pointermove', move, {passive: true})
    hero.addEventListener('pointerleave', reset)
    return () => {
      hero.removeEventListener('pointermove', move)
      hero.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [finePointer, reducedMotion, visible, inView, pointerX, pointerY])

  if (!slides.length) return null

  return <>
    <div className="hero-carousel__background" ref={sceneRef} aria-hidden="true">
      <motion.div className="hero-carousel__camera" style={reducedMotion ? {x: 0, y: 0} : {x, y}}>
        <AnimatePresence initial={false}>
          <Slide
            key={slides[activeIndex].id || slides[activeIndex].src}
            slide={slides[activeIndex]}
            first={activeIndex === 0}
            running={running}
            reducedMotion={reducedMotion}
            interval={interval}
            transitionDuration={transitionDuration}
          />
        </AnimatePresence>
      </motion.div>
      <div className="hero-carousel__shade"/>
    </div>
    <div
      className="hero-carousel__controls"
      role="region"
      aria-roledescription="carrousel"
      aria-label="Les trois modèles NCHAF"
      onFocusCapture={event => {
        if (event.target.matches(':focus-visible')) setPlayback('pause')
      }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        setPlayback('pause')
        goTo(activeIndex + (event.key === 'ArrowRight' ? 1 : -1))
      }}
    >
      <div className="hero-carousel__readout" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
        <span className="hero-carousel__count">{String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        <span className="hero-carousel__model">{slides[activeIndex].label}</span>
      </div>
      <div className="hero-carousel__buttons">
        <button type="button" aria-label="Image précédente" title="Image précédente" disabled={slides.length < 2} onClick={() => goTo(activeIndex - 1)}><ChevronLeft size={17} aria-hidden="true"/></button>
        <button type="button" aria-label={wantsPlayback ? 'Mettre le carrousel en pause' : 'Lire le carrousel'} title={wantsPlayback ? 'Pause' : 'Lecture'} disabled={slides.length < 2} onClick={() => setPlayback(wantsPlayback ? 'pause' : 'play')}>{wantsPlayback ? <Pause size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}</button>
        <button type="button" aria-label="Image suivante" title="Image suivante" disabled={slides.length < 2} onClick={() => goTo(activeIndex + 1)}><ChevronRight size={17} aria-hidden="true"/></button>
      </div>
      <span className="hero-carousel__sr-only" role="status">{error}</span>
    </div>
  </>
}
