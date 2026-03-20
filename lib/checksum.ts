/**
 * CRC-8 checksum utilities for frame integrity validation
 */

const CRC8_POLYNOMIAL = 0x07; // CRC-8-ATM/HEC polynomial

/**
 * Computes CRC-8 checksum for the given data
 * @param data Input data to compute checksum for
 * @returns CRC-8 checksum value (0-255)
 */
export function computeCrc8(data: Uint8Array): number {
  let crc = 0;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = (crc << 1) ^ CRC8_POLYNOMIAL;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFF;
    }
  }
  
  return crc;
}

/**
 * Verifies CRC-8 checksum of data
 * @param data Data including the checksum as the last byte
 * @returns true if checksum is valid, false otherwise
 */
export function verifyCrc8(data: Uint8Array): boolean {
  if (data.length < 2) {
    return false;
  }
  
  const payload = data.slice(0, -1);
  const providedChecksum = data[data.length - 1];
  const computedChecksum = computeCrc8(payload);
  
  return providedChecksum === computedChecksum;
}