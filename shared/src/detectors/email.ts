import { DataType, Detection } from '../types';

export function detectEmail(text: string): Detection[] {
  const detections: Detection[] = [];
  // Standard email regex
  const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    detections.push({
      type: DataType.EMAIL,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
    });
  }
  return detections;
}
