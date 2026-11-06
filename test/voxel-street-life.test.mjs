import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { createStreetLife, vehicleState, pedestrianState } from '../site/voxel/street-life.js'

test('traffic stays in its two lanes and same-direction cars cannot catch each other across a wrap', () => {
  for(const time of [0, .1, 6.07, 6.08, 19.7, 50, 98, 1000, 10000]){
    const a=vehicleState(time,0), b=vehicleState(time,1), c=vehicleState(time,2)
    for(const state of [a,b,c])assert.ok(state.x>=-26&&state.x<=26)
    assert.equal(a.z,6.60);assert.equal(b.z,6.60);assert.equal(c.z,7.52)
    assert.ok(Math.abs(Math.abs(a.x-b.x)-26)<1e-8)
    assert.equal(a.direction,1);assert.equal(c.direction,-1)
  }
})

test('pedestrians pause without foot movement, then continue through bounded routes', () => {
  const first=pedestrianState(109,0),later=pedestrianState(110,0)
  assert.equal(first.walking,false)
  assert.equal(later.walking,false)
  assert.equal(first.x,-14)
  assert.equal(later.x,-14)
  assert.equal(first.step,0)
  assert.equal(pedestrianState(112,0).walking,true)
  for(let i=0;i<6;i++)for(const time of [0,1,20,90,120,500,10000]){
    const state=pedestrianState(time,i)
    assert.ok(state.x>=-24&&state.x<=24)
    assert.ok(state.z>=5.18&&state.z<=5.43)
    assert.ok([-1,0,1].includes(state.step))
  }
})

test('street motion keeps three fixed instance buffers and every actor below the office floors', () => {
  const parent=new THREE.Group(),life=createStreetLife({THREE,parent})
  const meshes=[...life.group.children],buffers=meshes.map(mesh=>mesh.instanceMatrix.array)
  assert.equal(meshes.length,3)
  assert.ok(meshes.every(mesh=>mesh.isInstancedMesh&&!mesh.castShadow))
  assert.equal(life.stats.vehicles,3);assert.equal(life.stats.pedestrians,6);assert.equal(life.stats.lights,0)
  assert.equal(life.update(0),false)
  assert.equal(life.update(1/120),false)
  const unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)),matrix=new THREE.Matrix4()
  for(const time of [1,32,65,110,500]){
    life.update(time)
    meshes.forEach((mesh,index)=>{
      assert.equal(mesh.instanceMatrix.array,buffers[index])
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix)
        const bounds=unit.clone().applyMatrix4(matrix)
        assert.ok(bounds.min.x>=-28&&bounds.max.x<=28)
        assert.ok(bounds.min.y>=-.121&&bounds.max.y<=1.1)
        assert.ok(bounds.min.z>=4.9&&bounds.max.z<=8)
      }
    })
  }
  life.setTheme('day');life.setTheme('night')
  assert.equal(parent.children.length,1)
  const paused=buffers.map(buffer=>Array.from(buffer))
  assert.equal(life.update(500),false)
  buffers.forEach((buffer,index)=>assert.deepEqual(Array.from(buffer),paused[index]))
  let geometryDisposals=0,materialDisposals=0
  meshes[0].geometry.addEventListener('dispose',()=>geometryDisposals++)
  meshes.forEach(mesh=>mesh.material.addEventListener('dispose',()=>materialDisposals++))
  life.dispose();life.dispose()
  assert.equal(parent.children.length,0)
  assert.equal(geometryDisposals,1);assert.equal(materialDisposals,3)
})
