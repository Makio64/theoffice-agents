# Voxel rendering and responsiveness

The retained WebGPU optimization caches opaque character draw commands with Three.js `BundleGroup`. Architecture, neon, transparent ordering and the WebGL 2 fallback retain their original paths.

An eight-round, alternating paired comparison measured **5.97 → 5.03 CPU ms/frame**, a **15.8% reduction**. The paired 95% confidence interval for the change was **−1.25 to −0.63 ms/frame**. An earlier four-round instrumented comparison was inconclusive and was retained with the evidence.

Conditions: gpu-perf-agent 2.2.0, Three.js 0.187.0, Chrome 156, native WebGPU on an Apple M3 Max, headless 1280×720 at DPR 1. Each side used two warmups and three 250 ms samples per round. Both sides rendered the same expanded building with eight projects and twenty agents. Visible output and nonzero GPU work were checked. Cadence remained at the 60 Hz display cap; this establishes a CPU submission improvement, not a GPU or FPS improvement. The GPU diagnostic reported approximately 0.70 ms p50 and 1,533 draws across three passes.

Seven fixed-pose image comparisons retained all geometry and detail. Four were pixel-identical. Three differed by one or two pixels at native voxel contact-shadow boundaries. Broader architectural caching was rejected because it changed neon ordering and shadow edges.

Full local results, rejected candidates, frozen source copies and reproduction commands are retained in `.cache/voxel-perf/reports/RESULTS.md` and `.cache/voxel-perf/reports/expanded-actor-bundles-ab-cpu.json`.

Subsequent changes address the reported UI lag and readability separately:

- Opening details no longer refits the camera or reallocates actors. Fixed drawers keep the canvas dimensions unchanged.
- Directory search changes DOM rows without removing and rebuilding scene actors.
- Rendering stops when the canvas leaves the viewport or the document is hidden.
- Idle labels reuse their projected positions and avoid forcing a whole-scene matrix update.
- Contiguous parquet faces remove the tiny tile gaps that aliased into dark floor grain. Pavement, subfloor and parquet have separate depths.
- A frontal perspective camera and a scrolling 1088 px column restore the original website's reading order. Orbit controls are opt-in.

These later changes were verified in the browser, including stable 1088×1180 canvas dimensions when opening a project and a paused renderer after scrolling to Weekly. They are not assigned the numeric A/B result above.

## District, Retina, AO and bloom

The subsequent quality pass adds four neighboring buildings, eighteen background towers, street furniture, lateral/depth fog, native display density up to DPR 2, contact GTAO and HDR bloom. Those changes increase image quality and alter the workload; they are not a same-output speedup comparison.

The district shares instance batches, adds no lights or animation loops, and stays outside the office camera's framing bounds. The post pipeline uses one MRT geometry pass with an RGBA8 normal attachment, half-resolution AO with 16 samples and depth-aware denoising, and thresholded bloom. Scene colors and DOM labels are not blurred. The final capture recorded 1,574 draws and sixteen passes, compared with 1,533 draws and three passes before the quality work.

The same native Apple M3 Max / Chrome 156 setup was checked at:

| CSS viewport / display DPR | Actual canvas buffer | Effects | Declared GPU allocations |
| --- | --- | --- | ---: |
| 1512×982 / 2 | 2176×2360, render DPR 2 | GTAO + bloom | 168.4 MiB |
| 390×844 / 3 | 748×1120, render DPR capped at 2 | GTAO + bloom | 55.35 MiB |

Both captured the intended district with zero GPU/runtime errors. Automatic per-pass GPU timestamps reported implausible 25–53 ms values, including similar multi-millisecond costs for tiny bloom passes. These measurements are retained as untrusted; a 60 Hz callback rate alone was not treated as proof of GPU performance.

The earlier queue-drained captures reporting 3.74 ms desktop / 1.88 ms mobile **are invalid as full-pipeline timings**. Three's effect nodes reuse passes within the same internal frame. Repeated renders without advancing that frame therefore measured cached output rather than all effects. Those reports remain as diagnostic evidence and must not support a performance claim.

An explicit `forceWebGL: true` cache-only smoke test also rendered the district and fog correctly: 1,561 GL draws, direct rendering, no AO/bloom and no runtime errors. Disposal and resize paths were reviewed, and changing display density updates the drawing buffer.

Complete evidence, rejected timestamp readings, frozen sources and reproduction commands are retained in `.cache/voxel-district-perf/reports/RESULTS.md`. All owned profiling servers and Chrome processes were stopped after capture.

## Same-visual website and application optimizations

