# ARGUS (Navia) Safety Intelligence

We propose a voice-first mobile navigation app for visually impaired users that enables safe outdoor travel by combining trusted map navigation with real-time visual awareness.

## Project Vision

The app uses Google Maps for pedestrian routing and turn-by-turn guidance, delivered as simple spoken instructions. For real-time safety, the smartphone camera and a lightweight **multimodal vision model** detect obstacles such as people, vehicles, poles, stairs, and bicycles.

At the core, the **Groq Service acts as the intelligence layer** by interpreting scene context, prioritizing safety alerts, and converting detections into clear, human-friendly voice guidance.

The app provides short audio cues like “Obstacle ahead” or “Path clear” and works on standard smartphones as an assistive safety layer.

## Key Features

- 🔴 **Real-time Safety Monitoring**: Continuous analysis of the environment using high-performance multimodal models.
- 🔊 **Spatial Audio Cues**: Directional alerts (Left/Right/Center) to help users navigate around obstacles.
- 🗣️ **Voice-First Interface**: Simple, accessible voice feedback and touch-based interactions.
- ⚡ **Low Latency**: Powered by Groq for near-instant analysis of live video feeds.

## Tech Stack

- **Framework**: React Native with Expo
- **AI Engine**: Groq Cloud SDK (Llama 3 Vision)
- **Audio**: Expo Speech & Expo AV
- **Camera**: Expo Camera (Direct frame capture)

## Setup & installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd ARGUS
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure API Key**:
   Ensure your Groq API key is correctly configured in `src/services/GroqService.js`.

4. **Run the app**:
   ```bash
   npm start
   ```

## License

MIT
