import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import mqtt from 'mqtt';

// ==========================================
// 1. SETUP SERVER & DATABASE
// ==========================================
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT;

// Middleware
app.use(cors()); // Supaya Frontend (Port 3000) bisa akses Backend (Port 3001)
app.use(express.json());

// ==========================================
// 2. SETUP MQTT (WORKER LOGIC)
// ==========================================
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_PORT = process.env.MQTT_PORT;

if (!MQTT_HOST || !MQTT_PORT) {
  console.error("ERROR: MQTT_HOST atau MQTT_PORT belum ada di .env");
  process.exit(1);
}

const mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`);

mqttClient.on('connect', () => {
  console.log('MQTT: Terhubung ke Broker!');
  // Subscribe ke topik data V6
  mqttClient.subscribe('bems/raw/sensor');
});

mqttClient.on('message', async (topic, message) => {
  if (topic === 'bems/raw/sensor') {
    try {
      const data = JSON.parse(message.toString());
      
      // Simpan ke MongoDB (Single Document / Satu Paket)
      await prisma.sensorLog.create({
        data: {
          deviceId:    data.device_id || "unknown",
          lux:         parseFloat(data.lux || 0),
          temperature: parseFloat(data.temperature || 0),
          humidity:    parseFloat(data.humidity || 0),
          mq2_adc:     parseFloat(data.mq2_adc || 0),
          noise:       parseFloat(data.sound || 0),      // JSON: sound -> DB: noise
          vibration:   parseFloat(data.vibration || 0),  // JSON: vibration -> DB: vibration
          uv_status:   parseFloat(data.uv || 0)          // JSON: uv -> DB: uv_status
        }
      });

      console.log(`[SAVED] Data dari ${data.device_id} berhasil disimpan.`);

    } catch (err) {
      console.error('MQTT Error:', err);
    }
  }
});

// ==========================================
// 3. API ENDPOINTS (UNTUK FRONTEND)
// ==========================================

// Endpoint 1: Ambil data realtime terakhir (Opsional, buat cek status)
app.get('/api/latest', async (req: Request, res: Response) => {
  try {
    const latest = await prisma.sensorLog.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data terbaru' });
  }
});

// Endpoint 2: Ambil data history (Untuk Grafik)
// Contoh URL: http://localhost:3001/api/history?limit=50
app.get('/api/history', async (req: Request, res: Response) => {
  try {
    // Ambil parameter limit dari URL (default 100 data terakhir)
    const limit = parseInt(req.query.limit as string) || 100;

    const history = await prisma.sensorLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' }, // Urutkan dari yang terbaru
    });

    // Kita balik urutannya (asc) supaya grafik mulainya dari kiri ke kanan
    res.json(history.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil history' });
  }
});

// ==========================================
// 4. JALANKAN SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`API Server berjalan di http://localhost:${PORT}`);
  console.log(`Menunggu data MQTT...`);
});