import { randomPrivateKey, publicKeyOf } from "./signing.js";
import { toHex } from "./hex.js";
const priv = randomPrivateKey();
console.log("INVIGIL_SIGNING_KEY=" + toHex(priv).slice(2));
console.log("public key:", toHex(publicKeyOf(priv)));
