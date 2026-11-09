import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = {N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024};
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve,reject) => {
    scrypt(password,salt,64,options,(error,digest) => error ? reject(error) : resolve(digest));
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = await derive(password, salt);
  return salt + ':' + digest.toString('hex');
}
export async function verifyPassword(password: string, stored: string | undefined) {
  const [salt, hex] = (stored ?? '0'.repeat(32) + ':' + '0'.repeat(128)).split(':');
  const digest = await derive(password, salt);
  const expected = Buffer.from(hex ?? '', 'hex');
  return digest.length === expected.length && timingSafeEqual(digest, expected) && stored !== undefined;
}
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
