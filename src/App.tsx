/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Camera, 
  TrendingUp, 
  CloudSun, 
  Droplets, 
  Thermometer, 
  Leaf, 
  AlertTriangle,
  ChevronRight,
  Send,
  Loader2,
  MapPin,
  Menu,
  X,
  Mic,
  Volume2,
  MessageSquare,
  Sparkles,
  FlaskConical,
  Sprout,
  Satellite,
  Activity,
  Eye,
  Globe
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { GoogleGenAI, Modality } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io, Socket } from 'socket.io-client';

import { diagnoseCrop, getAgronomistAdvice } from './services/gemini';
import { MarketData, WeatherData, DiagnosisResult, CROP_TYPES, CropRecommendation, SatelliteHealthData, YieldPrediction, IoTSensorData } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Mock Data ---
const MOCK_MARKET_DATA: MarketData[] = [
  {
    crop: 'Wheat',
    currentPrice: 245.50,
    trend: 'up',
    prediction: 260.00,
    history: [
      { date: 'Jan', price: 210 },
      { date: 'Feb', price: 230 },
      { date: 'Mar', price: 245 },
    ]
  },
  {
    crop: 'Rice',
    currentPrice: 310.20,
    trend: 'stable',
    prediction: 312.00,
    history: [
      { date: 'Jan', price: 305 },
      { date: 'Feb', price: 308 },
      { date: 'Mar', price: 310 },
    ]
  }
];

