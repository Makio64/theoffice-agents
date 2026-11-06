import { RenderPipeline, RendererUtils, UnsignedByteType } from 'three/webgpu'
import { pass, mrt, output, normalView, packNormalToRGB, unpackRGBToNormal, sample, uniform, vec4, mix, max, smoothstep, luminance, renderOutput } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export const RENDER_QUALITY = Object.freeze({
  aoRadius: .34,
  aoSamples: 16,
  aoResolutionScale: .5,
  aoStrengthNight: .20,
  aoStrengthDay: .25,
  bloomThreshold: 1.25,
  bloomRadius: .12,
  bloomStrengthNight: .16,
  bloomStrengthDay: .055,
})

/**
 * A single geometry pass feeds contact AO and HDR bloom. Only AO is denoised:
 * silhouettes, sprites and the screen-space project names keep their hard edges.
 * Scene/background alpha is retained, with coverage added only for light spill.
 * WebGL 2 and failed post-processing keep the ordinary scene render path.
 *
 * Reference APIs, matching the installed Three r187:
 * https://threejs.org/docs/pages/RenderPipeline.html
 * https://threejs.org/docs/pages/GTAONode.html
 * https://threejs.org/examples/webgpu_postprocessing_bloom_selective.html
 */
export function createRenderQuality({ renderer, scene, camera, enabled = true }) {
  let active = Boolean(enabled && renderer.backend?.isWebGPUBackend)
  let failure = null
  let pipeline, scenePass, ambientOcclusion, softAO, glow
  const fallbackState = {}
  let fallbackContext, fallbackXR
  const aoStrength = uniform(RENDER_QUALITY.aoStrengthNight)

  if (active) {
    pipeline = new RenderPipeline(renderer)
    scenePass = pass(scene, camera, { samples: 0 })
    scenePass.setMRT(mrt({ output, normal: packNormalToRGB(normalView) }))
    // Normals need eight bits, rather than an extra full HDR color attachment.
    scenePass.getTexture('normal').type = UnsignedByteType
    const beauty = scenePass.getTextureNode('output')
    const depth = scenePass.getTextureNode('depth')
    const normalTexture = scenePass.getTextureNode('normal')
    const normals = sample(uv => unpackRGBToNormal(normalTexture.sample(uv)))

    ambientOcclusion = ao(depth, normals, camera)
    ambientOcclusion.resolutionScale = RENDER_QUALITY.aoResolutionScale
    ambientOcclusion.radius.value = RENDER_QUALITY.aoRadius
    ambientOcclusion.thickness.value = .45
    ambientOcclusion.samples.value = RENDER_QUALITY.aoSamples
    ambientOcclusion.useTemporalFiltering = false
    softAO = denoise(ambientOcclusion.getTextureNode(), depth, normals, camera)
    softAO.radius.value = 3
    softAO.depthPhi.value = 6
    softAO.normalPhi.value = 8
    // Contact depth never dims the bright neon tubes or lights.
    const diffuseWeight = smoothstep(.9, 1.4, luminance(beauty.rgb)).oneMinus()
    const contact = mix(1, softAO.r.clamp(), aoStrength.mul(diffuseWeight))

    glow = bloom(beauty, RENDER_QUALITY.bloomStrengthNight, RENDER_QUALITY.bloomRadius, RENDER_QUALITY.bloomThreshold)
    const bloomRGB = glow.rgb
    // The canvas is transparent over the website sky. Unpremultiply before the
    // output transform, then premultiply again, so softened edges have no dark rim.
    const glowCoverage = max(max(bloomRGB.r, bloomRGB.g), bloomRGB.b).max(0).sqrt().clamp(0, .65)
    const coverage = max(beauty.a, glowCoverage)
    const straightColor = beauty.rgb.mul(contact).add(bloomRGB).div(max(coverage, .0001))
    const transformed = renderOutput(vec4(straightColor, coverage))
    pipeline.outputColorTransform = false
    pipeline.outputNode = vec4(transformed.rgb.mul(coverage), coverage)
  }

  function fail(error) {
    RendererUtils.restoreRendererAndSceneState(renderer, scene, fallbackState)
    renderer.contextNode = fallbackContext
    renderer.xr.enabled = fallbackXR
    failure = error instanceof Error ? error.message : String(error)
    active = false
    console.warn('Office post-processing unavailable; using direct rendering.', error)
  }

  function render() {
    if (!active) { renderer.render(scene, camera); return false }
    RendererUtils.saveRendererAndSceneState(renderer, scene, fallbackState)
    fallbackContext = renderer.contextNode; fallbackXR = renderer.xr.enabled
    try { pipeline.render() }
    catch (error) { fail(error); renderer.render(scene, camera) }
    return active
  }

  return {
    render,
    async init() {
      if (!active) return
      RendererUtils.saveRendererAndSceneState(renderer, scene, fallbackState)
      fallbackContext = renderer.contextNode; fallbackXR = renderer.xr.enabled
      try { await scenePass.compileAsync(renderer); pipeline.render() }
      catch (error) { fail(error) }
    },
    // PassNode and effect nodes follow the drawing buffer size automatically.
    resize() {},
    setTheme(theme) {
      const night = theme === 'night'
      aoStrength.value = night ? RENDER_QUALITY.aoStrengthNight : RENDER_QUALITY.aoStrengthDay
      if (glow) glow.strength.value = night ? RENDER_QUALITY.bloomStrengthNight : RENDER_QUALITY.bloomStrengthDay
    },
    getMetrics() {
      return {
        postProcessing: active,
        ao: active ? 'GTAO' : 'off',
        aoSamples: active ? RENDER_QUALITY.aoSamples : 0,
        aoResolutionScale: active ? RENDER_QUALITY.aoResolutionScale : 0,
        aoRadius: active ? RENDER_QUALITY.aoRadius : 0,
        aoStrength: active ? aoStrength.value : 0,
        bloomStrength: active ? glow.strength.value : 0,
        bloomThreshold: active ? RENDER_QUALITY.bloomThreshold : 0,
        postProcessingFailure: failure,
      }
    },
    dispose() {
      pipeline?.dispose()
      scenePass?.dispose()
      softAO?.dispose()
      // GTAO has no material until its first compile, so dispose defensively if
      // an unsupported adapter failed before effect setup completed.
      if (ambientOcclusion?._material) ambientOcclusion.dispose()
      glow?.dispose()
    },
  }
}
