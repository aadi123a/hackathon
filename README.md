# 🌾 Vesta Sentinel: The Distributed AI Agronomist

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AI: Gemini 3.1](https://img.shields.io/badge/AI-Gemini%203.1-blue)](https://ai.google.dev/)
[![Stack: Full-Stack](https://img.shields.io/badge/Stack-React%20%2B%20Express-green)](https://expressjs.com/)

Vesta Sentinel is a distributed intelligence network designed to protect regional agriculture. It turns every farmer's smartphone into a node in a collaborative defense system against pests, diseases, and climate volatility.

## 🚀 Killer Feature: The Sentinel Network
Unlike traditional diagnostic apps, Vesta uses **Spatial-Temporal AI** to predict the spread of outbreaks. When one farmer detects a threat, the entire community is alerted with AI-generated prevention strategies tailored to their specific location and crop type.

---

## 🛠 Tech Stack

### Frontend
- **Framework:** React 19 (SPA)
- **Styling:** Tailwind CSS (Mobile-first)
- **Animations:** Framer Motion
- **Charts:** Recharts
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js (Express)
- **Real-time:** Socket.io (WebSockets)
- **Database:** SQLite (Better-SQLite3) for local persistence
- **AI Integration:** Google Gemini 3.1 (Pro & Flash)

---

## 📂 Project Structure

```text
vesta-sentinel/
├── src/                # Frontend React Code
│   ├── components/     # Reusable UI Components
│   ├── services/       # AI & API Integration Services
│   ├── types/          # TypeScript Definitions
│   └── App.tsx         # Main Application Entry
├── server.ts           # Express + WebSocket Backend
├── vesta.db            # SQLite Database (Auto-generated)
├── architecture.md     # Detailed System Design
├── .env.example        # Environment Variable Template
└── package.json        # Dependencies & Scripts
```

---

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- A Google Gemini API Key

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/vesta-sentinel.git
   cd vesta-sentinel
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY to .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🧠 AI Pipelines

### Vision Lab
Uses **Gemini 3.1 Flash** for sub-second disease diagnostics from leaf images. It returns structured JSON including disease name, confidence, and urgency.

### Sentinel Brain
Uses **Gemini 3.1 Pro** to analyze regional clusters of reports. It correlates wind speed, humidity, and report density to broadcast community-wide alerts.

---

## 📈 Roadmap
- [ ] **Phase 1:** Multi-lingual voice support for non-literate farmers.
- [ ] **Phase 2:** Satellite imagery integration for large-scale crop monitoring.
- [ ] **Phase 3:** Blockchain-based crop insurance verification using AI diagnostics.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
