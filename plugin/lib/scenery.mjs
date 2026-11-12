// The scenery's palette: plugin/themes/<name>.json (SKIES and CLOUD_TINTS, one shape per theme; a sky stop at "SKY" is
// the roof's height, see svg-kit.mjs). THEOFFICE_SCENERY picks the theme at load; an unknown name warns on stderr and
// keeps the default. Pure (no node:* imports), so the desktop mod can load it as svg-kit does. A new theme is a JSON file
// with the default's shape, plus one import and one entry in THEMES below (only `default` ships).
import defaultTheme from '../themes/default.json' with { type: 'json' }

const THEMES = { default: defaultTheme }
const NAME = globalThis.process?.env?.THEOFFICE_SCENERY || 'default'
if (!Object.hasOwn(THEMES, NAME)) console.warn(`theoffice: no scenery "${NAME}" (THEOFFICE_SCENERY), using "default"`)
export const THEME = Object.hasOwn(THEMES, NAME) ? THEMES[NAME] : THEMES.default
