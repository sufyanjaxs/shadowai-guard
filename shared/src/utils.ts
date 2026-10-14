// Pure mathematical validation functions.

export function luhnCheck(num: string): boolean {
  let sum = 0;
  let isAlternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num.charAt(i), 10);
    if (isAlternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    isAlternate = !isAlternate;
  }
  return sum % 10 === 0;
}

export function ibanMod97(iban: string): boolean {
  // Move first 4 chars to the end
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // Convert letters to numbers (A=10, B=11, etc.)
  let numericString = '';
  for (const char of rearranged.toUpperCase()) {
    if (char >= 'A' && char <= 'Z') {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }
  // Mod 97 using BigInt to handle large numbers
  const num = BigInt(numericString);
  return num % 97n === 1n;
}

export function shannonEntropy(str: string): number {
  if (!str) return 0;
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
