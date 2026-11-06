import { Vector3 } from 'three/webgpu'
import { fog, mix, positionWorld, screenUV, smoothstep, step, uniform, sRGBTransferEOTF } from 'three/tsl'

// The sky of the hour, as the pixel office paints it: night, dawn's pinks, day, a golden dusk
const skies = {
  night: { colors: [0x0a1027, 0x171c37, 0x39304b], middle: .56 },
  dawn: { colors: [0x3b4a7a, 0xb98597, 0xf0be92], middle: .58 },
  day: { colors: [0x8da6cb, 0xb6b8cc, 0xc2a98d], middle: .65 },
  dusk: { colors: [0x2b2452, 0xa65f78, 0xee9a5c], middle: .6 },
}
/** The sky of an hour: night from 20:00 to 6:00, dawn until 8:00, day until 18:00, then dusk. */
export const skyOfHour = hour => (hour >= 20 || hour < 6 ? 'night' : hour < 8 ? 'dawn' : hour < 18 ? 'day' : 'dusk')
const rgb = hex => new Vector3((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255)
const cssColor = hex => `#${hex.toString(16).padStart(6, '0')}`

/** Distance fades into the exact screen-space sky, including when orbiting. */
export function createAtmosphere(scene, element) {
  // Decode after mixing encoded colors, matching the page's CSS gradient.
  const top = uniform(rgb(skies.night.colors[0]))
  const middle = uniform(rgb(skies.night.colors[1]))
  const bottom = uniform(rgb(skies.night.colors[2]))
  const middleStop = uniform(skies.night.middle)
  const y = screenUV.y.clamp()
  const upper = mix(top, middle, y.div(middleStop).clamp())
  const lower = mix(middle, bottom, y.sub(middleStop).div(middleStop.oneMinus()).clamp())
  const background = sRGBTransferEOTF(mix(upper, lower, step(middleStop, y)))
  const lateral = smoothstep(9.4, 25.8, positionWorld.x.abs())
  const distant = smoothstep(4, 42, positionWorld.z.negate())
  const factor = lateral.oneMinus().mul(distant.oneMinus()).oneMinus()
  scene.fogNode = fog(background, factor)
  function setTheme(theme, name = theme) {
    const sky = skies[name] ?? skies[theme === 'day' ? 'day' : 'night']
    top.value.copy(rgb(sky.colors[0]));middle.value.copy(rgb(sky.colors[1]));bottom.value.copy(rgb(sky.colors[2]))
    middleStop.value = sky.middle
    element?.style.setProperty('--office-sky', `linear-gradient(${cssColor(sky.colors[0])},${cssColor(sky.colors[1])} ${sky.middle * 100}%,${cssColor(sky.colors[2])})`)
  }
  setTheme('night')
  return { setTheme, dispose() { scene.fogNode = null } }
}