The November 2026 performance pass retains the drawings, styles, geometry, lighting,
display density, AO samples and bloom settings:

- The pixel website generates its responsive SVG floors in a module worker. Browsers
  that cannot start the worker use the original generator on the main thread. Request
  identities prevent an older theme or resize from replacing the latest drawing.
- The voxel UI caches the seven native sprites and retains existing DOM sections when
  their HTML has not changed. Inspector actions resolve the currently selected session,
  including distinct sessions with identical displayed details.
- The local hosts serialize each snapshot once and share its compressed representation
  across readers. Static voxel assets use a bounded cache and ETag revalidation; private
  pages and snapshots retain `no-store` without validators.
- Repeated size notifications no longer reset an unchanged GPU backing buffer. The
  initial desktop buffer is sized once instead of three times; ten duplicate window
  resize events cause zero buffer resets instead of ten.

Four alternating website comparisons in headless Chrome at 1440×960, DPR 1, reduced
motion and 4× CPU throttling measured median long-task time of 554.5 → 371.5 ms
(−33.0%) and blocking time beyond 50 ms of 304.5 → 171.5 ms (−43.7%). The largest
remaining task was approximately 203 ms. All five responsive SVGs were byte-identical;
the full-page website comparison had zero changed pixels.

Measured local transfer sizes for the same compiled assets were 1,281,482 → 359,841
bytes for JavaScript (−71.9%) and 109,640 → 22,421 bytes for CSS (−79.6%). A week
snapshot was 102,756 → 17,920 bytes (−82.6%). Decompressed contents were identical;
validated static assets returned 304 with no response body.

Six alternating Chrome UI rounds, each with twenty identical snapshot refreshes and
layout included, measured a median of 10.5 → 1.0 ms and p95 of 13.2 → 1.7 ms. HTML
replacements fell from 240 to zero per round. This isolates the UI with a scene stub;
it is not a GPU or animation-FPS claim. Full-page UI captures were byte-identical.

Real WebGPU desktop and mobile-size checks retained GTAO/bloom and the 2176×2360 and
748×1120 buffers respectively, with no runtime errors. Their separately captured
post-processing images have small quantization differences; no pixel-identical 3D
or pure-GPU speedup is claimed. Automatic multi-pass GPU timestamps remain subject
to the limitation documented above, so no rendering-quality reduction was made.

Evidence and reproduction harnesses are retained under `.cache/site-app-perf/` and
`.cache/voxel-ui-perf/`.

### Second pass: startup, paused rendering and data preparation

The workspace now binds its controls before dynamically importing the GPU scene.
The initial production JavaScript changes from 1,288.03 to 83.33 kB, or 365.44 to
30.17 kB with gzip. The scene loads separately with the same shaders, geometry,
fonts and CSS. Four alternating cold-load comparisons on native Chrome WebGPU,
1512×982 at DPR 2, measured:

| Condition | UI ready, before → after | Scene ready, before → after |
| --- | --- | --- |
| Local HTTP, gzip | 103.2 → 56.1 ms | 390.65 → 360.7 ms |
| 4 Mbps, 40 ms latency, gzip | 914.55 → 252.6 ms | 1191.9 → 1201.35 ms |

The constrained-network UI improvement is 72.4%. The scene-ready difference in
that condition is +9.45 ms (+0.8%); no scene-startup or first-paint gain is claimed.
Controls work while the scene loads. Import and renderer failures retain retry,
and leaving during either asynchronous step does not retain a renderer.

A paused scene no longer resubmits unchanged geometry and post-processing. Dirty
state, orbit controls, camera transitions, resizing and floor movement still repaint.
Floor transitions snap to their destination below 1e-7 world units so an asymptotic
return to zero cannot keep a paused renderer busy indefinitely. Animation playback
retains its ordinary render path and all quality settings.

Four alternating paused-scene measurements used the same desktop viewport and DPR,
with CDP task duration and a cache-only counter around the full-quality render call.
Over approximately 1.2 seconds, baseline render counts were 74–76; candidate counts
were zero after the initial image. Median CPU task time was 410.01 → 66.91 ms
(−83.7%). Both retained an identical image throughout their own paused measurement.
Theme, façade, commit count and project selection each triggered one repaint;
camera motion, playback and both floor-transition directions were also verified.
This is reduced work while paused, not an active-animation GPU-time or FPS gain.

Voxel snapshot preparation now indexes agents by the already normalized project
name and normalizes each project name once. Five alternating benchmark rounds
with exact-output checks measured 0.414 → 0.296 ms for a 12-project/10-desk fixture,
1.739 → 0.740 ms for 40 projects/20 desks, and 16.963 → 4.935 ms for 40 projects/250
desks. No cross-snapshot cache or freshness change is involved.

