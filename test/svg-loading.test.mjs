// The waiting room (lib/svg-loading.mjs, renderLoading): the drawing a tab shows while its facts are read for the first
// time, the same for the whole wait.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onBeat, renderLoading } from '../plugin/lib/svg.mjs'

test('a room for each read, a card under the size of any drawing, its motion on the beat once in the pane', () => {
  for (const kind of ['week', 'today', 'month', 'past']) {
    for (const night of [false, true]) {
      const svg = renderLoading(kind, { width: 900, card: true, night })
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="900" /)
      assert.ok(svg.includes(`data-loading="${kind}"`))
      assert.match(svg, /<clipPath id="ld-card">/)
      assert.ok(svg.length < 30_000, `${kind}: ${svg.length}`)
      assert.match(svg, /aria-label="Reading [^"]+: Clawd at the archive desk/)
      assert.doesNotMatch(svg, /<script|\son[a-z]+=|href="(?!#)/i)
      const beat = onBeat(svg, 'ld-')
      assert.doesNotMatch(beat, /<animate\b|<animateTransform\b/, 'nothing keeps a frame loop running')
      assert.ok(beat.includes('<set'), 'its days still light up')
    }
  }
})

test('the same room for the same read, width and hour; a still one with no motion; an odd kind reads the month', () => {
  assert.equal(renderLoading('month', { width: 700 }), renderLoading('month', { width: 700 }))
  const still = renderLoading('past', { width: 500, animate: false })
  assert.doesNotMatch(still, /<animate|<set/)
  assert.ok(renderLoading('nonsense', { width: 600 }).includes('READING THE MONTH'))
  for (const width of [240, 400, 2400]) assert.match(renderLoading('week', { width }), new RegExp(`^<svg [^>]*width="${width}"`))
})
