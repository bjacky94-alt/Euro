const MAX_N = 50
const MAX_K = 5

const choose: number[][] = Array.from({ length: MAX_N + 1 }, () =>
  Array(MAX_K + 1).fill(0),
)

for (let n = 0; n <= MAX_N; n += 1) {
  choose[n][0] = 1
  for (let k = 1; k <= Math.min(n, MAX_K); k += 1) {
    if (k === n) {
      choose[n][k] = 1
    } else {
      choose[n][k] = choose[n - 1][k - 1] + choose[n - 1][k]
    }
  }
}

export const chooseN = (n: number, k: number): number => {
  if (k < 0 || k > n) {
    return 0
  }
  if (n <= MAX_N && k <= MAX_K) {
    return choose[n][k]
  }

  let result = 1
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - (k - i))) / i
  }
  return Math.round(result)
}

export const rankCombination = (
  sortedCombination: readonly number[],
  n: number,
  k: number,
): number => {
  let rank = 0
  let previous = 0

  for (let i = 0; i < k; i += 1) {
    const current = sortedCombination[i]
    for (let value = previous + 1; value < current; value += 1) {
      rank += chooseN(n - value, k - i - 1)
    }
    previous = current
  }

  return rank
}

export const forEachCombination = (
  n: number,
  k: number,
  callback: (combination: number[], index: number) => void,
): void => {
  const comb = Array.from({ length: k }, (_, i) => i + 1)
  let index = 0

  while (true) {
    callback([...comb], index)
    index += 1

    let i = k - 1
    while (i >= 0 && comb[i] === n - k + i + 1) {
      i -= 1
    }
    if (i < 0) {
      break
    }

    comb[i] += 1
    for (let j = i + 1; j < k; j += 1) {
      comb[j] = comb[j - 1] + 1
    }
  }
}

export const createTriplets = (
  numbers: readonly [number, number, number, number, number],
): [number, number, number][] => {
  const triplets: [number, number, number][] = []
  for (let i = 0; i < numbers.length - 2; i += 1) {
    for (let j = i + 1; j < numbers.length - 1; j += 1) {
      for (let k = j + 1; k < numbers.length; k += 1) {
        triplets.push([numbers[i], numbers[j], numbers[k]])
      }
    }
  }
  return triplets
}

export const countMatchingNumbers = (
  comboNumbers: readonly number[],
  drawNumbersSet: ReadonlySet<number>,
): number => {
  let matches = 0
  for (const value of comboNumbers) {
    if (drawNumbersSet.has(value)) {
      matches += 1
    }
  }
  return matches
}
