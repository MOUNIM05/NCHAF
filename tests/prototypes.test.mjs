import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {Box3, Group, Vector3} from 'three'
import {GLTFLoader} from 'three-stdlib'
import {preparePrototype} from '../src/prototypeModel.js'

for (const variant of ['home', 'go', 'classic']) {
  test(`${variant}: real GLB is upright, centered, complete and safe to reuse`, async () => {
    const bytes = await readFile(new URL(`../public/models/nchaf-${variant}.glb`, import.meta.url))
    const source = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''
    )
    const original = source.scene.toJSON()
    const originalBounds = new Box3().setFromObject(source.scene)
    const prepared = preparePrototype(source.scene)
    const bounds = new Box3().setFromObject(prepared.object)

    assert.ok(bounds.getCenter(new Vector3()).length() < 1e-6, 'Centered on all axes')
    assert.ok(Math.abs(prepared.size.y - 3) < 1e-6, 'Z-up model is displayed vertically')
    assert.ok(bounds.getSize(new Vector3()).distanceTo(prepared.size) < 1e-6)
    const originalSize = originalBounds.getSize(new Vector3())
    assert.ok(Math.abs(prepared.size.x / prepared.size.y - originalSize.x / originalSize.z) < 1e-6,
      'The source proportions are preserved')

    let meshes = 0
    prepared.object.traverse(node => {
      if (!node.isMesh) return
      meshes++
      const originalMesh = source.scene.getObjectByName(node.name)
      assert.equal(node.geometry, originalMesh.geometry, 'Original geometry is preserved')
      assert.equal(node.material, originalMesh.material, 'Original material is preserved')
      assert.ok(node.geometry.attributes.color, 'Supplied vertex colors are preserved')
    })
    assert.equal(meshes, {home: 91, go: 65, classic: 105}[variant], 'No mesh is missing')
    assert.equal(prepared.rotors.length, variant === 'go' ? 1 : 2)
    for (const rotor of prepared.rotors) {
      assert.equal(rotor.children.length, 5, 'Each fan has its five supplied blades')
      assert.ok(rotor.children.every(blade => blade.name.startsWith('fan_blade_')))
      rotor.rotation.z = 0.5
    }
    const second = preparePrototype(source.scene)
    assert.ok(second.rotors.every(rotor => rotor.rotation.z === 0), 'Animation state is isolated')
    assert.deepEqual(source.scene.toJSON(), original, 'Cached source remains unchanged')
  })
}

test('An empty GLB scene yields a recoverable error instead of invalid camera bounds', () => {
  assert.throws(() => preparePrototype(new Group()), /vide ou invalide/)
})
