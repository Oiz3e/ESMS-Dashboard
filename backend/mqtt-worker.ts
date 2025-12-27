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
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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

// Koneksi ke Broker
const mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`);

mqttClient.on('connect', () => {
  console.log('MQTT: Terhubung ke Broker!');
  mqttClient.subscribe('bems/raw/sensor');
});

mqttClient.on('message', async (topic, message) => {
  if (topic === 'bems/raw/sensor') {
    try {
      const data = JSON.parse(message.toString());
      
      // === LOGIC BARU: Konversi Timestamp & Latency ===
      
      // 1. Konversi Epoch (Detik) ke Date Object (Milidetik)
      // Jika timestamp kosong, fallback ke waktu sekarang
      const sensorTime = data.timestamp 
        ? new Date(data.timestamp * 1000) 
        : new Date();

      // 2. Simpan ke MongoDB sesuai Schema Prisma Baru
      await prisma.sensorLog.create({
        data: {
          deviceId:    data.device_id || "unknown",
          
          // Float Fields
          lux:         parseFloat(data.lux || 0),
          temperature: parseFloat(data.temperature || 0),
          humidity:    parseFloat(data.humidity || 0),
          
          // Integer Fields (Sesuai Schema)
          mq2_adc:     parseInt(data.mq2_adc || 0),
          sound:       parseInt(data.sound || 0),     // JSON "sound" -> Prisma "sound"
          vibration:   parseInt(data.vibration || 0), // JSON "vibration" -> Prisma "vibration"
          uv:          parseInt(data.uv || 0),        // JSON "uv" -> Prisma "uv"
          
          // Field Baru (Latency & Timestamp Akurat)
          latency:     parseFloat(data.latency_ms || 0), 
          timestamp:   sensorTime 
        }
      });

      console.log(`[SAVED] ${data.device_id} | Time: ${sensorTime.toLocaleTimeString()} | Latency: ${data.latency_ms}ms`);

    } catch (err) {
      console.error('MQTT Error:', err);
    }
  }
});

// ==========================================
// 3. API ENDPOINTS
// ==========================================

// Endpoint 1: Ambil data history
app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const { range, start, end } = req.query; 
    
    // A. LOAD AWAL (Tanpa Filter) -> Urutkan berdasarkan timestamp sensor
    if (!range && !start && !end) {
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await prisma.sensorLog.findMany({
        take: limit,
        orderBy: { timestamp: 'desc' }, // GANTI ke 'timestamp' biar akurat
      });
      return res.json(history.reverse());
    }

    let startDate = new Date();
    let endDate = new Date(); 

    // B. LOGIC CUSTOM DATE
    if (start && end) {
      startDate = new Date(start as string);
      endDate = new Date(end as string);
    } 
    // C. LOGIC PRESET RANGE
    else if (range) {
      switch (range) {
        case '1d': startDate.setHours(startDate.getHours() - 24); break;
        case '1w': startDate.setDate(startDate.getDate() - 7); break;
        case '1m': startDate.setMonth(startDate.getMonth() - 1); break;
        case '3m': startDate.setMonth(startDate.getMonth() - 3); break; // Tambah support 3m
        case 'ytd': startDate = new Date(new Date().getFullYear(), 0, 1); break; // Awal tahun
        case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break;
      }
    }

    // Query Database (Pakai field 'timestamp' bukan 'createdAt')
    const history = await prisma.sensorLog.findMany({
      where: {
        timestamp: { // Filter berdasarkan waktu sensor
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' }, // Urutkan kronologis
    });

    res.json(history);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil history' });
  }
});

// Endpoint 2: Ambil 1 data terbaru
app.get('/api/latest', async (req: Request, res: Response) => {
  try {
    const latest = await prisma.sensorLog.findFirst({
      orderBy: { timestamp: 'desc' } // Ambil yang paling baru berdasarkan waktu sensor
    });
    res.json(latest);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data terbaru' });
  }
});

// ==========================================
// 4. JALANKAN SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`API Server berjalan di http://localhost:${PORT}`);
  console.log(`Menunggu data MQTT...`);
});