On the pixel website, batching street updates and reading layout before mutations
reduced layout passes from seven to five and style recalculations from twelve to
eight in all six paired checks. Six desktop/mobile, day/night and alternative-route
image comparisons had zero changed pixels. Overall CPU time did not improve
reliably, so no whole-page speedup is assigned to that change.

Static-transform caching was also tested in four paired rounds: CPU time changed
5.93 → 5.85 ms/frame (−1.4%, paired 95% CI −1.00 to +0.84 ms). It was rejected
because the improvement was not established. Second-pass source baselines, scripts
and reports are retained under `.cache/site-app-perf-pass2/`.

### Third pass: scrolling, hidden tabs and title indexes

The pixel website registers `--parallax-y` as a non-inherited length. The scenery
containers use this offset directly; SVG descendants do not use it. This avoids
recalculating descendant styles on every scroll update. Four alternating 120-frame
scroll comparisons in headless Chrome, 1440×960 at DPR 1 with 4× CPU throttling,
measured 404.37 → 238.05 ms of style recalculation (−41.1%). Individual pairs saved
30–49%; no FPS increase is claimed. Thirty-six comparisons across desktop/mobile,
day/night, scroll positions and the alternative route had identical pixels,
transforms, bounds and SVGs. Simulating an engine that ignores the registration
retained the same output.

Local polling now cancels its timer and active request while the document is hidden.
Returning queues exactly one fresh request, including when cancellation is still
settling. Visible polling retains the ten-second cadence. Timeouts still report a
visible error and retry; hidden or obsolete responses never replace current data.
The compatibility path uses an ordinary AbortController and a cleared timeout.
Ten state-machine tests cover these cases. A production-build browser check with
the token-protected host and its CSP confirmed zero hidden polling, one concurrent
request at most, immediate fresh data on return and no obsolete render after pagehide.

The collector retains unchanged Codex title indexes using file identity, size, mtime
and ctime, and returns an independent Map to each caller. The LRU holds at most eight
indexes with eight MiB of source files combined; this is not a bound on JavaScript
heap usage. Five alternating rounds with a 208,996-byte/1,557-title fixture measured
0.870 → 0.067 ms for a warm title lookup (−92.3%, about 0.80 ms per refresh). Ten
unchanged lookups avoided 2.09 MB of file reads, while still checking metadata.
Append, rewrite, replacement, deletion and account-isolation tests preserve freshness.
This is a component cost, not an overall collector speedup.

Two additional experiments were rejected: snapshot lookup maps saved only about
8 microseconds, and memoizing the main collector cache needed more memory or slower
copies. A more aggressive paused-scene computation gate also remained unproven.
Its four-round median task times were 66.82 → 60.38 ms per approximately 1.2-second
window; eight further rounds measured 71.09 → 64.15 ms. The latter paired mean
change was −9.06 ms with a 95% confidence interval of −26.83 to +8.71 ms, so the
prototype was not retained. Evidence is under `.cache/site-app-perf-pass3/`.

### Fourth pass: the guide, fonts and the offscreen renderer clock

The new website guide reserves space using a non-inherited `--dialogue-space`.
Both consumers, body padding and the installation anchor, receive the same explicit
value; destroying the guide restores the anchor's previous inline value and priority.
Four alternating 24-fold/expand comparisons in Chrome at 1440×960, DPR 1 and 4× CPU
throttling measured style work of 156.07 → 40.26 ms (−74.2%) and task time of
393.64 → 244.57 ms (−37.9%). These are guide-interaction costs, not whole-page claims.

The guide's Press Start font now prefers a lossless WOFF2 file: 115,280 → 29,020
bytes (−74.8%), retaining the original TTF fallback. All 657 glyphs, outlines,
hinting, Unicode mapping, metrics and license information were checked. Twenty-eight
desktop/mobile image comparisons across guide topics, folding and anchor navigation
had zero different pixels. Blocking WOFF2 successfully loaded the TTF before reveal.
The loader, atomic SVG predecode pipeline and SVG animation clocks were preserved.

Three r187's public `setAnimationLoop(null)` clears the application callback but
continues its internal RAF/node clock. The offscreen path now also stops that clock,
using a guarded adapter for the pinned renderer's `_animation.stop()`. Resuming
uses the public API. Hidden screenshots stop the clock again in `finally`, including
after a rendering failure. Five integration tests exercise the installed Three
Renderer and Animation controller, including resume and missing-private-method fallback.

