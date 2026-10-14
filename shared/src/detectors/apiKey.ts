import { DataType, Detection } from '../types';
import { shannonEntropy } from '../utils';

export function detectApiKey(text: string): Detection[] {
  const detections: Detection[] = [];
  
  // 1. Known prefixes
  // NOTE: sk- keys may contain "-" and "_" (e.g. sk-proj-...). The private-key block is
  // matched without \b because it starts/ends with "-" (a non-word character).
  const prefixRegex = /\b(?:sk-[a-zA-Z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|xoxb-[0-9a-zA-Z-]+)|-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g;
  let match;
  while ((match = prefixRegex.exec(text)) !== null) {
    detections.push({
      type: DataType.API_KEY,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
    });
  }

  // 2. High entropy strings (potential generic secrets)
  // Look for long continuous strings without spaces that have high entropy
  const entropyRegex = /\b[a-zA-Z0-9_\-]{32,}\b/g;
  while ((match = entropyRegex.exec(text)) !== null) {
    const str = match[0];
    // Only flag if it's truly random-looking (high entropy) and not just a long word
    if (shannonEntropy(str) > 4.5 && !/^[a-zA-Z]+$/.test(str)) {
      detections.push({
        type: DataType.API_KEY,
        start: match.index,
        end: match.index + str.length,
        confidence: 'medium',
      });
    }
  }

  return detections;
}
