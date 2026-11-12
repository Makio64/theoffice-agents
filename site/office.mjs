// A little inhabited floor, using the plugin's furniture, lighting and character timelines.
// The caller supplies the kit and desk accessories from the same build as the preview renderer.
function desk(kit, ctx, agent, script, screen, deskProps) {
  const { use, castFigure } = kit
  return use(ctx, 'rm-kcool') + castFigure(ctx, agent, script, `site-desk-${agent}`, 22, 12) +
    use(ctx, 'rm-dcool', 0, 0, ` color="${kit.CAST[agent].hex.dark}"`) + use(ctx, 'rm-kb') +
    use(ctx, `rm-m${screen}`) + deskProps(ctx, `site-desk-${agent}`, agent)
}

/** The LIVE feature window shares the plugin's lit desk and character choreography. */
export function deskScene(kit, { night = true, animate = true, deskProps = () => '' } = {}) {
  const ctx = { id: 'feature-', animate, night, defs: new Map(), caps: { art: 0 }, color: () => '#9ab86a' }
  const body = desk(kit, ctx, 'claude', 'type', 'coding', deskProps)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="136" viewBox="0 4 50 34" shape-rendering="crispEdges" aria-hidden="true"><defs>${kit.defsMarkup(ctx)}</defs>${body}</svg>`
}

export function officeScene(kit, { width = 960, night = true, animate = true, deskProps = () => '' } = {}) {
  const { use, paint, castFigure, figure, defsMarkup, K } = kit
  const W = Math.max(96, Math.floor(width / 4) * 2)
  const ctx = { id: 'lobby-', animate, night, defs: new Map(), caps: { art: 0 }, color: () => '#9ab86a' }
  const aside = W >= 340
  const deskW = aside ? W - 132 : W
  const columns = Math.min(4, Math.max(1, Math.floor((deskW - 12) / 52)))
  const rows = Math.ceil(4 / columns)
  const cell = Math.floor((deskW - 12) / columns)
  const breakY = aside ? 14 : rows * 48 + 4
  const hallY = aside ? rows * 48 + 6 : breakY + 36
  const H = hallY + 30
  let body = ''

  const floor = (x, y, w, h) => paint([
    [x, y, w, h, night ? '#5a412c' : '#8a6845'],
    [x, y, w, 1, '#b08d5c'],
    ...Array.from({ length: Math.ceil(h / 5) }, (_, r) => [x, y + 4 + r * 5, w, 1, '#000/.12']),
    ...Array.from({ length: Math.ceil(w / 24) }, (_, i) => [x + i * 24, y, 1, h, '#000/.12']),
  ])

  // Each desk has the same rich, independently seeded movement as a real session in the plugin.
  const desks = [
    ['claude', 'type', 'coding'], ['codex', 'type', 'terminal'],
    ['gemini', 'read', 'reading'], ['cursor', 'think', 'planning'],
  ]
  desks.forEach(([agent, script, screen], i) => {
    const x = 6 + (i % columns) * cell + Math.floor((cell - 48) / 2)
    const y = Math.floor(i / columns) * 48
    body += floor(0, y + 37, deskW, 11)
    body += `<g data-office-desk="${agent}" transform="translate(${x} ${y})">` +
      desk(kit, ctx, agent, script, screen, deskProps) + '</g>'
  })

  // Coffee, a bubbling water cooler and two colleagues in conversation, clear of the walking lane.
  const bx = aside ? W - 120 : Math.max(0, Math.floor((W - 112) / 2))
  body += floor(aside ? deskW : 0, breakY + 27, aside ? W - deskW : W, 9)
  body += `<g data-office-break transform="translate(${bx} ${breakY})">` +
    use(ctx, 'coffee', 2, 8) + use(ctx, 'lv-shelf', 2, -4) +
    castFigure(ctx, 'kimi', 'chat0', 'site-coffee-kimi', 30, 12) +
    castFigure(ctx, 'grok', 'chat1', 'site-coffee-grok', 59, 12) +
    use(ctx, 'mug', 49, 22, ' color="#6fb2ff"') + use(ctx, 'mug', 60, 22, ' color="#eec96f"') +
    use(ctx, 'cooler', Math.min(89, W - bx - 11), 8) + '</g>'
  body += floor(0, hallY, W, 30)
  body += paint([[0, hallY, W, 2, K.woodD], [0, H - 3, W, 3, K.slab]])

  // The rest of the cast (whoever the scene does not seat above) waits in the hall, so the page shows the whole cast.
  const seated = new Set(['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok'])
  kit.AGENT_IDS.filter((a) => !seated.has(a)).forEach((agent, i) => {
    body += castFigure(ctx, agent, i % 2 ? 'chat1' : 'chat0', `site-hall-${agent}`, Math.max(0, W - 4 - 28 * (3 - i)), hallY + 12)
  })

  // Native walking legs and eye movement, crossing in opposite directions on separate lanes.
  for (const [i, agent] of ['codex', 'claude'].entries()) {
    const right = i === 0
    const from = right ? -28 : W + 2, to = right ? W + 2 : -28
    const y = hallY + 2 + i * 7
    const still = Math.round(W * (right ? 0.25 : 0.65))
    const steps = Math.ceil(Math.abs(to - from) / 2)
    const values = Array.from({ length: steps + 1 }, (_, n) => `${Math.round(from + (to - from) * n / steps)} ${y}`)
    const motion = animate ? `<animateTransform attributeName="transform" type="translate" values="${values.join(';')}" dur="${steps / 7}s" begin="${-steps / 7 * (right ? 0.27 : 0.68)}s" calcMode="discrete" repeatCount="indefinite"/>` : ''
    body += `<g data-office-walker="${agent}" transform="translate(${still} ${y})">${motion}` +
      paint([[3, 14, 21, 2, '#000/.18']]) + figure(ctx, agent, { legs: 'walk', look: [right ? 2 : -2, 0], blinkAt: -1.4 - i }) + '</g>'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${H * 2}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true"><defs>${defsMarkup(ctx)}</defs>${body}</svg>`
}
