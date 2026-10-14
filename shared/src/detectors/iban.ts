import { DataType, Detection } from '../types';
import { ibanMod97 } from '../utils';

export function detectIBAN(text: string): Detection[] {
  const detections: Detection[] = [];
  // 2 letters, 2 digits, up to 30 alphanumeric chars (allowing spaces)
  const regex = /\b[A-Z]{2}[ -]?[0-9]{2}(?:[ -]?[A-Z0-9]){2,28}\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const cleanIban = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    if (ibanMod97(cleanIban)) {
      detections.push({
        type: DataType.IBAN,
        start: match.index,
        end: match.index + raw.length,
        confidence: 'high',
      });
    }
  }
  return detections;
}
