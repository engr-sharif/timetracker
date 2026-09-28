const enc = new TextEncoder()

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

/** PBKDF2-SHA256, 310k iterations (OWASP guidance). */
export async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: 310_000, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(bits)
}

/** Unsalted SHA-256 used by the v3 app — only for verifying legacy logins once. */
export async function legacySha256(password: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(password)))
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
