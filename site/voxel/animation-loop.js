/** Suspend the initialized renderer's clock as well as the application callback. */
export function suspendAnimation(renderer) {
  renderer.setAnimationLoop(null)
  // Pinned Three r187 keeps its internal RAF running after clearing the callback.
  // The public setAnimationLoop(callback) starts this clock again on reveal.
  const animation = renderer._animation
  if (typeof animation?.stop === 'function') animation.stop()
}