Four alternating native WebGPU checks at 1512×982 and DPR 2 measured 75 → 0 internal
clock ticks per approximately 1.2-second offscreen window. Both versions retained
their image. Three suspend/resume/export cycles and the WebGL 2 fallback passed.
Task-time medians were 53.01 → 49.58 ms, but that small, noisy difference is not
presented as a general CPU or GPU speedup; eliminating the unused clock is the result.

Unchanged Codex tails now reuse only a small parsed summary, with file identity,
size, mtime, ctime and the requested prefix checked on every call. At most 32
summaries are retained, each limited to 16,384 serialized JSON characters; callers
receive independent copies. Status aging is still calculated using the current
collection clock. Five alternating benchmark rounds measured ordinary 65.8 kB tails
at 0.0517 → 0.0040 ms and a 791 kB long-output tail at 0.4810 → 0.0041 ms. Ten warm
lookups avoided 655 kB and 13.81 MB of content reads respectively; metadata checks
remain. These are per-tail costs, not an overall collector speedup.

Reusing animated SVG URLs was rejected because it changes their document clocks.
Further allocation caching was also rejected: it would save only 4–11 microseconds
per ten-second refresh. Fourth-pass evidence is in `.cache/site-app-perf-pass4/`.

## Animated street and corrected full-work check

Three moving cars and six pedestrians share three instanced batches (180 voxels), without extra lights, shadow maps or animation loops. Their transforms update at 30 Hz and stop when the office is paused or offscreen. The distance haze now matches the background gradient in screen space, with the central office outside its fog bounds.

The corrected cache-only benchmark advances Three's internal node frame before **every** render, waits for GPU completion, and verifies the amount of submitted work. Every ten-frame candidate batch executed exactly **160 passes and 15,770 draws**; eight batches rendered eighty full-quality frames at DPR 2 with GTAO and bloom active. CPU submission, GPU execution and fence overhead together measured **11.16–11.86 ms per frame, approximately 11.58 ms median**. The prior scene, measured with the corrected method, was approximately 10.7 ms. These are separate, different-output captures, not an A/B speedup claim.

The tested workload fits the 16.67 ms budget for 60 Hz on this Apple M3 Max. This is a warm fixed-scene test, not pure GPU time, a 120 Hz claim, or physical phone evidence. Declared GPU allocations were 168.42 MiB, compared with 168.38 MiB before the moving actors. All visual quality settings were retained.

Full measurement corrections, dynamic pose and pause checks, screenshots and reproduction instructions are retained under `.cache/voxel-street-perf/reports/`.

## Street polish and idle rendering

The next visual iteration adds 105 static voxel boxes for flowers, a chalk menu,
a book crate, café furniture, low bollards, drains and stepped lamp pools. They
share eight material batches, add no lights or shadows, and have no animation
updates. Both pedestrian lanes now have paving beneath them. Day/night, paused
façade changes, separated floors and a 390 px mobile layout were checked in the
native WebGPU browser without runtime warnings or errors. DPR, AO samples, bloom
and rendering precision are unchanged. This visual addition is not claimed as
a same-output speedup.

A paused scene no longer resubmits unchanged geometry and post-processing. Dirty
state, orbit controls, camera transitions, resizing and floor movement still repaint.
Floor transitions snap to their destination below 1e-7 world units so an asymptotic
return to zero cannot keep a paused renderer busy indefinitely. Animation playback
retains its ordinary render path and all quality settings.

Four alternating paused-scene measurements used the same desktop viewport and DPR,
with CDP task duration and a cache-only counter around the full-quality render call.
Over approximately 1.2 seconds, baseline render counts were 74–76; candidate counts
were zero after the initial image. Median CPU task time was 410.01 → 66.91 ms
(−83.7%). Both retained an identical image throughout their own paused measurement.
Theme, façade, commit count and project selection each triggered one repaint;
camera motion, playback and both floor-transition directions were also verified.
This is reduced work while paused, not an active-animation GPU-time or FPS gain.


This iteration also tested two full-quality rendering candidates in frozen copies.
Materializing the denoised AO into full-resolution R32Float was pixel-identical,
but added 20.5 MB and established no timing gain. Caching opaque work-floor
commands improved CPU submission from 5.22 to 3.85 ms/frame in four paired rounds
(−26.2%, paired 95% interval −1.76 to −0.98 ms), but changed the day and separated-
floor images substantially. Both candidates were rejected. The delivered scene
retains its existing actor-only bundles and original AO pipeline.

Reports, exact submitted-work counts, seven fixed-pose comparisons and
reproduction instructions are retained in
`.cache/voxel-polish-perf/reports/RESULTS.md`.
