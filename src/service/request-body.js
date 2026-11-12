// A request's body as the service reads it, in either role: up to `limit` bytes, or null when it is
// longer, the rest left unread.

export function bodyOf(incoming, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    incoming.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        incoming.removeAllListeners('data');
        incoming.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    incoming.on('end', () => resolve(Buffer.concat(chunks)));
    incoming.on('error', reject);
  });
}
