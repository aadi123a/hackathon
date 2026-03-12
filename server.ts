import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("vesta.db");

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    disease TEXT,
    confidence REAL,
    urgency TEXT,
    lat REAL,
    lng REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/diagnoses", (req, res) => {
    const rows = db.prepare("SELECT * FROM diagnoses ORDER BY timestamp DESC LIMIT 50").all();
    res.json(rows);
  });

  app.post("/api/diagnoses", (req, res) => {
    const { id, disease, confidence, urgency, lat, lng } = req.body;
    const stmt = db.prepare("INSERT INTO diagnoses (id, disease, confidence, urgency, lat, lng) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(id, disease, confidence, urgency, lat, lng);
    
    // If high urgency, broadcast to all clients (Sentinel Network)
    if (urgency === 'high') {
      io.emit("outbreak_alert", {
        id,
        disease,
        lat,
        lng,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true });
  });

  app.post("/api/irrigation/advice", async (req, res) => {
    const { cropType, soilMoisture, humidity, rainfallForecast, temperature } = req.body;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-latest",
        contents: `As an expert agronomist, provide irrigation advice for ${cropType}. 
        Current conditions: Soil Moisture ${soilMoisture}%, Humidity ${humidity}%, 
        Rainfall Forecast ${rainfallForecast}mm, Temperature ${temperature}°C.
        Provide:
        1. Action (Water/Skip)
        2. Timing (Specific time)
        3. Quantity (Liters per sqm)
        4. Reason (Brief explanation)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING },
              timing: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              reason: { type: Type.STRING },
              urgency: { type: Type.STRING, enum: ["low", "medium", "high"] }
            },
            required: ["action", "timing", "quantity", "reason", "urgency"]
          }
        }
      });

      const advice = JSON.parse(response.text);
      res.json(advice);
    } catch (error) {
      console.error("Irrigation Advisor Error:", error);
      res.status(500).json({ error: "Failed to generate irrigation advice" });
    }
  });

  app.get("/api/sentinel/forecast", (req, res) => {
    // Mock simulation logic for the hackathon prototype
    // In a real app, this would run the ST-GNN model
    const forecast = [
      { id: 'f1', lat: 34.0522, lng: -118.2437, risk: 0.85, direction: 'NW', speed: 15, type: 'Locust Swarm' },
      { id: 'f2', lat: 34.0622, lng: -118.2537, risk: 0.65, direction: 'N', speed: 10, type: 'Aphid Migration' },
      { id: 'f3', lat: 34.0422, lng: -118.2337, risk: 0.45, direction: 'W', speed: 5, type: 'Fall Armyworm' },
    ];
    res.json(forecast);
  });

  app.get("/api/market/forecast", (req, res) => {
    const { crop } = req.query;
    
    // In a real app, this would query a database or external market API
    // and run an LSTM model for prediction.
    const crops: Record<string, any> = {
      'Wheat': {
        currentPrice: 320,
        prediction: 345,
        recommendation: 'HOLD',
        confidence: 0.88,
        history: [
          { date: 'Jan', price: 280 },
          { date: 'Feb', price: 295 },
          { date: 'Mar', price: 310 },
          { date: 'Apr', price: 320 },
          { date: 'May', price: 335, isForecast: true },
          { date: 'Jun', price: 345, isForecast: true },
        ]
      },
      'Rice': {
        currentPrice: 450,
        prediction: 430,
        recommendation: 'SELL',
        confidence: 0.92,
        history: [
          { date: 'Jan', price: 420 },
          { date: 'Feb', price: 440 },
          { date: 'Mar', price: 460 },
          { date: 'Apr', price: 450 },
          { date: 'May', price: 440, isForecast: true },
          { date: 'Jun', price: 430, isForecast: true },
        ]
      },
      'Maize': {
        currentPrice: 210,
        prediction: 215,
        recommendation: 'HOLD',
        confidence: 0.75,
        history: [
          { date: 'Jan', price: 190 },
          { date: 'Feb', price: 200 },
          { date: 'Mar', price: 205 },
          { date: 'Apr', price: 210 },
          { date: 'May', price: 212, isForecast: true },
          { date: 'Jun', price: 215, isForecast: true },
        ]
      }
    };

    const data = crops[crop as string] || crops['Wheat'];
    res.json(data);
  });

  app.post("/api/voice/chat", async (req, res) => {
    const { message, context } = req.body;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `User Question: ${message}\n\nContext: ${JSON.stringify(context)}`,
        config: {
          systemInstruction: `You are Vesta, a multilingual AI Agronomist. 
          Respond in the same language as the user (Hindi, Marathi, or English). 
          Keep answers concise, practical, and empathetic to farmers.
          If they ask about irrigation, use the provided weather context.
          If they ask about yellow leaves, mention nitrogen deficiency or moisture stress.`,
        },
      });
      
      res.json({ text: response.text });
    } catch (error) {
      console.error("Voice Assistant Error:", error);
      res.status(500).json({ error: "Failed to process voice request" });
    }
  });

  app.post("/api/crop/recommend", async (req, res) => {
    const { n, p, k, ph, temp, humidity, rainfall, location } = req.body;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Recommend the best 3 crops for a farm with these parameters:
        Soil: Nitrogen=${n}, Phosphorus=${p}, Potassium=${k}, pH=${ph}
        Environment: Temp=${temp}°C, Humidity=${humidity}%, Rainfall=${rainfall}mm
        Location: ${JSON.stringify(location)}`,
        config: {
          systemInstruction: `You are an expert Agricultural Data Scientist. 
          Provide crop recommendations based on the provided soil and environmental data.
          Return the response as a JSON array of objects with the following structure:
          [
            {
              "crop": "Crop Name",
              "suitability": 0.95, (number between 0 and 1)
              "reason": "Brief explanation of why this crop is suitable",
              "requirements": {
                "n": "Ideal N range",
                "p": "Ideal P range",
                "k": "Ideal K range",
                "ph": "Ideal pH range"
              }
            }
          ]`,
          responseMimeType: "application/json"
        },
      });
      
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Crop Recommendation Error:", error);
      res.status(500).json({ error: "Failed to get crop recommendations" });
    }
  });

  app.get("/api/satellite/health", async (req, res) => {
    try {
      // In a real app, we would fetch Sentinel-2 data here.
      // For the hackathon, we simulate the analysis using Gemini.
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: "Analyze the current satellite vegetation health for a farm in Punjab, India. Return a mock SatelliteHealthData JSON object.",
        config: {
          systemInstruction: `You are a Remote Sensing Specialist. 
          Generate a realistic mock response for satellite crop health monitoring.
          The response must be a JSON object with this structure:
          {
            "meanNdvi": 0.65,
            "stressZones": [
              { "id": "zone1", "lat": 30.9010, "lng": 75.8573, "severity": "medium", "area": "North-East Sector" }
            ],
            "lastUpdate": "2026-03-12T10:00:00Z",
            "healthTrend": "declining"
          }
          Ensure the meanNdvi is between 0.3 and 0.9. 
          If healthTrend is 'declining', include at least one 'high' or 'medium' severity stress zone.`,
          responseMimeType: "application/json"
        },
      });
      
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Satellite Analysis Error:", error);
      res.status(500).json({ error: "Failed to perform satellite analysis" });
    }
  });

  // --- Multilingual AI System ---
  app.post("/api/voice/process", async (req, res) => {
    const { audio, language, location } = req.body;
    
    try {
      // 1. In a real production system, we'd use Gemini 2.5 Flash Native Audio
      // For this prototype, we simulate the multilingual reasoning
      const systemInstruction = `You are Vesta Sentinel, a distributed AI agronomist. 
      The user is speaking in ${language}. Respond in ${language}. 
      If the user asks about crop health, use your agricultural expertise.
      Keep terminology accurate for the region.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `User Query (Audio Transcribed): ${audio}`,
        config: { systemInstruction }
      });

      // 2. Simulate TTS generation
      // In production: await ai.models.generateContent({ model: 'gemini-2.5-flash-preview-tts', ... })
      
      res.json({
        text: response.text,
        language: language,
        audioUrl: null // In production, this would be the base64 audio
      });
    } catch (error) {
      console.error("Multilingual Error:", error);
      res.status(500).json({ error: "Failed to process voice" });
    }
  });

  // --- Real-Time Sentinel Network (Geo-Spatial) ---
  app.post("/api/sentinel/report", (req, res) => {
    const { disease, location, severity } = req.body;
    
    // 1. Log the report
    const reportId = `rep-${Date.now()}`;
    
    // 2. Geo-spatial filtering (Simulated)
    // In production, we'd use PostGIS: ST_DWithin(location, report_location, 20000)
    const alert = {
      id: reportId,
      title: `🚨 Outbreak Alert: ${disease}`,
      description: `A ${severity} severity outbreak of ${disease} detected within 20km of your location.`,
      severity: severity === 'high' ? 'critical' : 'warning',
      location: location,
      timestamp: new Date().toISOString()
    };

    // 3. Broadcast to nearby farmers via Socket.io
    // In production, we'd join farmers to "geo-rooms" or filter by coordinates
    io.emit("outbreak_alert", alert);

    res.json({ success: true, reportId });
  });

  app.post("/api/iot/sensor-data", (req, res) => {
    const { moisture, temperature, humidity, farmId } = req.body;
    
    const sensorData = {
      moisture,
      temperature,
      humidity,
      farmId,
      timestamp: new Date().toISOString()
    };

    // Broadcast live data to all connected clients
    io.emit("live_sensor_data", sensorData);

    // Trigger Weather Shield alerts if moisture is critical
    if (moisture < 25) {
      io.emit("weather_alert", {
        id: `iot-${Date.now()}`,
        title: "Critical Soil Moisture",
        description: `Farm ${farmId}: Soil moisture dropped to ${moisture}%. Immediate irrigation required.`,
        severity: "high"
      });
    }

    res.json({ success: true });
  });

  app.post("/api/yield/predict", async (req, res) => {
    try {
      const { cropType, soil, weather, fertilizer, pestIncidents } = req.body;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Predict crop yield for ${cropType} based on:
        Soil: ${JSON.stringify(soil)}
        Weather: ${JSON.stringify(weather)}
        Fertilizer: ${fertilizer}
        Pest Incidents: ${JSON.stringify(pestIncidents)}`,
        config: {
          systemInstruction: `You are an Agricultural Data Scientist. 
          Predict the crop yield (tons/hectare) using a simulated Random Forest Regressor logic.
          Return a JSON object of type YieldPrediction:
          {
            "estimatedYield": 4.2,
            "confidenceInterval": [3.8, 4.5],
            "factors": [
              { "name": "Soil Nitrogen", "impact": 0.8, "description": "Optimal N levels driving vegetative growth." },
              { "name": "Pest Pressure", "impact": -0.3, "description": "Minor yield loss due to localized aphid activity." }
            ],
            "insights": [
              "Yield is expected to be 12% above regional average.",
              "Consider top-dressing with Urea in 10 days to maintain potential."
            ],
            "historicalComparison": 15
          }`,
          responseMimeType: "application/json"
        },
      });
      
      res.json(JSON.parse(response.text));
    } catch (error) {
      console.error("Yield Prediction Error:", error);
      res.status(500).json({ error: "Failed to predict yield" });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Vesta Sentinel Server running on http://localhost:${PORT}`);
  });
}

startServer();
