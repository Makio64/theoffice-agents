// A QR code with no dependency, as novibenolife draws its own (its src/qr.mjs, MIT, same author): the frame link
// (scripts/dashboard.mjs --frame) becomes a code a tablet scans off the terminal.
/**
 * Zero-dependency QR encoder — byte mode, versions 1–40, ECC L/M/Q/H.
 * Port in the style of nayuki's qrcodegen: correctness over brevity — real
 * Reed-Solomon over GF(256) (primitive 0x11D), block interleaving, all 8
 * masks scored with the standard penalties (N1=3 N2=3 N3=40 N4=10), format
 * info BCH(15,5) ^ 0x5412 and version info BCH(18,6) for v≥7. Exists so
 * invite links become QR codes without pulling in an npm dep.
 */

const ECL = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
}

// ISO/IEC 18004 tables, indexed [ordinal][version] (index 0 is padding).
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
]

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81], // H
]

// Alignment pattern center coordinates per version (spec Annex E — the table
// is irregular around v15/v22/v24/v30/v36, so it stays a table, not a formula).
const ALIGNMENT_POSITIONS = [
  [], // padding (version 0)
  [], // v1 has no alignment patterns
  [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], // v2–6
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], // v7–11
  [6, 32, 58], [6, 34, 62], // v12–13
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], // v14–17
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], // v18–20
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], // v21–23
  [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], // v24–26
  [6, 34, 62, 90, 118], // v27
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], // v28–29
  [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], // v30–31
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], // v32–33
  [6, 34, 62, 90, 118, 146], // v34
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], // v35–36
  [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], // v37–38
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170], // v39–40
]

const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function getNumDataCodewords(ver, ordinal) {
  return Math.floor(getNumRawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ordinal][ver]
}

function appendBits(bb, val, len) {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1)
}

// ---- Reed-Solomon over GF(256), primitive polynomial x^8+x^4+x^3+x^2+1 ----

function rsMultiply(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsComputeDivisor(degree) {
  // (x - r^0)(x - r^1)…(x - r^(degree-1)), r = 0x02, leading coefficient dropped
  const result = new Array(degree - 1).fill(0)
  result.push(1)
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = rsMultiply(root, 0x02)
  }
  return result
}

function rsComputeRemainder(data, divisor) {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ result.shift()
    result.push(0)
    for (let i = 0; i < result.length; i++) result[i] ^= rsMultiply(divisor[i], factor)
  }
  return result
}

