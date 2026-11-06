// Reuse the wire representation of a snapshot or asset across local browser readers.
import { createHash } from 'node:crypto'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const compress = promisify(gzip)

export function httpRepresentation(body, { compressible = true, etag = false } = {}) {
  const plain = Buffer.isBuffer(body) ? body : Buffer.from(body)
  return {
    plain,
    compressible: compressible && plain.length >= 1024,
    etag: etag ? `W/"${createHash('sha256').update(plain).digest('base64url')}"` : null,
    gzip: null,
  }
}

function acceptsGzip(header = '') {
  const weights = new Map(String(header).toLowerCase().split(',').map(value => {
    const [name, ...parameters] = value.trim().split(';')
    const weight = parameters.find(value => value.trim().startsWith('q='))
    return [name, weight === undefined ? 1 : Number(weight.trim().slice(2))]
  }))
  return (weights.get('gzip') ?? weights.get('*') ?? 0) > 0
}

/** Capability data keeps its no-store headers; only public static assets opt into ETag validation. */
export async function sendHttpRepresentation(req, res, headers, representation) {
  const extra = representation.etag ? { ETag: representation.etag } : {}
  if (representation.compressible) extra.Vary = 'Accept-Encoding'
  const validator = req.headers['if-none-match']
  if (representation.etag && validator && String(validator).split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === representation.etag.replace(/^W\//, ''))) {
    if (!res.destroyed) res.writeHead(304, { ...headers, ...extra }).end()
    return
  }
  let body = representation.plain
  if (representation.compressible && acceptsGzip(req.headers['accept-encoding'])) {
    // A shared promise prevents simultaneous tabs from compressing the same revision twice.
    representation.gzip ??= compress(body).catch(() => null)
    const zipped = await representation.gzip
    if (zipped && zipped.length < body.length) { body = zipped; extra['Content-Encoding'] = 'gzip' }
  }
  if (!res.destroyed) res.writeHead(200, { ...headers, ...extra, 'Content-Length': body.length }).end(req.method === 'HEAD' ? undefined : body)
}
