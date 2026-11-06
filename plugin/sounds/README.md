# The Office's sound

The pane makes one sound: `page.mp3`, a soft paper flip, when a tab, a range of the Timelapse or a page of the Month is pressed. It is always on (`hooks/register.tsx`, `turnPage`).

It was made with [ElevenLabs](https://elevenlabs.io) Sound Effects v2 (`eleven_text_to_sound_v2`, 0.5 s, prompt influence 0.6), the best of three takes of:

> Soft paper page turn, one quick flip

Then finished with ffmpeg: trimmed to the flip, a high-pass at 400 Hz, a short fade-out, peaks under −1.5 dBTP, mono MP3. The pane plays it at a gain of 0.3.
