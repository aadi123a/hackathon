export interface MultilingualResponse {
  originalText: string;
  translatedText: string;
  language: string;
  audioData?: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface FarmerProfile {
  id: string;
  name: string;
  language: 'en' | 'hi' | 'mr' | 'pa' | 'te';
  location: GeoLocation;
}
