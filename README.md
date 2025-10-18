# MQTT Next.js Starter

Minimal Next.js (App Router) dashboard that connects directly to an MQTT broker over WebSocket.
Suitable for Vercel deployment (frontend-only).

## Quick start

1. Ensure your MQTT broker exposes a WebSocket listener (e.g., `listener 9001` + `protocol websockets` in mosquitto.conf`).
2. Install deps:
   ```bash
   npm i
   ```
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_MQTT_WS_URL`:
   ```
   NEXT_PUBLIC_MQTT_WS_URL=ws://<your-broker-ip>:9001
   ```
4. Run locally:
   ```bash
   npm run dev
   ```
5. Deploy to Vercel:
   - Push to GitHub
   - Import in Vercel
   - Set Environment Variable `NEXT_PUBLIC_MQTT_WS_URL`
   - Deploy

The client subscribes to:
- `bems/bh1750`
- `bems/guva`
- `bems/max6675`
- `bems/temt6000`
- `bems/mpu6050`

Extend `app/components/MqttCards.tsx` to add charts or more tiles.
