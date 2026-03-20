/**
 * Lightweight XOR-based encryption support for payload privacy
 */

/**
 * XOR encrypt data with a shared key
 * @param data Data to encrypt
 * @param key Encryption key (will be repeated if shorter than data)
 * @returns Encrypted data
 */
export function xorEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length === 0) {
    throw new Error('Encryption key cannot be empty');
  }

  const encrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ key[i % key.length];
  }
  
  return encrypted;
}

/**
 * XOR decrypt data with a shared key
 * @param encryptedData Encrypted data to decrypt
 * @param key Decryption key (will be repeated if shorter than data)
 * @returns Decrypted data
 */
export function xorDecrypt(encryptedData: Uint8Array, key: Uint8Array): Uint8Array {
  // XOR encryption is symmetric, so decryption is the same as encryption
  return xorEncrypt(encryptedData, key);
}