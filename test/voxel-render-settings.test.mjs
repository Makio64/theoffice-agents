import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderResolution } from '../site/voxel/render-settings.js'

test('crisp rendering uses native display density up to 2x without changing CSS or camera dimensions', () => {
  const retina = renderResolution(1088, 1180, 2)
  assert.deepEqual([retina.cssWidth,retina.cssHeight], [1088,1180])
  assert.deepEqual([retina.bufferWidth,retina.bufferHeight], [2176,2360])
  const mobile = renderResolution(374,560,3)
  assert.equal(mobile.nativeDpr,3)
  assert.equal(mobile.dpr,2)
  assert.deepEqual([mobile.bufferWidth,mobile.bufferHeight],[748,1120])
  assert.equal(renderResolution(100,100,1.25).bufferWidth,125)
  assert.equal(renderResolution(100,100,.8).bufferWidth,80)
})

test('intentional retro pixels are independent of display density and invalid dimensions are bounded', () => {
  const retro=renderResolution(1088,1180,2,2)
  assert.deepEqual([retro.renderWidth,retro.renderHeight],[544,590])
  assert.deepEqual([retro.bufferWidth,retro.bufferHeight],[1088,1180])
  assert.deepEqual([retro.cssWidth,retro.cssHeight],[1088,1180])
  for(const dpr of [0,-1,NaN,Infinity])assert.equal(renderResolution(0,-20,dpr).dpr,1)
  assert.deepEqual([renderResolution(NaN,Infinity).bufferWidth,renderResolution(NaN,Infinity).bufferHeight],[1,1])
  assert.equal(renderResolution(1,1,2,3).bufferWidth,2)
  assert.equal(renderResolution(1,1,.8).bufferWidth,1)
  assert.equal(renderResolution(0,0,.25,3).bufferHeight,1)
})
