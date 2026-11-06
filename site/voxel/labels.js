/**
 * Readable words in the scene. Each label is drawn once on a canvas in the page's own fonts (DM Mono for tags, the
 * Office Pixel face for signs and big figures) and mapped on a thin plane facing the street (+z), unlit, so night and
 * day read alike and a zoomed camera stays sharp. Labels are cached by what they say: a refresh that changes nothing
 * draws nothing. The canvas is at least `ppu` pixels per world unit (mipmapped for the far ones).
 */
export const TEXT_FONT = '"DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
export const PIXEL_FONT = '"Office Pixel", "DM Mono", ui-monospace, monospace'

/** Load the faces a canvas draws with: a canvas never waits for a web font, so draw only once they are in. */
export async function labelFontsReady() {
  if (!globalThis.document?.fonts) return
  try { await Promise.all(['400 32px "DM Mono"', '500 32px "DM Mono"', '400 32px "Office Pixel"'].map(face => document.fonts.load(face))) } catch {}
}

/**
 * The lines of a label as spans, fitted to `width` world units: each line `{ spans: [[text, color, opts]], size,
 * font, align, weight }`. A line too long loses the end of its last span to an ellipsis, never its first word.
 * Pure but for `measure(text, font)` (a canvas's measureText width, in px at `px` per unit), so it is testable.
 */
export function fitLines(lines, innerWidth, measure) {
  return lines.map(line => {
    const spans = line.spans.filter(span => span && String(span[0] ?? '').length)
    const font = line.fontFor
    let used = 0
    const out = []
    for (let i = 0; i < spans.length; i++) {
      const [raw, color, opts = {}] = spans[i]
      const text = String(raw)
      const gap = i && !opts.join ? measure(opts.sep ?? '  ', font(opts)) : 0
      const w = measure(text, font(opts))
      // a little slack: a label as wide as its own text must not lose its last letter to float rounding
      if (used + gap + w <= innerWidth + 1e-4) { out.push({ text, color, opts, gap }); used += gap + w; continue }
      // what is left of the line: the span cut to fit with an ellipsis, when at least two characters fit
      const room = innerWidth - used - gap
      let cut = text
      while (cut.length > 1 && measure(`${cut}…`, font(opts)) > room) cut = cut.slice(0, -1)
      if (cut.length > 1 || (!out.length && cut.length)) out.push({ text: `${cut.trimEnd()}…`, color, opts, gap })
      break
    }
    return { ...line, spans: out }
  })
}

