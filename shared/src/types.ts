// The types of sensitive data we can detect.
export enum DataType {
  CREDIT_CARD = 'CREDIT_CARD',
  EMIRATES_ID = 'EMIRATES_ID',
  IBAN = 'IBAN',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  API_KEY = 'API_KEY',
  PASSWORD = 'PASSWORD',
  CUSTOM_KEYWORD = 'CUSTOM_KEYWORD',
}

// The structure returned by every detector.
export interface Detection {
  type: DataType;
  start: number;
  end: number;
  confidence: 'high' | 'medium' | 'low';
  matchedText?: string; // Used only in tests, stripped in production if needed
}

// Configuration passed to the scanner (e.g., from the admin dashboard).
export interface ScanConfig {
  customKeywords?: string[];
}
