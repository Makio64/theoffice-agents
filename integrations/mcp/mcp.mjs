#!/usr/bin/env node
// MCP stdio: one JSON-RPC message per line; stdout is protocol-only.
import { createOfficeMcp } from './mcp-server.mjs'
const server = createOfficeMcp()
let buffered = ''
let pending = Promise.resolve()
const write = value => process.stdout.write(JSON.stringify(value) + '\n')
function accept(line) {
  let message
  try { message = JSON.parse(line) } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });return }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || Array.isArray(message)) {
    write({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } });return
  }
  // Initialized, cancelled, and progress notifications do not require replies.
  if (message.id === undefined) return
  pending = pending.then(async () => {
    try { write({ jsonrpc: '2.0', id: message.id, result: await server.request(message.method, message.params) }) }
    catch (error) { write({ jsonrpc: '2.0', id: message.id, error: { code: error.code ?? -32603, message: error.code ? error.message : 'The Office request failed' } }) }
  })
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffered += chunk
  if (buffered.length > 1024 * 1024) { process.stderr.write('The Office MCP request exceeds 1 MiB\n');process.stdin.destroy();void server.close();return }
  let end
  while ((end = buffered.indexOf('\n')) !== -1) { const line = buffered.slice(0, end);buffered = buffered.slice(end + 1);if (line.trim()) accept(line) }
})
let stopping = false
async function stop() { if (stopping) return;stopping = true;await pending;await server.close() }
process.stdin.once('end', stop)
process.once('SIGTERM', () => { process.stdin.destroy();void stop() })
process.once('SIGINT', () => { process.stdin.destroy();void stop() })
