import { DataType, Detection } from '../types';

export function detectPhone(text: string): Detection[] {
  const detections: Detection[] = [];
  // General international E.164 format (covers UAE +971 as well).
  // The previous pattern allowed a 2-character match ("+9"), so a single "+" followed
  // by any digit was reported as a phone number. Require 7-15 digits in total.
  const regex = /\+[1-9]\d{6,14}(?!\d)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    detections.push({
      type: DataType.PHONE,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'medium', // Phone numbers can sometimes be false positives in text
    });
  }
  return detections;
}
