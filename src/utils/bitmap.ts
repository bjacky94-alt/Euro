import { TOTAL_COMBINATIONS } from '../types'

const POPCOUNT_8BIT = Array.from({ length: 256 }, (_, value) => {
  let bits = 0
  let n = value
  while (n > 0) {
    bits += n & 1
    n >>= 1
  }
  return bits
})

export const createBitmap = (): Uint8Array => {
  const bytes = Math.ceil(TOTAL_COMBINATIONS / 8)
  const bitmap = new Uint8Array(bytes)
  bitmap.fill(0xff)

  const remainingBits = TOTAL_COMBINATIONS % 8
  if (remainingBits !== 0) {
    const mask = (1 << remainingBits) - 1
    bitmap[bytes - 1] = mask
  }

  return bitmap
}

export const isBitSet = (bitmap: Uint8Array, bitIndex: number): boolean => {
  const byteIndex = bitIndex >> 3
  const bitOffset = bitIndex & 7
  return (bitmap[byteIndex] & (1 << bitOffset)) !== 0
}

export const clearBit = (bitmap: Uint8Array, bitIndex: number): boolean => {
  const byteIndex = bitIndex >> 3
  const bitOffset = bitIndex & 7
  const mask = 1 << bitOffset
  if ((bitmap[byteIndex] & mask) === 0) {
    return false
  }
  bitmap[byteIndex] &= ~mask
  return true
}

export const countActiveBits = (bitmap: Uint8Array): number => {
  let count = 0
  for (let i = 0; i < bitmap.length; i += 1) {
    count += POPCOUNT_8BIT[bitmap[i]]
  }
  return count
}
