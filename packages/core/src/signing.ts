/** Ed25519 receipt signing. Sync noble v2 setup. */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  return ed.getPublicKey(privateKey);
}
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed.sign(message, privateKey);
}
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
export function randomPrivateKey(): Uint8Array {
  return ed.utils.randomPrivateKey();
}