export function createLabels({ THREE, renderer, ppu = 240 }) {
  const cache = new Map()
  const geometry = new THREE.PlaneGeometry(1, 1)
  const anisotropy = Math.min(8, renderer.getMaxAnisotropy?.() ?? 1)
  const scratch = document.createElement('canvas').getContext('2d')
  const fontOf = (line, opts = {}) => `${opts.bold || line.bold ? 600 : 400} ${Math.round(line.size * ppu * (opts.scale ?? 1))}px ${line.pixel || opts.pixel ? PIXEL_FONT : TEXT_FONT}`
  const measure = (text, font) => { scratch.font = font; return scratch.measureText(text).width / ppu }

  /**
   * A label mesh: `{ lines, width?, pad, bg, alpha, mark, frame, radius, align, minWidth }`. `width` fixes its width in
   * world units (the text fitted to it), else it is as wide as its longest line. The mesh's origin is the label's
   * centre, or `anchor`: 'left' | 'right' | 'bottom' | 'top' moves it to that edge's middle.
   */
  function label(spec) {
    const key = JSON.stringify(spec)
    let entry = cache.get(key)
    if (!entry) { entry = draw(spec); cache.set(key, entry) }
    entry.refs++
    const mesh = new THREE.Mesh(geometry, entry.material)
    mesh.scale.set(entry.w, entry.h, 1)
    mesh.userData.labelKey = key
    mesh.userData.size = [entry.w, entry.h]
    mesh.castShadow = false; mesh.receiveShadow = false
    mesh.renderOrder = 2
    const pivot = new THREE.Group()
    pivot.add(mesh)
    if (spec.anchor === 'left') mesh.position.x = entry.w / 2
    else if (spec.anchor === 'right') mesh.position.x = -entry.w / 2
    else if (spec.anchor === 'bottom') mesh.position.y = entry.h / 2
    else if (spec.anchor === 'top') mesh.position.y = -entry.h / 2
    else if (spec.anchor === 'bottom-left') { mesh.position.x = entry.w / 2; mesh.position.y = entry.h / 2 }
    else if (spec.anchor === 'top-left') { mesh.position.x = entry.w / 2; mesh.position.y = -entry.h / 2 }
    pivot.userData.label = true
    pivot.userData.size = [entry.w, entry.h]
    return pivot
  }

  function draw(spec) {
    const pad = spec.pad ?? .06
    // the Office Pixel face has no accents: its spans keep their base letters (CAFÉ reads CAFE) rather than fall back
    const plain = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const lines = (spec.lines || []).map(line => ({ size: .14, gap: .3, ...line, spans: line.spans.map(span => (span && (line.pixel || span[2]?.pixel) ? [plain(span[0] ?? ''), span[1], span[2]] : span)) }))
    lines.forEach(line => { line.fontFor = opts => fontOf(line, opts) })
    const markW = spec.mark ? .045 : 0
    const lineWidth = line => line.spans.reduce((w, span, i) => w + measure(String(span[0] ?? ''), fontOf(line, span[2])) + (i && !span[2]?.join ? measure(span[2]?.sep ?? '  ', fontOf(line, span[2])) : 0), 0)
    const natural = Math.max(spec.minWidth ?? 0, ...lines.map(lineWidth).map(width => width + 2 * pad + markW + (spec.mark ? .03 : 0) + .002))
    const w = Math.max(.05, spec.width ?? natural)
    const fitted = fitLines(lines, w - 2 * pad - markW, measure)
    const lineH = line => line.size * (1 + line.gap)
    const h = spec.height ?? Math.max(spec.minHeight ?? 0, fitted.reduce((sum, line) => sum + lineH(line), 0) - (fitted.at(-1)?.size ?? 0) * (fitted.at(-1)?.gap ?? 0) + 2 * pad)
    const cw = Math.max(2, Math.ceil(w * ppu)), ch = Math.max(2, Math.ceil(h * ppu))
    const canvas = document.createElement('canvas')
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d')
    const px = value => value * ppu
    const radius = px(spec.radius ?? .035)
    if (spec.bg) {
      ctx.globalAlpha = spec.alpha ?? 1
      ctx.fillStyle = spec.bg
      roundRect(ctx, 0, 0, cw, ch, radius); ctx.fill()
      ctx.globalAlpha = 1
    }
    if (spec.frame || spec.mark) {
      ctx.strokeStyle = spec.frame || spec.mark
      ctx.lineWidth = px(spec.frameWidth ?? .018)
      roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth, Math.max(0, radius - ctx.lineWidth / 2)); ctx.stroke()
    }
    if (spec.mark) { ctx.fillStyle = spec.mark; ctx.fillRect(0, 0, px(markW), ch) }
    let y = px(pad)
    const contentH = fitted.reduce((sum, line) => sum + lineH(line), 0) - (fitted.at(-1)?.size ?? 0) * (fitted.at(-1)?.gap ?? 0)
    if (spec.valign === 'middle') y = (ch - px(contentH)) / 2
    ctx.textBaseline = 'alphabetic'
    for (const line of fitted) {
      const width = line.spans.reduce((sum, span) => sum + span.gap + measure(span.text, fontOf(line, span.opts)), 0)
      const align = line.align ?? spec.align ?? 'left'
      let x = align === 'center' ? (w - width) / 2 : align === 'right' ? w - pad - width : pad + markW + (spec.mark ? .03 : 0)
      const base = y + px(line.size) * .86
      for (const span of line.spans) {
        x += span.gap
        ctx.font = fontOf(line, span.opts)
        ctx.fillStyle = span.color || '#ece2cd'
        if (span.opts?.shadow) { ctx.save(); ctx.fillStyle = span.opts.shadow; ctx.fillText(span.text, px(x) + px(.012), base + px(.012)); ctx.restore() }
        ctx.fillText(span.text, px(x), base)
        x += measure(span.text, ctx.font)
      }
      y += px(lineH(line))
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, alphaTest: .02 })
    material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2
    return { w, h, texture, material, refs: 0 }
  }

  /** Let go of a label (or every label under a group); its canvas goes once nothing shows it. */
  function release(object) {
    object?.traverse?.(child => {
      const key = child.userData?.labelKey
      if (!key) return
      const entry = cache.get(key)
      if (entry && --entry.refs <= 0) { entry.texture.dispose(); entry.material.dispose(); cache.delete(key) }
      child.userData.labelKey = null
    })
  }

  return {
    label, release, measure: (text, size, opts = {}) => measure(text, fontOf({ size }, opts)),
    get count() { return cache.size },
    dispose() { for (const entry of cache.values()) { entry.texture.dispose(); entry.material.dispose() } cache.clear(); geometry.dispose() },
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
