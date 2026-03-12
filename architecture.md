# Vesta Sentinel: Technical Architecture & System Design

## 1. High-Level Architecture
Vesta Sentinel follows a **Modern Full-Stack AI Architecture** designed for low-latency edge diagnostics and high-throughput community alerts.

*   **Frontend:** React 19 (SPA) + Tailwind CSS + Framer Motion.
*   **Backend:** Node.js (Express) + Socket.io (Real-time).
*   **AI Layer:** Google Gemini 3.1 (Pro & Flash) via `@google/genai`.
*   **Database:** PostgreSQL (Relational) + PostGIS (Geo-spatial) + Redis (Cache/PubSub).

---

## 2. Backend Service Architecture
The backend is structured as a set of modular services:
*   **Auth Service:** Handles farmer onboarding and session management.
*   **Diagnostic Service:** Orchestrates image uploads to Gemini Flash and stores results.
*   **Sentinel Service:** Manages the real-time WebSocket connections and outbreak broadcasting.
*   **Market Service:** Aggregates global price indices and runs prediction logic.
*   **Weather Service:** Proxies hyper-local weather data and generates irrigation advice.

---

## 3. AI Pipeline
### Vision Lab (Image Processing)
1.  **Capture:** Farmer captures image on device.
2.  **Pre-process:** Client-side resizing/compression to reduce bandwidth.
3.  **Inference:** Image + Context (Crop type, Location) sent to **Gemini 3.1 Flash**.
4.  **Structured Output:** Model returns JSON containing `disease`, `confidence`, `urgency`, and `treatment`.
5.  **Persistence:** Result saved to DB; if urgency is 'High', triggers Sentinel Pipeline.

### Sentinel Brain (Reasoning)
1.  **Aggregate:** Sentinel Service pulls recent 'High' urgency reports in a 50km radius.
2.  **Contextualize:** Pulls current wind speed/direction and humidity.
3.  **Reasoning:** Data sent to **Gemini 3.1 Pro** to predict spread vectors.
4.  **Alert:** If spread probability > 70%, broadcast WebSocket alert to neighbors.

---

## 4. Real-Time Sentinel Network (WebSockets)
*   **Protocol:** Socket.io over HTTPS.
*   **Rooms:** Farmers are automatically joined to "Geo-Rooms" based on their H3 Index (Hexagonal hierarchical geospatial indexing).
*   **Flow:**
    *   Farmer A reports pest -> Server identifies H3 cell -> Server broadcasts to all clients in that cell and adjacent cells.

---

## 5. Geo-spatial Outbreak Clustering
*   **Algorithm:** DBSCAN (Density-Based Spatial Clustering of Applications with Noise).
*   **Logic:** Identifies clusters of reports to distinguish between isolated incidents and systemic outbreaks.
*   **Implementation:** Handled via PostGIS queries:
    ```sql
    SELECT ST_ClusterDBSCAN(geom, eps := 0.05, minpoints := 3) OVER () AS cluster_id FROM reports;
    ```

---

## 6. Database Schema (PostgreSQL)

### `farmers`
*   `id`: UUID (PK)
*   `name`: String
*   `location`: Geometry(Point, 4326)
*   `crop_type`: Enum
*   `created_at`: Timestamp

### `diagnoses`
*   `id`: UUID (PK)
*   `farmer_id`: UUID (FK)
*   `image_url`: String
*   `disease_name`: String
*   `confidence`: Float
*   `urgency`: Enum (low, medium, high)
*   `location`: Geometry(Point, 4326)
*   `created_at`: Timestamp

### `market_data`
*   `id`: UUID (PK)
*   `crop`: String
*   `price`: Decimal
*   `timestamp`: Timestamp

---

## 7. API Endpoints

### Diagnostics
*   `POST /api/v1/diagnose`: Upload image for AI analysis.
*   `GET /api/v1/history`: Retrieve past diagnostic reports.

### Sentinel
*   `GET /api/v1/sentinel/heatmap`: Get regional outbreak coordinates for the map.
*   `POST /api/v1/sentinel/report`: Manually report a threat.

### Market
*   `GET /api/v1/market/trends`: Get historical and predicted prices.

---

## 8. Scaling to Millions of Farmers
1.  **Database Sharding:** Partitioning PostGIS data by geographic regions (e.g., North India, South India).
2.  **Edge Caching:** Using Cloudflare Workers to serve static assets and cached weather data.
3.  **Message Queue:** Using RabbitMQ to handle the high volume of incoming diagnostic reports and outgoing alerts.
4.  **Serverless Inference:** Scaling Gemini API calls horizontally using Cloud Functions.

---

## 9. Cloud Deployment Architecture
*   **Compute:** Google Cloud Run (Autoscaling containers).
*   **Storage:** Google Cloud Storage (Images) + Cloud SQL (PostgreSQL).
*   **Real-time:** Redis Pub/Sub for cross-instance WebSocket communication.
*   **CDN:** Google Cloud CDN for low-latency asset delivery in rural areas.
