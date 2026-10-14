import { DataType, Detection } from '../types';

export function detectPassword(text: string): Detection[] {
  const detections: Detection[] = [];
  // Match patterns like "password: xyz", "pwd=xyz", "pass: xyz"
  const regex = /\b(password|pwd|pass)\s*[:=]\s*([^\s,;]+)/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // We want to highlight the whole match, including the value
    detections.push({
      type: DataType.PASSWORD,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
    });
  }
  return detections;
}
