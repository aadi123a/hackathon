# Predictive Pest Migration Engine (PPME) Technical Design

## 1. AI Model Architecture: Spatio-Temporal Graph Neural Network (ST-GNN)
The PPME uses an ST-GNN to model the agricultural landscape as a graph where nodes are farm plots and edges represent spatial proximity and environmental connectivity.

### Spatial Clustering
- **Algorithm:** DBSCAN (Density-Based Spatial Clustering of Applications with Noise).
- **Purpose:** Identifies "Outbreak Epicenters" from unstructured farmer reports. It filters out "noise" (isolated, low-confidence reports) and groups high-density sightings.
- **Parameters:** `eps` (radius of 5km), `minSamples` (3 reports).

### Spread Prediction
- **Model:** ConvLSTM (Convolutional Long Short-Term Memory).
- **Inputs:** 
  - 2D Grid of current pest density.
  - Wind Vector Fields (U, V components).
  - Humidity/Temperature Tensors.
- **Output:** A probability distribution map (Heatmap) for $T+24h$ and $T+48h$.

## 2. Pest Spread Simulation Logic
We employ a **Lagrangian Particle Dispersion Model** adapted for biological entities:
$$P_{spread} = \alpha \cdot \vec{W} + \beta \cdot \nabla H + \gamma \cdot C$$
- $\vec{W}$: Wind vector (primary transport for light insects like aphids).
- $\nabla H$: Humidity gradient (pests move toward moisture).
- $C$: Crop Suitability Index (binary mask of host crops).

## 3. Data Pipeline Architecture
1. **Ingestion:** Vision Lab API sends `DiagnosisResult` with GPS metadata.
2. **Enrichment:** Middleware fetches real-time weather from OpenWeather (Wind, Temp, RH).
3. **Vectorization:** Data is transformed into a normalized grid (0.01° resolution).
4. **Inference:** The model runs on the server every 6 hours.
5. **Broadcast:** High-risk zones are pushed to clients via WebSockets.

## 4. Risk Score Algorithm
The **Vesta Risk Index (VRI)** is calculated per grid cell:
`VRI = (D * 0.4) + (W_align * S * 0.3) + (T_suit * 0.2) + (C_host * 0.1)`
- `D`: Local report density.
- `W_align`: Alignment of wind direction with the cell from an epicenter.
- `S`: Wind speed.
- `T_suit`: Temperature suitability for the specific pest species.
- `C_host`: Presence of preferred crop type.

## 5. Innovation & Impact
- **Proactive vs. Reactive:** Current systems tell you what *is* happening. Vesta Sentinel tells you what *will* happen.
- **Resource Optimization:** Farmers only spray "at-risk" zones, reducing pesticide use by up to 40%.
- **Community Resilience:** A single report in Farm A protects Farm B, 20km downwind.
