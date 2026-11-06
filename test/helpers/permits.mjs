// A file's permission bits for the tests that check The Office keeps its files private (0700 folders, 0600 files).
// Windows keeps no such bits (every file reads 0666, every folder 0777): there the check is of nothing, so the
// bits asked for are answered.
import fs from 'node:fs'

/** `file`'s permission bits, or on Windows `want` itself. */
export const permits = (file, want) => (process.platform === 'win32' ? want : fs.statSync(file).mode & 0o777)
