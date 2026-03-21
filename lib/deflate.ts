/**
 * Deflate compression using the browser's built-in CompressionStream API.
 *
 * Falls back to no-op passthrough if CompressionStream is unavailable
 * (e.g., in Node.js test environment).
 */

const hasCompressionStream = typeof CompressionStream !== 'undefined';

/** Compress data using DEFLATE-raw. */
export async function deflateCompress(data: Uint8Array): Promise<Uint8Array> {
  if (!hasCompressionStream) return data;

  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  return collectStream(cs.readable);
}

/** Decompress DEFLATE-raw compressed data. */
export async function deflateDecompress(data: Uint8Array): Promise<Uint8Array> {
  if (!hasCompressionStream) return data;

  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();

  return collectStream(ds.readable);
}

/** Whether compression is available in this environment. */
export function isCompressionAvailable(): boolean {
  return hasCompressionStream;
}

/** Collect a ReadableStream<Uint8Array> into a single Uint8Array. */
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