// Split into blocks, append per-block ECC, then interleave column-wise —
// short blocks carry one fewer data codeword and are skipped at that index.
function addEccAndInterleave(data, ver, ordinal) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ordinal][ver]
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ordinal][ver]
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const rsDiv = rsComputeDivisor(blockEccLen)
  const blocks = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
    const dat = data.slice(k, k + datLen)
    k += datLen
    const ecc = rsComputeRemainder(dat, rsDiv)
    if (i < numShortBlocks) dat.push(0) // placeholder, skipped below
    blocks.push(dat.concat(ecc))
  }
  const result = []
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i])
    }
  }
  return result
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** boolean[][] of modules (true = dark), auto version 1–40, auto mask. */
export function qrMatrix(text, { ecl = 'M' } = {}) {
  const level = ECL[ecl]
  if (!level) throw new Error(`unknown ecl "${ecl}" — use L, M, Q or H`)
  const data = Array.from(new TextEncoder().encode(String(text)))

  // smallest version whose byte-mode capacity fits the payload
  let version = 0
  for (let v = 1; v <= 40; v++) {
    const cciBits = v <= 9 ? 8 : 16
    if (4 + cciBits + data.length * 8 <= getNumDataCodewords(v, level.ordinal) * 8) {
      version = v
      break
    }
  }
  if (!version) throw new Error(`text too long for a QR code at ecl ${ecl}`)

  // byte mode segment + terminator + pad to capacity with 0xEC/0x11
  const capacity = getNumDataCodewords(version, level.ordinal) * 8
  const bb = []
  appendBits(bb, 0x4, 4)
  appendBits(bb, data.length, version <= 9 ? 8 : 16)
  for (const b of data) appendBits(bb, b, 8)
  appendBits(bb, 0, Math.min(4, capacity - bb.length))
  appendBits(bb, 0, (8 - (bb.length % 8)) % 8)
  for (let pad = 0xec; bb.length < capacity; pad ^= 0xec ^ 0x11) appendBits(bb, pad, 8)
  const codewords = []
  for (let i = 0; i < bb.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bb[i + j]
    codewords.push(b)
  }
  const allCodewords = addEccAndInterleave(codewords, version, level.ordinal)

  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array(size).fill(false))
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false))

  function setFunctionModule(x, y, dark) {
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  function drawFinderPattern(cx, cy) {
    // 4-radius so the light separator ring is claimed as function too
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        setFunctionModule(x, y, dist !== 2 && dist !== 4)
      }
    }
  }

  function drawFormatBits(mask) {
    const fmtData = (level.formatBits << 3) | mask
    let rem = fmtData
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((fmtData << 10) | rem) ^ 0x5412 // BCH(15,5), then the spec mask
    const bit = (i) => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, bit(i))
    setFunctionModule(8, 7, bit(6))
    setFunctionModule(8, 8, bit(7))
    setFunctionModule(7, 8, bit(8))
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, bit(i))
    setFunctionModule(8, size - 8, true) // the always-dark module
  }

  function drawVersionInfo() {
    if (version < 7) return
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (version << 12) | rem // BCH(18,6)
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunctionModule(a, b, dark)
      setFunctionModule(b, a, dark)
    }
  }

  // function patterns: timing, finders + separators, alignment, reserved areas
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0)
    setFunctionModule(i, 6, i % 2 === 0)
  }
  drawFinderPattern(3, 3)
  drawFinderPattern(size - 4, 3)
  drawFinderPattern(3, size - 4)
  const align = ALIGNMENT_POSITIONS[version]
  const n = align.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // the three corners overlapping finder patterns have no alignment pattern
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunctionModule(align[j] + dx, align[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }
  drawFormatBits(0) // dummy — reserves the cells before codeword placement
  drawVersionInfo()

  // codewords in the zigzag order, skipping function modules and column 6
  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && bitIndex < allCodewords.length * 8) {
          modules[y][x] = ((allCodewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
          bitIndex++
        }
      }
    }
  }

  function applyMask(mask) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunction[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x]
      }
    }
  }

  // ---- penalty scoring (spec section 8.8.2) ----

  function finderPenaltyCountPatterns(runHistory) {
    const c = runHistory[1]
    const core = c > 0 && runHistory[2] === c && runHistory[3] === c * 3 && runHistory[4] === c && runHistory[5] === c
    return (core && runHistory[0] >= c * 4 && runHistory[6] >= c ? 1 : 0)
      + (core && runHistory[6] >= c * 4 && runHistory[0] >= c ? 1 : 0)
  }

  function finderPenaltyAddHistory(runLength, runHistory) {
    if (runHistory[0] === 0) runLength += size // the edge counts as light border
    runHistory.pop()
    runHistory.unshift(runLength)
  }

  function finderPenaltyTerminateAndCount(runColor, runLength, runHistory) {
    if (runColor) {
      finderPenaltyAddHistory(runLength, runHistory)
      runLength = 0
    }
    finderPenaltyAddHistory(runLength + size, runHistory)
    return finderPenaltyCountPatterns(runHistory)
  }

  function getPenaltyScore() {
    let result = 0
    for (let y = 0; y < size; y++) {
      let runColor = false
      let runX = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++
          if (runX === 5) result += PENALTY_N1
          else if (runX > 5) result++
        } else {
          finderPenaltyAddHistory(runX, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = modules[y][x]
          runX = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3
    }
    for (let x = 0; x < size; x++) {
      let runColor = false
      let runY = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++
          if (runY === 5) result += PENALTY_N1
          else if (runY > 5) result++
        } else {
          finderPenaltyAddHistory(runY, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3
          runColor = modules[y][x]
          runY = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        if (modules[y][x] === modules[y][x + 1] && modules[y][x] === modules[y + 1][x] && modules[y][x] === modules[y + 1][x + 1]) {
          result += PENALTY_N2
        }
      }
    }
    let dark = 0
    for (const row of modules) for (const m of row) dark += m ? 1 : 0
    const total = size * size
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    return result + k * PENALTY_N4
  }

  // try all 8 masks, keep the lowest penalty (first wins ties, per spec order)
  let bestMask = 0
  let minPenalty = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask)
    drawFormatBits(mask)
    const penalty = getPenaltyScore()
    if (penalty < minPenalty) {
      bestMask = mask
      minPenalty = penalty
    }
    applyMask(mask) // XOR undoes itself
  }
  applyMask(bestMask)
  drawFormatBits(bestMask)

  return modules
}

/** Complete standalone <svg> — one crisp path for dark modules over a light rect. */
export function qrSvg(text, { ecl = 'M', margin = 2, dark = '#1a140b', light = '#f3ead6', size } = {}) {
  const matrix = qrMatrix(text, { ecl })
  const n = matrix.length
  const dim = n + margin * 2
  const parts = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`)
    }
  }
  const px = size ? ` width="${size}" height="${size}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"${px} shape-rendering="crispEdges">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/>`
    + `<path d="${parts.join('')}" fill="${dark}"/>`
    + `</svg>`
}

/**
 * Half-block terminal rendering, two module rows per text line. LIGHT modules
 * are the block characters — on the usual dark terminal the code shows as
 * light-on-dark with correct polarity and a solid light quiet zone (qrencode's
 * ANSI UTF8 style). Dark modules are spaces.
 */
export function qrTerminal(text, { ecl = 'L' } = {}) {
  const matrix = qrMatrix(text, { ecl })
  const n = matrix.length
  const margin = 2 // 2-module quiet zone = 2 cols / 1 text line each side
  const isLight = (x, y) => x < 0 || y < 0 || x >= n || y >= n || !matrix[y][x]
  const lines = []
  for (let y = -margin; y < n + margin; y += 2) {
    let line = ''
    for (let x = -margin; x < n + margin; x++) {
      const top = isLight(x, y)
      const bottom = isLight(x, y + 1)
      line += top ? (bottom ? '█' : '▀') : (bottom ? '▄' : ' ')
    }
    lines.push(line)
  }
  return lines.join('\n')
}
