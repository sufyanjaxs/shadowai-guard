import { Detection, ScanConfig } from './types';
import { detectCreditCard } from './detectors/creditCard';
import { detectEmiratesId } from './detectors/emiratesId';
import { detectIBAN } from './detectors/iban';
import { detectEmail } from './detectors/email';
import { detectPhone } from './detectors/phone';
import { detectApiKey } from './detectors/apiKey';
import { detectPassword } from './detectors/password';
import { detectCustomKeywords } from './detectors/keyword';

export function scanText(text: string, config: ScanConfig = {}): Detection[] {
  if (!text) return [];

  // Run all detectors
  const allDetections: Detection[] = [
    ...detectCreditCard(text),
    ...detectEmiratesId(text),
    ...detectIBAN(text),
    ...detectEmail(text),
    ...detectPhone(text),
    ...detectApiKey(text),
    ...detectPassword(text),
    ...detectCustomKeywords(text, config),
  ];

  // Sort by start index. If start is the same, sort by length (longest first).
  allDetections.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Remove overlapping detections (keep the first/longest one)
  const filtered: Detection[] = [];
  let lastEnd = -1;
  
  for (const det of allDetections) {
    if (det.start >= lastEnd) {
      filtered.push(det);
      lastEnd = det.end;
    }
  }

  return filtered;
}