const MOCK_WEATHER: WeatherData = {
  temp: 28,
  humidity: 65,
  condition: 'Partly Cloudy',
  forecast: [
    { day: 'Mon', temp: 27 },
    { day: 'Tue', temp: 29 },
    { day: 'Wed', temp: 30 },
    { day: 'Thu', temp: 26 },
  ]
};

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
      active 
        ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20" 
        : "text-stone-500 hover:bg-stone-100"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ icon: Icon, label, value, unit, color }: { icon: any, label: string, value: string | number, unit: string, color: string }) => (
  <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
    <div className={cn("p-3 rounded-xl", color)}>
      <Icon size={24} className="text-white" />
    </div>
    <div>
      <p className="text-stone-500 text-sm font-medium">{label}</p>
      <h3 className="text-2xl font-bold">{value}<span className="text-sm font-normal text-stone-400 ml-1">{unit}</span></h3>
    </div>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'vision' | 'market' | 'chat' | 'sentinel' | 'yield' | 'weather' | 'wizard'>('overview');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'hi' | 'mr' | 'pa' | 'te'>('en');

  const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'हिन्दी (Hindi)' },
    { code: 'mr', name: 'मराठी (Marathi)' },
    { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
    { code: 'te', name: 'తెలుగు (Telugu)' },
  ];
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState<string>('All');
  const socketRef = useRef<Socket | null>(null);
  const [sentinelAlerts, setSentinelAlerts] = useState<any[]>([]);
  const [weatherAlerts, setWeatherAlerts] = useState<{ id: string, title: string, description: string, severity: 'low' | 'medium' | 'high' }[]>([
    { id: '1', title: 'Low Moisture Warning', description: 'Soil moisture levels in Sector B are below 30%. Irrigation recommended.', severity: 'high' },
    { id: '2', title: 'Heat Wave Forecast', description: 'Temperatures expected to exceed 35°C for the next 3 days.', severity: 'medium' },
    { id: '3', title: 'Ideal Spraying Window', description: 'Low wind speeds predicted for tomorrow morning.', severity: 'low' }
  ]);
  const [irrigationAdvice, setIrrigationAdvice] = useState<{ action: string, timing: string, quantity: number, reason: string, urgency: string } | null>(null);
  const [isLoadingIrrigation, setIsLoadingIrrigation] = useState(false);
  const [pestForecast, setPestForecast] = useState<{ id: string, lat: number, lng: number, risk: number, direction: string, speed: number, type: string }[]>([]);
  const [isLoadingPestForecast, setIsLoadingPestForecast] = useState(false);
  const [marketForecast, setMarketForecast] = useState<{ currentPrice: number, prediction: number, recommendation: string, confidence: number, history: any[] } | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  
  // Voice Assistant State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Crop Wizard State
  const [soilParams, setSoilParams] = useState({ n: 90, p: 42, k: 43, ph: 6.5 });
  const [cropRecommendations, setCropRecommendations] = useState<CropRecommendation[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);

  // Yield Oracle State
  const [yieldPrediction, setYieldPrediction] = useState<YieldPrediction | null>(null);
  const [isYieldLoading, setIsYieldLoading] = useState(false);

  // Satellite State
  const [satelliteData, setSatelliteData] = useState<SatelliteHealthData | null>(null);
  const [isSatelliteLoading, setIsSatelliteLoading] = useState(false);
  const [sentinelMode, setSentinelMode] = useState<'pest' | 'satellite'>('pest');

  // Vision State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Chat State
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: "Hello! I'm Vesta, your AI Agronomist. How can I help you with your crops today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // IoT Sensor State
  const [liveSensorData, setLiveSensorData] = useState<IoTSensorData | null>(null);

  // --- Handlers ---

  useEffect(() => {
    // Initialize Socket
    socketRef.current = io();
    
    socketRef.current.on('outbreak_alert', (alert) => {
      setSentinelAlerts(prev => [alert, ...prev].slice(0, 5));
    });

    socketRef.current.on('live_sensor_data', (data: IoTSensorData) => {
      setLiveSensorData(data);
    });

    socketRef.current.on('weather_alert', (alert) => {
      setWeatherAlerts(prev => [alert, ...prev].slice(0, 5));
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'weather' && !irrigationAdvice) {
      fetchIrrigationAdvice();
    }
    if (activeTab === 'sentinel' && pestForecast.length === 0) {
      fetchPestForecast();
    }
    if (activeTab === 'market') {
      fetchMarketForecast();
    }
    if (activeTab === 'yield' && !yieldPrediction) {
      fetchYieldPrediction();
    }
  }, [activeTab, selectedCrop]);

  const fetchYieldPrediction = async () => {
    setIsYieldLoading(true);
    try {
      const response = await fetch('/api/yield/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropType: selectedCrop === 'All' ? 'Wheat' : selectedCrop,
          soil: soilParams,
          weather: MOCK_WEATHER,
          fertilizer: 'NPK 10-26-26',
          pestIncidents: sentinelAlerts
        })
      });
      const data = await response.json();
      setYieldPrediction(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsYieldLoading(false);
    }
  };

  const simulateIoTSensor = async () => {
    const mockData = {
      moisture: Math.floor(Math.random() * 60) + 10, // 10% to 70%
      temperature: Math.floor(Math.random() * 15) + 20, // 20C to 35C
      humidity: Math.floor(Math.random() * 40) + 40, // 40% to 80%
      farmId: "VESTA-001"
    };

    try {
      await fetch('/api/iot/sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockData)
      });
    } catch (error) {
      console.error("IoT Simulation Error:", error);
    }
  };

  const fetchMarketForecast = async () => {
    setIsLoadingMarket(true);
    try {
      const crop = selectedCrop === 'All' ? 'Wheat' : selectedCrop;
      const response = await fetch(`/api/market/forecast?crop=${crop}`);
      const data = await response.json();
      setMarketForecast(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingMarket(false);
    }
  };

  const fetchPestForecast = async () => {
    setIsLoadingPestForecast(true);
    try {
      const response = await fetch('/api/sentinel/forecast');
      const data = await response.json();
      setPestForecast(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingPestForecast(false);
    }
  };

  const fetchIrrigationAdvice = async () => {
    setIsLoadingIrrigation(true);
    try {
      const response = await fetch('/api/irrigation/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropType: 'Wheat',
          soilMoisture: 28,
          humidity: 65,
          rainfallForecast: 15,
          temperature: 28
        })
      });
      const data = await response.json();
      setIrrigationAdvice(data);
      
      // If high urgency, add to alerts
      if (data.urgency === 'high') {
        setWeatherAlerts(prev => [
          { 
            id: Math.random().toString(), 
            title: `Critical Irrigation: ${data.action}`, 
            description: data.reason, 
            severity: 'high' 
          },
          ...prev
        ]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingIrrigation(false);
    }
  };

  const dismissWeatherAlert = (id: string) => {
    setWeatherAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  // Voice Assistant Logic
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition not supported in this browser.');
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // Default, will detect Hindi/Marathi via Gemini

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('');
      setVoiceResponse('');
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');
      setVoiceTranscript(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Use a ref or state that is updated immediately
      // Since onresult updates state, we might need to use the latest transcript
    };

    recognition.start();
  };

  // Effect to handle end of listening and trigger processing
  useEffect(() => {
    if (!isListening && voiceTranscript && isVoiceActive && !voiceResponse && !isProcessingVoice) {
      processVoiceRequest(voiceTranscript);
    }
  }, [isListening, voiceTranscript, isVoiceActive]);

  const processVoiceRequest = async (message: string) => {
    setIsProcessingVoice(true);
    try {
      const response = await fetch('/api/voice/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audio: message, // In production, this would be the actual audio blob
          language: selectedLanguage,
          location: { lat: 30.9010, lng: 75.8573 }
        })
      });
      const data = await response.json();
      setVoiceResponse(data.text);
      speakResponse(data.text);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const speakResponse = async (text: string) => {
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        audio.onended = () => setIsSpeaking(false);
        audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
    }
  };

  const getRecommendations = async () => {
    setIsRecommending(true);
    try {
      const response = await fetch('/api/crop/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...soilParams,
          temp: MOCK_WEATHER.temp,
          humidity: MOCK_WEATHER.humidity,
          rainfall: 100, // Mock rainfall
          location: { lat: 28.6139, lng: 77.2090 } // Mock Delhi
        })
      });
      const data = await response.json();
      setCropRecommendations(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRecommending(false);
    }
  };

  const fetchSatelliteData = async () => {
    setIsSatelliteLoading(true);
    try {
      const response = await fetch('/api/satellite/health');
      const data = await response.json();
      setSatelliteData(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSatelliteLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sentinel' && sentinelMode === 'satellite' && !satelliteData) {
      fetchSatelliteData();
    }
  }, [activeTab, sentinelMode]);

  const handleCapture = async () => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    
    context.drawImage(videoRef.current, 0, 0, 400, 300);
    const base64 = canvasRef.current.toDataURL('image/jpeg').split(',')[1];
    
    setIsDiagnosing(true);
    try {
      const result = await diagnoseCrop(base64);
      setDiagnosis(result);
      
      // Persist to backend
      await fetch('/api/diagnoses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Math.random().toString(36).substr(2, 9),
          disease: result.disease,
          confidence: result.confidence,
          urgency: result.urgency,
          lat: 30.9010, // Mock lat for Punjab
          lng: 75.8573  // Mock lng for Punjab
        })
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const reportOutbreak = async () => {
    if (!diagnosis) return;
    try {
      await fetch('/api/sentinel/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disease: diagnosis.disease,
          location: { lat: 30.9010, lng: 75.8573 },
          severity: diagnosis.urgency
        })
      });
      alert("Outbreak reported to Sentinel Network. Nearby farmers will be notified.");
    } catch (error) {
      console.error(error);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError("Camera permission denied. Please enable camera access in your browser settings and refresh.");
      } else {
        setCameraError("Could not access camera. Please ensure no other app is using it.");
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'vision') {
      startCamera();
    }
  }, [activeTab]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsTyping(true);
    
    try {
      const response = await getAgronomistAdvice(userMsg, { weather: MOCK_WEATHER, market: MOCK_MARKET_DATA });
      setMessages(prev => [...prev, { role: 'ai', content: response || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: "Error connecting to Vesta Intelligence. Please check your connection." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="bg-white border-r border-stone-200 flex flex-col z-20"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white">
            <Leaf size={24} />
          </div>
          <h1 className="text-xl font-bold text-stone-900">Vesta AI</h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <SidebarItem icon={LayoutDashboard} label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={Camera} label="Vision Lab" active={activeTab === 'vision'} onClick={() => setActiveTab('vision')} />
          <SidebarItem icon={TrendingUp} label="Market Insights" active={activeTab === 'market'} onClick={() => setActiveTab('market')} />
          <SidebarItem icon={Sparkles} label="Crop Wizard" active={activeTab === 'wizard'} onClick={() => setActiveTab('wizard')} />
          <SidebarItem icon={Droplets} label="Yield Oracle" active={activeTab === 'yield'} onClick={() => setActiveTab('yield')} />
          <SidebarItem icon={CloudSun} label="Weather Shield" active={activeTab === 'weather'} onClick={() => setActiveTab('weather')} />
          <SidebarItem icon={AlertTriangle} label="Sentinel Network" active={activeTab === 'sentinel'} onClick={() => setActiveTab('sentinel')} />
          <SidebarItem icon={MessageSquare} label="AI Agronomist" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
        </nav>

        <div className="p-4 border-t border-stone-100">
          <div className="bg-stone-50 p-4 rounded-2xl">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-stone-600">All Systems Online</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-stone-100 rounded-lg text-stone-500">
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2 text-stone-500">
              <MapPin size={16} />
              <span className="text-sm font-medium">Punjab, India</span>
            </div>
            <div className="h-4 w-[1px] bg-stone-200 mx-2" />
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-stone-400" />
              <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as any)}
                className="text-sm font-medium bg-transparent border-none focus:ring-0 text-stone-600 cursor-pointer"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-100">
              <CloudSun size={18} className="text-brand-600" />
              <span className="text-sm font-bold text-brand-700">28°C</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-stone-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://picsum.photos/seed/farmer/100/100" alt="Profile" referrerPolicy="no-referrer" />
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8 max-w-6xl mx-auto"
              >
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-3xl font-bold text-stone-900">Good Morning, Adarsh</h2>
                    <p className="text-stone-500 mt-1">Here's what's happening in your fields today.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-stone-400">Last Sync</p>
                    <p className="text-sm font-bold text-stone-900">2 mins ago</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard icon={Thermometer} label="Soil Temp" value={24.5} unit="°C" color="bg-orange-500" />
                  <StatCard icon={Droplets} label="Moisture" value={42} unit="%" color="bg-blue-500" />
                  <StatCard icon={CloudSun} label="UV Index" value={6.2} unit="High" color="bg-yellow-500" />
                  <StatCard icon={Leaf} label="Crop Health" value={94} unit="%" color="bg-green-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 glass-card rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold">Soil Moisture Trends</h3>
                      <select className="bg-stone-50 border-none text-sm font-bold rounded-lg px-3 py-1">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                      </select>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[
                          { day: 'Mon', val: 40 },
                          { day: 'Tue', val: 45 },
                          { day: 'Wed', val: 42 },
                          { day: 'Thu', val: 38 },
                          { day: 'Fri', val: 41 },
                          { day: 'Sat', val: 44 },
                          { day: 'Sun', val: 42 },
                        ]}>
                          <defs>
                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Area type="monotone" dataKey="val" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card rounded-3xl p-6 flex flex-col">
                    <h3 className="text-xl font-bold mb-6">Active Alerts</h3>
                    <div className="space-y-4 flex-1">
                      <div className="flex gap-4 p-4 rounded-2xl bg-red-50 border border-red-100">
                        <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white shrink-0">
                          <AlertTriangle size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-red-900">Low Moisture Alert</p>
                          <p className="text-sm text-red-700">Sector B-4 requires immediate irrigation.</p>
                        </div>
                      </div>
                      <div className="flex gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100">
                        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white shrink-0">
                          <CloudSun size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-orange-900">Heat Wave Forecast</p>
                          <p className="text-sm text-orange-700">Expect 35°C+ on Wednesday. Adjust water cycles.</p>
                        </div>
                      </div>
                    </div>
                    <button className="w-full mt-6 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-colors">
                      View All Alerts
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'vision' && (
              <motion.div 
                key="vision"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold">Vision Diagnostics</h2>
                  <p className="text-stone-500">Point your camera at a leaf or crop to detect diseases.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="relative aspect-[4/3] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
                      {cameraError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-900">
                          <AlertTriangle size={48} className="text-red-500 mb-4" />
                          <p className="text-white font-medium mb-4">{cameraError}</p>
                          <button 
                            onClick={startCamera}
                            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-bold"
                          >
                            Retry Camera
                          </button>
                        </div>
                      ) : (
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      )}
                      <canvas ref={canvasRef} width={400} height={300} className="hidden" />
                      
                      <div className="absolute inset-0 border-2 border-white/30 pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-brand-500 rounded-full animate-pulse" />
                      </div>
                    </div>
                    <button 
                      onClick={handleCapture}
                      disabled={isDiagnosing}
                      className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand-700 transition-all disabled:opacity-50"
                    >
                      {isDiagnosing ? <Loader2 className="animate-spin" /> : <Camera />}
                      {isDiagnosing ? 'Analyzing with Gemini...' : 'Analyze Crop'}
                    </button>
                  </div>

                  <div className="space-y-6">
                    <AnimatePresence mode="wait">
                      {diagnosis ? (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="glass-card rounded-3xl p-6 space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold">Diagnosis Result</h3>
                            <span className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                              diagnosis.urgency === 'high' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                            )}>
                              {diagnosis.urgency} Urgency
                            </span>
                          </div>

                          <div className="space-y-2">
                            <p className="text-stone-400 text-sm font-bold uppercase">Detected Condition</p>
                            <p className="text-2xl font-bold text-stone-900">{diagnosis.disease}</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500" style={{ width: `${diagnosis.confidence * 100}%` }} />
                              </div>
                              <span className="text-sm font-bold text-stone-500">{Math.round(diagnosis.confidence * 100)}% Match</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-stone-400 text-sm font-bold uppercase">Treatment Plan</p>
                            <p className="text-stone-600 leading-relaxed">{diagnosis.treatment}</p>
                          </div>

                          <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100 flex gap-3">
                            <Leaf className="text-brand-600 shrink-0" />
                            <p className="text-sm text-brand-800 font-medium">Vesta AI suggests organic neem oil spray as a first step.</p>
                          </div>

                          <button 
                            onClick={reportOutbreak}
                            className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-500 transition-colors flex items-center justify-center gap-2"
                          >
                            <AlertTriangle size={16} />
                            Report to Sentinel Network
                          </button>
                        </motion.div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-stone-200 rounded-3xl">
                          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center text-stone-400 mb-4">
                            <Camera size={32} />
                          </div>
                          <p className="text-stone-500 font-medium">Capture an image to see AI analysis here.</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'wizard' && (
              <motion.div 
                key="wizard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Crop Wizard</h2>
                    <p className="text-stone-500">AI-powered crop recommendations based on your soil health.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="glass-card rounded-3xl p-8 space-y-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                        <FlaskConical size={20} />
                      </div>
                      <h3 className="text-xl font-bold">Soil Parameters</h3>
                    </div>

                    <div className="space-y-6">
                      {[
                        { label: 'Nitrogen (N)', key: 'n', min: 0, max: 140, unit: 'mg/kg' },
                        { label: 'Phosphorus (P)', key: 'p', min: 5, max: 145, unit: 'mg/kg' },
                        { label: 'Potassium (K)', key: 'k', min: 5, max: 205, unit: 'mg/kg' },
                        { label: 'Soil pH', key: 'ph', min: 3, max: 10, step: 0.1, unit: '' },
                      ].map((param) => (
                        <div key={param.key} className="space-y-2">
                          <div className="flex justify-between text-sm font-bold">
                            <label className="text-stone-600">{param.label}</label>
                            <span className="text-brand-600">{(soilParams as any)[param.key]}{param.unit}</span>
                          </div>
                          <input 
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step || 1}
                            value={(soilParams as any)[param.key]}
                            onChange={(e) => setSoilParams(prev => ({ ...prev, [param.key]: parseFloat(e.target.value) }))}
                            className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-brand-600"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                      <div className="flex items-center gap-2 mb-4">
                        <CloudSun size={18} className="text-stone-400" />
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Environmental Context</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-stone-400 font-bold">Temp</p>
                          <p className="text-lg font-bold">{MOCK_WEATHER.temp}°C</p>
                        </div>
                        <div>
                          <p className="text-xs text-stone-400 font-bold">Humidity</p>
                          <p className="text-lg font-bold">{MOCK_WEATHER.humidity}%</p>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={getRecommendations}
                      disabled={isRecommending}
                      className="w-full py-4 bg-brand-600 text-white rounded-2xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isRecommending ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                      Generate Recommendations
                    </button>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    {cropRecommendations.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {cropRecommendations.map((rec, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className="glass-card rounded-3xl p-6 border-2 border-transparent hover:border-brand-500/20 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-6">
                              <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600 group-hover:scale-110 transition-transform">
                                <Sprout size={28} />
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Suitability</div>
                                <div className="text-2xl font-bold text-brand-600">{(rec.suitability * 100).toFixed(0)}%</div>
                              </div>
                            </div>

                            <h3 className="text-2xl font-bold mb-3">{rec.crop}</h3>
                            <p className="text-stone-500 text-sm leading-relaxed mb-6">{rec.reason}</p>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-stone-50 rounded-xl">
                                <p className="text-[10px] font-bold text-stone-400 uppercase">N-P-K</p>
                                <p className="text-xs font-bold text-stone-700">{rec.requirements.n}-{rec.requirements.p}-{rec.requirements.k}</p>
                              </div>
                              <div className="p-3 bg-stone-50 rounded-xl">
                                <p className="text-[10px] font-bold text-stone-400 uppercase">pH Range</p>
                                <p className="text-xs font-bold text-stone-700">{rec.requirements.ph}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center glass-card rounded-3xl p-12 text-center space-y-4">
                        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center text-stone-300">
                          <Sparkles size={40} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-stone-700">Ready to Optimize?</h3>
                          <p className="text-stone-400 max-w-xs mx-auto">Adjust your soil parameters and tap "Generate" to see the best crops for your land.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
            {activeTab === 'market' && (
              <motion.div 
                key="market"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Market Pulse</h2>
                    <p className="text-stone-500">AI-driven price forecasting and strategic selling recommendations.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label htmlFor="crop-filter" className="text-sm font-bold text-stone-400 uppercase tracking-wider">Commodity:</label>
                      <select 
                        id="crop-filter"
                        value={selectedCrop}
                        onChange={(e) => setSelectedCrop(e.target.value)}
                        className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
                      >
                        {CROP_TYPES.map(crop => (
                          <option key={crop} value={crop}>{crop}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {isLoadingMarket ? (
                  <div className="h-[400px] flex flex-col items-center justify-center glass-card rounded-3xl">
                    <Loader2 size={48} className="animate-spin text-brand-500 mb-4" />
                    <p className="text-stone-500 font-medium">Running LSTM forecasting models...</p>
                  </div>
                ) : marketForecast && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="glass-card rounded-3xl p-8">
                        <div className="flex items-center justify-between mb-8">
                          <div>
                            <h3 className="text-xl font-bold">{selectedCrop} Price Trend</h3>
                            <p className="text-sm text-stone-400">Historical data + 3-month AI forecast</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-brand-500 rounded-full" />
                              <span className="text-xs font-bold text-stone-500">Historical</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 bg-brand-300 rounded-full border-2 border-dashed border-brand-500" />
                              <span className="text-xs font-bold text-stone-500">Forecast</span>
                            </div>
                          </div>
                        </div>

                        <div className="h-[350px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={marketForecast.history}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fill: '#94a3b8', fontSize: 12}} 
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fill: '#94a3b8', fontSize: 12}}
                                tickFormatter={(val) => `$${val}`}
                              />
                              <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number) => [`$${value}`, 'Price']}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="price" 
                                stroke="#22c55e" 
                                strokeWidth={4} 
                                dot={(props) => {
                                  const { cx, cy, payload } = props;
                                  return (
                                    <circle 
                                      cx={cx} 
                                      cy={cy} 
                                      r={payload.isForecast ? 4 : 6} 
                                      fill={payload.isForecast ? "white" : "#22c55e"} 
                                      stroke="#22c55e" 
                                      strokeWidth={2} 
                                      strokeDasharray={payload.isForecast ? "2 2" : "0"}
                                    />
                                  );
                                }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="glass-card rounded-3xl p-6 flex items-center gap-6">
                          <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-600">
                            <TrendingUp size={32} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Current Market Price</p>
                            <h4 className="text-3xl font-bold">${marketForecast.currentPrice}</h4>
                            <p className="text-xs text-stone-400 mt-1">Updated 12m ago</p>
                          </div>
                        </div>
                        <div className="glass-card rounded-3xl p-6 flex items-center gap-6">
                          <div className="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center text-brand-600">
                            <TrendingUp size={32} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Predicted Price (3M)</p>
                            <h4 className="text-3xl font-bold text-brand-600">${marketForecast.prediction}</h4>
                            <p className="text-xs text-green-600 font-bold mt-1">+{((marketForecast.prediction / marketForecast.currentPrice - 1) * 100).toFixed(1)}% Expected</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className={cn(
                        "glass-card rounded-3xl p-8 text-white relative overflow-hidden",
                        marketForecast.recommendation === 'HOLD' ? "bg-brand-900" : "bg-orange-600"
                      )}>
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                              <TrendingUp size={18} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-widest opacity-80">AI Recommendation</span>
                          </div>
                          <h3 className="text-4xl font-bold mb-4">{marketForecast.recommendation}</h3>
                          <p className="text-brand-100 leading-relaxed mb-8">
                            {marketForecast.recommendation === 'HOLD' 
                              ? `Our LSTM model predicts a price surge for ${selectedCrop} in the next 60 days. Holding your stock could increase profit margins by 12%.`
                              : `Market saturation for ${selectedCrop} is expected soon. Selling now captures the current peak before the predicted 8% decline.`
                            }
                          </p>
                          <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                            <div className="flex justify-between text-xs font-bold mb-2">
                              <span>Confidence Score</span>
                              <span>{(marketForecast.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-white" 
                                style={{ width: `${marketForecast.confidence * 100}%` }} 
                              />
                            </div>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                      </div>

                      <div className="glass-card rounded-3xl p-6">
                        <h3 className="text-lg font-bold mb-4">Market Drivers</h3>
                        <div className="space-y-4">
                          {[
                            { label: 'Global Supply', impact: 'Negative', color: 'text-red-500' },
                            { label: 'Local Demand', impact: 'Positive', color: 'text-green-500' },
                            { label: 'Weather Impact', impact: 'Neutral', color: 'text-stone-400' },
                            { label: 'Export Policy', impact: 'Positive', color: 'text-green-500' },
                          ].map((driver, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-stone-600">{driver.label}</span>
                              <span className={cn("text-xs font-bold uppercase", driver.color)}>{driver.impact}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-colors flex items-center justify-center gap-2">
                        Connect to Digital Mandi
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'sentinel' && (
              <motion.div 
                key="sentinel"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Sentinel Network</h2>
                    <p className="text-stone-500">Predictive pest migration engine and satellite crop health intelligence.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-stone-100 p-1 rounded-2xl">
                    <button 
                      onClick={() => setSentinelMode('pest')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        sentinelMode === 'pest' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                      )}
                    >
                      Pest Migration
                    </button>
                    <button 
                      onClick={() => setSentinelMode('satellite')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        sentinelMode === 'satellite' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                      )}
                    >
                      Satellite Health
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 glass-card rounded-3xl p-4 min-h-[600px] relative overflow-hidden bg-stone-900">
                    {/* Mock Map Visualization */}
                    <div className="absolute inset-0 opacity-40">
                      <div className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                      
                      {sentinelMode === 'pest' ? (
                        <AnimatePresence>
                          {pestForecast.map((f, i) => (
                            <motion.div
                              key={f.id}
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute"
                              style={{ 
                                top: `${20 + i * 25}%`, 
                                left: `${30 + i * 15}%`,
                                width: `${f.risk * 200}px`,
                                height: `${f.risk * 200}px`,
                                background: `radial-gradient(circle, ${f.risk > 0.7 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.4)'} 0%, transparent 70%)`,
                                borderRadius: '50%',
                                filter: 'blur(20px)'
                              }}
                            />
                          ))}
                        </AnimatePresence>
                      ) : (
                        <div className="absolute inset-0">
                          {/* NDVI Heatmap Overlay */}
                          <div className="w-full h-full bg-gradient-to-br from-green-900/40 via-green-500/20 to-yellow-900/40" />
                          {satelliteData?.stressZones.map((zone, i) => (
                            <motion.div
                              key={zone.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 0.6 }}
                              className="absolute"
                              style={{
                                top: `${30 + i * 20}%`,
                                left: `${40 + i * 10}%`,
                                width: '150px',
                                height: '150px',
                                background: `radial-gradient(circle, ${zone.severity === 'high' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(249, 115, 22, 0.8)'} 0%, transparent 70%)`,
                                borderRadius: '50%',
                                filter: 'blur(30px)'
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="relative z-10 h-full flex flex-col p-4">
                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                          <div className="flex items-center gap-2 mb-1">
                            {sentinelMode === 'pest' ? <TrendingUp size={16} className="text-brand-400" /> : <Satellite size={16} className="text-green-400" />}
                            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                              {sentinelMode === 'pest' ? 'Migration Engine' : 'Satellite Monitor'}
                            </p>
                          </div>
                          <p className="text-white font-bold text-lg">
                            {sentinelMode === 'pest' ? 'Predictive Spread Map' : 'NDVI Vegetation Index'}
                          </p>
                          <p className="text-stone-400 text-xs mt-1">
                            {sentinelMode === 'pest' 
                              ? 'Based on Wind (NW 12km/h) & Humidity (65%)' 
                              : `Last Scan: ${satelliteData ? new Date(satelliteData.lastUpdate).toLocaleTimeString() : 'Loading...'}`
                            }
                          </p>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10">
                            <p className="text-[10px] font-bold text-stone-500 uppercase mb-2">Legend</p>
                            <div className="space-y-2">
                              {sentinelMode === 'pest' ? (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                                    <span className="text-[10px] text-white font-bold">High Risk Spread</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full" />
                                    <span className="text-[10px] text-white font-bold">Moderate Risk</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <span className="text-[10px] text-white font-bold">Healthy (NDVI {'>'} 0.6)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                                    <span className="text-[10px] text-white font-bold">Stressed (NDVI 0.3-0.5)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                                    <span className="text-[10px] text-white font-bold">Critical Stress</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                                        <div className="flex-1 relative">
                        {sentinelMode === 'pest' ? (
                          pestForecast.map((f, i) => (
                            <motion.div
                              key={`vector-${f.id}`}
                              initial={{ opacity: 0, x: -50 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.2 }}
                              className="absolute flex items-center gap-2"
                              style={{ 
                                top: `${25 + i * 25}%`, 
                                left: `${35 + i * 15}%`,
                                transform: `rotate(${f.direction === 'NW' ? -45 : f.direction === 'N' ? -90 : 0}deg)`
                              }}
                            >
                              <div className="h-0.5 bg-brand-400/50 w-24 relative">
                                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                                  <ChevronRight size={16} className="text-brand-400" />
                                </div>
                              </div>
                              <div className="bg-black/80 px-2 py-1 rounded border border-white/10 whitespace-nowrap">
                                <p className="text-[10px] font-bold text-white">{f.type}</p>
                                <p className="text-[8px] text-stone-400">{f.speed} km/h</p>
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2 border border-green-500/30">
                              <Satellite size={24} className="text-green-500" />
                            </div>
                            <p className="text-white font-bold text-sm">Sentinel-2 Coverage</p>
                            <div className="mt-2 px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
                              <p className="text-[10px] font-bold text-green-400">Active Monitoring</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-auto p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-stone-500 uppercase">Confidence</p>
                            <p className="text-white font-bold">92%</p>
                          </div>
                          <div className="w-px h-8 bg-white/10" />
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-stone-500 uppercase">Source</p>
                            <p className="text-white font-bold">{sentinelMode === 'pest' ? 'ST-GNN v2.1' : 'Sentinel-2 L2A'}</p>
                          </div>
                        </div>
                        <button 
                          onClick={sentinelMode === 'pest' ? fetchPestForecast : fetchSatelliteData}
                          className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition-colors"
                        >
                          {isSatelliteLoading || isLoadingPestForecast ? <Loader2 size={14} className="animate-spin" /> : 'Refresh Scan'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {sentinelMode === 'pest' ? (
                      <>
                        <div className="glass-card p-6 rounded-3xl bg-stone-900 text-white">
                          <h3 className="text-lg font-bold mb-4">Risk Score Algorithm</h3>
                          <div className="space-y-4">
                            {[
                              { label: 'Wind Alignment', val: 85, color: 'bg-brand-500' },
                              { label: 'Climate Suitability', val: 62, color: 'bg-orange-500' },
                              { label: 'Host Availability', val: 94, color: 'bg-green-500' },
                            ].map((item, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-xs font-bold">
                                  <span className="text-stone-400">{item.label}</span>
                                  <span>{item.val}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.val}%` }}
                                    className={cn("h-full", item.color)}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-6 pt-6 border-t border-white/10">
                            <p className="text-xs text-stone-400 leading-relaxed">
                              The **Vesta Risk Index** combines spatial density with atmospheric dispersion models 
                              to predict spread patterns 48 hours in advance.
                            </p>
                          </div>
                        </div>

                        <h3 className="text-xl font-bold">Community Alerts</h3>
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                          {sentinelAlerts.length > 0 ? sentinelAlerts.map((alert, i) => (
                            <div key={i} className="glass-card p-4 rounded-2xl border-l-4 border-red-500">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">SENTINEL ALERT</span>
                                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">CRITICAL</span>
                              </div>
                              <h4 className="font-bold text-stone-900">{alert.disease} Detected</h4>
                              <div className="flex items-center gap-4 mt-3 text-xs text-stone-500 font-medium">
                                <div className="flex items-center gap-1">
                                  <MapPin size={12} />
                                  Nearby
                                </div>
                                <div className="flex items-center gap-1">
                                  <Loader2 size={12} />
                                  {alert.confidence}% Conf.
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="p-8 text-center glass-card rounded-2xl">
                              <p className="text-stone-500 text-sm font-medium">No active community alerts in your sector.</p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="glass-card rounded-3xl p-6 bg-stone-900 text-white">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold">Vegetation Health</h3>
                            {isSatelliteLoading && <Loader2 size={18} className="animate-spin text-stone-400" />}
                          </div>
                          
                          {satelliteData && (
                            <div className="space-y-6">
                              <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-400 border border-green-500/30">
                                  <Activity size={32} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Mean NDVI</p>
                                  <h4 className="text-3xl font-bold text-green-400">{satelliteData.meanNdvi.toFixed(2)}</h4>
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className={cn(
                                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                      satelliteData.healthTrend === 'declining' ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                                    )}>
                                      {satelliteData.healthTrend.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Detected Stress Zones</p>
                                {satelliteData.stressZones.map(zone => (
                                  <div key={zone.id} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-bold text-white">{zone.area}</span>
                                      <span className={cn(
                                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                        zone.severity === 'high' ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"
                                      )}>
                                        {zone.severity.toUpperCase()} STRESS
                                      </span>
                                    </div>
                                    <p className="text-xs text-stone-400">Early detection of chlorophyll degradation.</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="glass-card rounded-3xl p-6 bg-green-900 text-white">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                              <Eye size={20} className="text-green-400" />
                            </div>
                            <h3 className="text-lg font-bold">Remote Diagnosis</h3>
                          </div>
                          <p className="text-green-100 text-sm leading-relaxed mb-6">
                            NDVI drop detected in North-East sector. This often precedes visible wilting by 4-5 days.
                          </p>
                          <button 
                            onClick={() => setActiveTab('vision')}
                            className="w-full py-3 bg-green-600 rounded-xl font-bold text-sm hover:bg-green-500 transition-colors flex items-center justify-center gap-2"
                          >
                            <Camera size={16} />
                            Deploy Vision Lab
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'yield' && (
              <motion.div 
                key="yield"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Yield Oracle</h2>
                    <p className="text-stone-500">AI-driven harvest volume and growth stage predictions.</p>
                  </div>
                  <div className="bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
                    <span className="text-sm font-bold text-brand-700">Harvest Confidence: 92%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <div className="glass-card rounded-3xl p-8">
                      <h3 className="text-xl font-bold mb-8">Growth Stage Timeline</h3>
                      <div className="relative pt-12 pb-8 px-4">
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-stone-100 -translate-y-1/2" />
                        <div className="absolute top-1/2 left-0 w-3/4 h-1 bg-brand-500 -translate-y-1/2" />
                        
                        <div className="flex justify-between relative">
                          {[
                            { stage: 'Sowing', date: 'Oct 12', active: true },
                            { stage: 'Germination', date: 'Oct 28', active: true },
                            { stage: 'Tillering', date: 'Nov 20', active: true },
                            { stage: 'Heading', date: 'Jan 15', active: true },
                            { stage: 'Ripening', date: 'Mar 10', active: true },
                            { stage: 'Harvest', date: 'Apr 05', active: false },
                          ].map((item, i) => (
                            <div key={i} className="flex flex-col items-center">
                              <div className={cn(
                                "w-4 h-4 rounded-full border-4 border-white shadow-sm z-10",
                                item.active ? "bg-brand-500" : "bg-stone-200"
                              )} />
                              <p className={cn(
                                "mt-4 text-xs font-bold uppercase tracking-widest",
                                item.active ? "text-brand-600" : "text-stone-400"
                              )}>{item.stage}</p>
                              <p className="text-[10px] text-stone-400 font-medium">{item.date}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {yieldPrediction && (
                      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-6 bg-stone-900 rounded-3xl text-white">
                          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Estimated Yield</p>
                          <h4 className="text-4xl font-bold text-brand-400">
                            {yieldPrediction.estimatedYield.toFixed(1)} <span className="text-lg font-normal text-stone-500">tons/ha</span>
                          </h4>
                          <div className="flex items-center gap-2 mt-2">
                            <TrendingUp size={16} className="text-green-400" />
                            <p className="text-sm text-green-400 font-bold">+{yieldPrediction.historicalComparison}% vs last year</p>
                          </div>
                        </div>
                        <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100">
                          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Confidence Interval</p>
                          <h4 className="text-2xl font-bold text-stone-900">
                            {yieldPrediction.confidenceInterval[0]} - {yieldPrediction.confidenceInterval[1]} <span className="text-sm font-normal text-stone-500">t/ha</span>
                          </h4>
                          <p className="text-sm text-stone-500 font-medium mt-2">94% Prediction Confidence</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {yieldPrediction && (
                      <div className="glass-card rounded-3xl p-6">
                        <h3 className="text-xl font-bold mb-4">Yield Drivers</h3>
                        <div className="space-y-4">
                          {yieldPrediction.factors.map((factor, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-sm font-bold">
                                <span>{factor.name}</span>
                                <span className={cn(
                                  factor.impact > 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {factor.impact > 0 ? '+' : ''}{(factor.impact * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.abs(factor.impact) * 100}%` }}
                                  className={cn("h-full", factor.impact > 0 ? "bg-green-500" : "bg-red-500")}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="glass-card rounded-3xl p-6 bg-stone-900 text-white">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={20} className="text-brand-400" />
                        <h3 className="text-lg font-bold">Oracle Insights</h3>
                      </div>
                      <div className="space-y-4">
                        {yieldPrediction?.insights.map((insight, i) => (
                          <p key={i} className="text-sm text-stone-400 leading-relaxed">
                            • {insight}
                          </p>
                        )) || (
                          <p className="text-sm text-stone-400 leading-relaxed">
                            Run a scan to generate AI yield insights based on current field conditions.
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={fetchYieldPrediction}
                        disabled={isYieldLoading}
                        className="w-full mt-6 py-3 bg-brand-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                      >
                        {isYieldLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                        {isYieldLoading ? 'Analyzing...' : 'Refresh Prediction'}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'weather' && (
              <motion.div 
                key="weather"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Weather Shield</h2>
                    <p className="text-stone-500">Hyper-local climate intelligence and irrigation guidance.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={simulateIoTSensor}
                      className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-200 transition-colors flex items-center gap-2"
                    >
                      <Activity size={14} />
                      Simulate IoT
                    </button>
                    <div className="text-right">
                      <p className="text-sm font-bold text-stone-900">Partly Cloudy</p>
                      <p className="text-xs text-stone-500">Humidity: 65%</p>
                    </div>
                    <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center text-yellow-600">
                      <CloudSun size={28} />
                    </div>
                  </div>
                </div>

                {/* IoT Live Sensors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-card p-6 rounded-3xl bg-white border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <Droplets size={20} />
                      </div>
                      {liveSensorData && <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        LIVE
                      </span>}
                    </div>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Soil Moisture</p>
                    <h3 className="text-3xl font-bold text-stone-900">
                      {liveSensorData ? liveSensorData.moisture : 32}
                      <span className="text-sm font-normal text-stone-400 ml-1">%</span>
                    </h3>
                    <div className="mt-4 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${liveSensorData ? liveSensorData.moisture : 32}%` }}
                        className={cn(
                          "h-full",
                          (liveSensorData?.moisture || 32) < 25 ? "bg-red-500" : "bg-blue-500"
                        )}
                      />
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-3xl bg-white border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                        <Thermometer size={20} />
                      </div>
                      {liveSensorData && <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        LIVE
                      </span>}
                    </div>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Soil Temp</p>
                    <h3 className="text-3xl font-bold text-stone-900">
                      {liveSensorData ? liveSensorData.temperature : 24}
                      <span className="text-sm font-normal text-stone-400 ml-1">°C</span>
                    </h3>
                    <p className="text-[10px] text-stone-500 mt-4 font-medium">Optimal range: 18°C - 28°C</p>
                  </div>

                  <div className="glass-card p-6 rounded-3xl bg-white border border-stone-100">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                        <CloudSun size={20} />
                      </div>
                      {liveSensorData && <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        LIVE
                      </span>}
                    </div>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Air Humidity</p>
                    <h3 className="text-3xl font-bold text-stone-900">
                      {liveSensorData ? liveSensorData.humidity : 65}
                      <span className="text-sm font-normal text-stone-400 ml-1">%</span>
                    </h3>
                    <p className="text-[10px] text-stone-500 mt-4 font-medium">Last updated: {liveSensorData ? new Date(liveSensorData.timestamp).toLocaleTimeString() : 'Just now'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    {/* Smart Irrigation Advisor Card */}
                    <div className="glass-card rounded-3xl p-8 bg-gradient-to-br from-indigo-600 to-violet-800 text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Droplets size={120} />
                      </div>
                      
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-6">
                          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                            <Leaf size={18} />
                          </div>
                          <span className="text-sm font-bold uppercase tracking-widest opacity-80">Smart Irrigation Advisor</span>
                        </div>

                        {isLoadingIrrigation ? (
                          <div className="py-12 flex flex-col items-center justify-center">
                            <Loader2 size={32} className="animate-spin mb-4" />
                            <p className="text-indigo-100 font-medium">Analyzing climate & soil data...</p>
                          </div>
                        ) : irrigationAdvice ? (
                          <div className="space-y-6">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-3xl font-bold mb-2">{irrigationAdvice.action} Recommended</h3>
                                <p className="text-indigo-100 max-w-md leading-relaxed">
                                  {irrigationAdvice.reason}
                                </p>
                              </div>
                              <div className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                                irrigationAdvice.urgency === 'high' ? "bg-red-500/20 border-red-400 text-red-100" : "bg-white/20 border-white/20 text-white"
                              )}>
                                {irrigationAdvice.urgency} Priority
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Optimal Timing</p>
                                <p className="text-xl font-bold">{irrigationAdvice.timing}</p>
                              </div>
                              <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Water Quantity</p>
                                <p className="text-xl font-bold">{irrigationAdvice.quantity} <span className="text-sm font-normal opacity-60">L/m²</span></p>
                              </div>
                            </div>

                            <button 
                              onClick={fetchIrrigationAdvice}
                              className="w-full py-3 bg-white text-indigo-900 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors"
                            >
                              Refresh Analysis
                            </button>
                          </div>
                        ) : (
                          <div className="py-12 text-center">
                            <button 
                              onClick={fetchIrrigationAdvice}
                              className="px-8 py-3 bg-white text-indigo-900 rounded-xl font-bold text-sm"
                            >
                              Start Analysis
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="glass-card rounded-3xl p-6">
                      <h3 className="text-xl font-bold mb-6">7-Day Forecast</h3>
                      <div className="grid grid-cols-7 gap-4">
                        {[
                          { day: 'Mon', temp: 28, icon: CloudSun, rain: 0 },
                          { day: 'Tue', temp: 24, icon: Droplets, rain: 85 },
                          { day: 'Wed', temp: 22, icon: Droplets, rain: 40 },
                          { day: 'Thu', temp: 26, icon: CloudSun, rain: 10 },
                          { day: 'Fri', temp: 29, icon: CloudSun, rain: 0 },
                          { day: 'Sat', temp: 31, icon: CloudSun, rain: 0 },
                          { day: 'Sun', temp: 30, icon: CloudSun, rain: 0 },
                        ].map((day, i) => (
                          <div key={i} className="flex flex-col items-center p-3 rounded-2xl bg-stone-50 border border-stone-100">
                            <p className="text-xs font-bold text-stone-400 uppercase mb-2">{day.day}</p>
                            <day.icon size={20} className={cn(day.rain > 50 ? "text-blue-500" : "text-yellow-500")} />
                            <p className="text-lg font-bold text-stone-900 mt-2">{day.temp}°</p>
                            {day.rain > 0 && (
                              <p className="text-[10px] font-bold text-blue-500 mt-1">{day.rain}%</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="glass-card rounded-3xl p-6">
                      <h3 className="text-xl font-bold mb-4">Wind & Spraying</h3>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-600">
                          <TrendingUp size={24} className="rotate-45" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-stone-900">12 km/h NW</p>
                          <p className="text-xs text-stone-500">Ideal for spraying</p>
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                        <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Recommendation</p>
                        <p className="text-sm text-green-800 font-medium">Conditions are optimal for pesticide application until 4:00 PM.</p>
                      </div>
                    </div>

                    <div className="glass-card rounded-3xl p-6">
                      <h3 className="text-xl font-bold mb-4">Evapotranspiration</h3>
                      <div className="h-[150px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[
                            { h: '6am', v: 1.2 },
                            { h: '9am', v: 2.5 },
                            { h: '12pm', v: 4.8 },
                            { h: '3pm', v: 5.2 },
                            { h: '6pm', v: 3.1 },
                          ]}>
                            <Area type="monotone" dataKey="v" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-stone-400 mt-4">Daily water loss: 4.2mm/day</p>
                    </div>
                  </div>
                </div>

                {/* Weather Alerts Section */}
                <div className="glass-card rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">Recent Weather Alerts</h3>
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">{weatherAlerts.length} Active</span>
                  </div>
                  
                  <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4 scrollbar-hide">
                    <AnimatePresence mode="popLayout">
                      {weatherAlerts.length > 0 ? (
                        weatherAlerts.map((alert) => (
                          <motion.div
                            key={alert.id}
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={cn(
                              "p-4 rounded-2xl border-l-4 flex justify-between items-start gap-4",
                              alert.severity === 'high' ? "bg-red-50 border-red-500" :
                              alert.severity === 'medium' ? "bg-amber-50 border-amber-500" :
                              "bg-blue-50 border-blue-500"
                            )}
                          >
                            <div className="flex gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                alert.severity === 'high' ? "bg-red-100 text-red-600" :
                                alert.severity === 'medium' ? "bg-amber-100 text-amber-600" :
                                "bg-blue-100 text-blue-600"
                              )}>
                                <AlertTriangle size={20} />
                              </div>
                              <div>
                                <h4 className="font-bold text-stone-900">{alert.title}</h4>
                                <p className="text-sm text-stone-600 mt-1">{alert.description}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => dismissWeatherAlert(alert.id)}
                              className="p-2 hover:bg-white/50 rounded-lg text-stone-400 hover:text-stone-600 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
                            <CloudSun size={32} />
                          </div>
                          <p className="text-stone-500 font-medium">No active weather alerts.</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col max-w-4xl mx-auto"
              >
                <div className="flex-1 overflow-y-auto space-y-6 pb-6 pr-4 scrollbar-hide">
                  {messages.map((msg, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-4",
                        msg.role === 'user' ? "flex-row-reverse" : ""
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        msg.role === 'ai' ? "bg-brand-600 text-white" : "bg-stone-200 text-stone-600"
                      )}>
                        {msg.role === 'ai' ? <Leaf size={20} /> : <div className="font-bold text-xs">YOU</div>}
                      </div>
                      <div className={cn(
                        "max-w-[80%] p-4 rounded-2xl",
                        msg.role === 'ai' ? "bg-white border border-stone-200 shadow-sm" : "bg-stone-900 text-white"
                      )}>
                        <div className="prose prose-sm max-w-none">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                      <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-stone-200">
                  <div className="relative">
                    <input 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask Vesta about your crops, weather, or market trends..."
                      className="w-full bg-white border-2 border-stone-200 rounded-2xl px-6 py-4 pr-16 focus:border-brand-500 focus:outline-none transition-all shadow-sm"
                    />
                    <button 
                      onClick={handleSendMessage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-brand-600 text-white rounded-xl flex items-center justify-center hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                  <p className="text-center text-xs text-stone-400 mt-3 font-medium">
                    Vesta AI can make mistakes. Verify important agricultural decisions with local experts.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      {/* Voice Assistant Floating Button */}
      <div className="fixed bottom-8 right-8 z-50">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsVoiceActive(true)}
          className="w-16 h-16 bg-brand-600 text-white rounded-full shadow-2xl flex items-center justify-center border-4 border-white"
        >
          <Mic size={32} />
        </motion.button>
      </div>

      {/* Voice Assistant Overlay */}
      <AnimatePresence>
        {isVoiceActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-stone-900/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <button 
              onClick={() => setIsVoiceActive(false)}
              className="absolute top-8 right-8 text-white/60 hover:text-white transition-colors"
            >
              <X size={32} />
            </button>

            <div className="max-w-2xl w-full text-center space-y-12">
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-white">Vesta Voice</h2>
                <p className="text-stone-400 text-lg">Speak in Hindi, Marathi, or English</p>
              </div>

              <div className="relative flex justify-center">
                <AnimatePresence>
                  {(isListening || isSpeaking) && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-64 h-64 bg-brand-500/20 rounded-full animate-pulse" />
                      <div className="absolute w-48 h-48 bg-brand-500/30 rounded-full animate-ping" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={startListening}
                  disabled={isListening || isProcessingVoice || isSpeaking}
                  className={cn(
                    "relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
                    isListening ? "bg-red-500 scale-110" : "bg-brand-600",
                    (isProcessingVoice || isSpeaking) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isProcessingVoice ? (
                    <Loader2 size={48} className="text-white animate-spin" />
                  ) : isSpeaking ? (
                    <Volume2 size={48} className="text-white animate-bounce" />
                  ) : (
                    <Mic size={48} className="text-white" />
                  )}
                </button>
              </div>

              <div className="space-y-8 min-h-[200px]">
                {voiceTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-white/5 rounded-3xl border border-white/10"
                  >
                    <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">You said</p>
                    <p className="text-xl text-white font-medium italic">"{voiceTranscript}"</p>
                  </motion.div>
                )}

                {voiceResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-8 bg-brand-600 rounded-3xl text-left shadow-xl"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare size={18} className="text-brand-200" />
                      <p className="text-xs font-bold text-brand-200 uppercase tracking-widest">Vesta's Advice</p>
                    </div>
                    <div className="text-lg text-white leading-relaxed">
                      <Markdown>{voiceResponse}</Markdown>
                    </div>
                  </motion.div>
                )}

                {!voiceTranscript && !voiceResponse && !isListening && (
                  <p className="text-stone-500 text-lg animate-pulse">Tap the microphone to ask a question...</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
                {[
                  "Why are my leaves yellow?",
                  "When should I water?",
                  "What is the wheat price?"
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setVoiceTranscript(suggestion);
                      processVoiceRequest(suggestion);
                    }}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-stone-400 text-sm font-bold transition-colors border border-white/5"
                  >
                    "{suggestion}"
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
