import React, {Component, Suspense, lazy, useEffect, useRef, useState} from 'react'
import {Crosshair, LoaderCircle, Rotate3D, TriangleAlert, ZoomIn, ZoomOut} from 'lucide-react'
import './Models.css'

const PrototypeScene = lazy(() => import('./PrototypeScene.jsx'))
const labels = {home: 'HOME', go: 'GO', classic: 'CLASSIC+'}

function ViewerStatus({title, children, error = false, progress, onRetry}) {
  const Icon = error ? TriangleAlert : LoaderCircle
  return <div className={`prototype-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
    <Icon size={26} aria-hidden="true"/>
    <strong>{title}</strong>
    {children && <p>{children}</p>}
    {progress !== undefined && <progress aria-label="Chargement du prototype 3D" max="100" value={progress}/>}
    {onRetry && <button type="button" className="prototype-retry" onClick={onRetry}>Réessayer la vue 3D</button>}
  </div>
}

class ViewerBoundary extends Component {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  componentDidCatch() { this.props.onError() }
  componentDidUpdate(previous) {
    if (this.state.failed && previous.variant !== this.props.variant) this.setState({failed: false})
  }
  render() {
    return this.state.failed
      ? <ViewerStatus error title="Impossible d’afficher ce prototype" onRetry={this.props.onRetry}>
          Le fichier 3D n’a pas pu être chargé ou WebGL est indisponible. Vérifiez votre connexion et l’accélération graphique du navigateur.
        </ViewerStatus>
      : this.props.children
  }
}

function supportsWebGL() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export default function ModelViewer({variant = 'home', running = true}) {
  const host = useRef(null)
  const [started, setStarted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [support, setSupport] = useState(null)
  const [renderedVariant, setRenderedVariant] = useState(variant)
  const [ready, setReady] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const [command, setCommand] = useState(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!window.IntersectionObserver) {
      setStarted(true)
      setVisible(true)
      return
    }
    const preload = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true)
        preload.disconnect()
      }
    }, {rootMargin: '250px'})
    const visibility = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    preload.observe(host.current)
    visibility.observe(host.current)
    return () => { preload.disconnect(); visibility.disconnect() }
  }, [])

  useEffect(() => {
    if (started) setSupport(supportsWebGL())
  }, [started, attempt])

  useEffect(() => {
    if (variant === renderedVariant) {
      setLeaving(false)
      return
    }
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setReady(false)
      setProgress(0)
      setCommand(null)
      setRenderedVariant(variant)
      setLeaving(false)
    }, reducedMotion ? 0 : 180)
    return () => window.clearTimeout(timer)
  }, [variant, renderedVariant, reducedMotion])

  const sendCommand = type => setCommand(previous => ({type, id: (previous?.id ?? 0) + 1}))
  const retry = async () => {
    setReady(false)
    setProgress(0)
    setContextLost(false)
    setSupport(null)
    try {
      if (support) {
        const {clearPrototype} = await import('./PrototypeScene.jsx')
        clearPrototype(renderedVariant)
      }
    } catch {
      // The boundary keeps a failed lazy import isolated from the rest of the site.
    } finally {
      setAttempt(value => value + 1)
    }
  }
  const controlsEnabled = ready && !leaving && !contextLost && support

  return <div ref={host} className="prototype-viewer" data-prototype={renderedVariant}>
    {!started || support === null
      ? <ViewerStatus title="Préparation de la vue 3D…"/>
      : !support
        ? <ViewerStatus error title="WebGL est indisponible" onRetry={retry}>
            La vue 3D nécessite WebGL 2. Activez l’accélération graphique ou essayez un navigateur compatible. Les fiches des trois prototypes restent consultables.
          </ViewerStatus>
        : contextLost
          ? <ViewerStatus error title="La vue 3D a été interrompue" onRetry={retry}>
              Le contexte WebGL a été perdu. Relancez la vue pour continuer à explorer le prototype.
            </ViewerStatus>
          : <ViewerBoundary key={attempt} variant={renderedVariant} onRetry={retry} onError={() => setReady(false)}>
              <Suspense fallback={<ViewerStatus title="Chargement de la visionneuse 3D…"/>}>
                <div className={`prototype-viewport${ready && !leaving ? ' is-ready' : ''}`}
                  role="group" aria-label={`Prototype 3D conceptuel NCHAF ${labels[renderedVariant]}`}
                  aria-describedby="prototype-instructions" aria-busy={!ready} tabIndex={0}
                  onKeyDown={event => {
                    const keys = {ArrowLeft: 'left', ArrowRight: 'right', '+': 'in', '=': 'in', '-': 'out', Home: 'reset'}
                    if (controlsEnabled && keys[event.key]) {
                      event.preventDefault()
                      sendCommand(keys[event.key])
                    }
                  }}>
                  <PrototypeScene variant={renderedVariant} running={running && !reducedMotion}
                    visible={visible && !contextLost} reducedMotion={reducedMotion} command={command}
                    onReady={() => setReady(true)} onProgress={setProgress}
                    onContextLost={() => { setReady(false); setContextLost(true) }}/>
                </div>
                {!ready && <ViewerStatus title={`Chargement de NCHAF ${labels[renderedVariant]} · ${Math.round(progress)} %`} progress={progress}>
                  Prototype 3D conceptuel · préparation des détails
                </ViewerStatus>}
              </Suspense>
            </ViewerBoundary>}
    <div className="prototype-tools" role="group" aria-label="Commandes de la vue 3D">
      <button type="button" onClick={() => sendCommand('in')} disabled={!controlsEnabled} aria-label="Zoomer" title="Zoomer (+)"><ZoomIn size={19}/></button>
      <button type="button" onClick={() => sendCommand('out')} disabled={!controlsEnabled} aria-label="Dézoomer" title="Dézoomer (−)"><ZoomOut size={19}/></button>
      <button type="button" onClick={() => sendCommand('reset')} disabled={!controlsEnabled} aria-label="Recentrer le modèle" title="Recentrer (touche Début)"><Crosshair size={19}/></button>
    </div>
    <span className="prototype-caption"><Rotate3D size={14} aria-hidden="true"/> PROTOTYPE 3D CONCEPTUEL</span>
  </div>
}
