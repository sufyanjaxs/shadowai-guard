import { DataType, Detection } from '../types';

export function detectEmiratesId(text: string): Detection[] {
  const detections: Detection[] = [];
  // Strict format: 784-YYYY-NNNNNNN-C or 784YYYYNNNNNNNC
  const regex = /\b784[-]?\d{4}[-]?\d{7}[-]?\d\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    detections.push({
      type: DataType.EMIRATES_ID,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
    });
  }
  return detections;
}
