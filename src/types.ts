/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WeatherData {
  temp: number;
  humidity: number;
  condition: string;
  forecast: { day: string; temp: number }[];
}

export interface MarketData {
  crop: string;
  currentPrice: number;
  trend: 'up' | 'down' | 'stable';
  prediction: number;
  history: { date: string; price: number }[];
}

export interface DiagnosisResult {
  disease: string;
  confidence: number;
  treatment: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface CropRecommendation {
  crop: string;
  suitability: number;
  reason: string;
  requirements: {
    n: string;
    p: string;
    k: string;
    ph: string;
  };
}

export interface SatelliteHealthData {
  meanNdvi: number;
  stressZones: {
    id: string;
    lat: number;
    lng: number;
    severity: 'low' | 'medium' | 'high';
    area: string;
  }[];
  lastUpdate: string;
  healthTrend: 'improving' | 'declining' | 'stable';
}

export interface IoTSensorData {
  moisture: number;
  temperature: number;
  humidity: number;
  timestamp: string;
  farmId: string;
}

export interface YieldPrediction {
  estimatedYield: number; // in tons per hectare
  confidenceInterval: [number, number];
  factors: {
    name: string;
    impact: number; // -1 to 1
    description: string;
  }[];
  insights: string[];
  historicalComparison: number; // percentage change
}

export const CROP_TYPES = ['Wheat', 'Rice', 'Maize', 'Soybean', 'Cotton'];
