import { DataType, Detection } from '../types';
import { luhnCheck } from '../utils';

export function detectCreditCard(text: string): Detection[] {
  const detections: Detection[] = [];
  // Match 13-19 digits, allowing spaces or dashes between them
  const regex = /\b(?:\d[ -]?){12,18}\d\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    
    // Strict length check and Luhn validation to prevent false positives
    if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && luhnCheck(digitsOnly)) {
      detections.push({
        type: DataType.CREDIT_CARD,
        start: match.index,
        end: match.index + raw.length,
        confidence: 'high',
      });
    }
  }
  return detections;
}
