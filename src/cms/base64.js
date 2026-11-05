// Bytes as base64, in parts, since a whole original would not fit as a call's arguments.
export function base64(bytes) {
  const parts = [];
  for (let at = 0; at < bytes.length; at += 32_768) parts.push(String.fromCharCode(...bytes.subarray(at, at + 32_768)));
  return btoa(parts.join(''));
}
