// One colour per person, derived, never negotiated: the device id hashes to
// a hue, so every browser paints the same person the same colour with
// nothing to sync. Saturation and lightness are fixed to sit on the dark
// theme; two ids can collide on a hue, as two people can both wear purple.
export function colorOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${String(h % 360)}, 62%, 66%)`;
}
