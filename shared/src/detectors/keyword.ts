import { DataType, Detection, ScanConfig } from '../types';

export function detectCustomKeywords(text: string, config: ScanConfig): Detection[] {
  const detections: Detection[] = [];
  if (!config.customKeywords || config.customKeywords.length === 0) return detections;

  for (const keyword of config.customKeywords) {
    if (!keyword.trim()) continue;
    
    // Escape regex special characters in the keyword
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      detections.push({
        type: DataType.CUSTOM_KEYWORD,
        start: match.index,
        end: match.index + match[0].length,
        confidence: 'high',
      });
    }
  }
  return detections;
}
