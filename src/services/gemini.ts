/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const getGeminiModel = (modelName: string = "gemini-3-flash-preview") => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const ai = new GoogleGenAI({ apiKey });
  return ai;
};

export async function diagnoseCrop(imageBase64: string) {
  const ai = getGeminiModel();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: "Analyze this crop image for diseases or pests. Provide a JSON response with: disease name, confidence score (0-1), treatment plan, and urgency level (low, medium, high)." },
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });
  
  return JSON.parse(response.text || "{}");
}

export async function getAgronomistAdvice(query: string, context: any) {
  const ai = getGeminiModel();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are Vesta, an expert AI Agronomist. 
    Context: ${JSON.stringify(context)}
    User Query: ${query}
    Provide actionable, scientific, and practical advice for a farmer.`,
  });
  
  return response.text;
}
