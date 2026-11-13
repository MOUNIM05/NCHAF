import {Box3, Group, Vector3} from 'three'

const baseUrl = import.meta.env?.BASE_URL ?? '/'
export const prototypeUrls = Object.fromEntries(
  ['home', 'go', 'classic'].map(variant => [variant, `${baseUrl}models/nchaf-${variant}.glb`])
)

// The supplied GLBs use Z as their vertical axis. Clone the scene to preserve
// cached geometries/materials and keep fan animation local to each instance.
export function preparePrototype(source) {
  const model = source.clone(true)
  model.updateMatrixWorld(true)
  const hubs = []
  const blades = []
  model.traverse(node => {
    if (/^fan_hub_/.test(node.name)) hubs.push(node)
    if (/^fan_blade_/.test(node.name)) blades.push(node)
  })
  const rotors = hubs.map(hub => {
    const rotor = new Group()
    rotor.position.copy(model.worldToLocal(new Box3().setFromObject(hub).getCenter(new Vector3())))
    model.add(rotor)
    return rotor
  })
  blades.forEach(blade => {
    const center = model.worldToLocal(new Box3().setFromObject(blade).getCenter(new Vector3()))
    const rotor = rotors.reduce((nearest, candidate) => (
      !nearest || candidate.position.distanceToSquared(center) < nearest.position.distanceToSquared(center)
        ? candidate : nearest
    ), null)
    rotor?.attach(blade)
  })

  const upright = new Group()
  upright.rotation.x = -Math.PI / 2
  upright.add(model)
  const box = new Box3().setFromObject(upright)
  const size = box.getSize(new Vector3())
  const longestSide = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longestSide) || longestSide <= 0) throw new Error('Le modèle 3D est vide ou invalide.')
  const scale = 3 / longestSide
  const centered = new Group()
  centered.add(upright)
  upright.position.copy(box.getCenter(new Vector3())).multiplyScalar(-1)
  centered.scale.setScalar(scale)
  return {object: centered, rotors, size: size.multiplyScalar(scale)}
}
