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

// Koneksi ke Broker
const mqttClient = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`);

mqttClient.on('connect', () => {
  console.log('MQTT: Terhubung ke Broker!');
  // Subscribe ke topik data
  mqttClient.subscribe('bems/raw/sensor');
});

mqttClient.on('message', async (topic, message) => {
  if (topic === 'bems/raw/sensor') {
    try {
      const data = JSON.parse(message.toString());
      
      // Simpan ke MongoDB (Mapping JSON ESP32 -> Prisma Schema)
      await prisma.sensorLog.create({
        data: {
          deviceId:    data.device_id || "unknown",
          lux:         parseFloat(data.lux || 0),
          temperature: parseFloat(data.temperature || 0),
          humidity:    parseFloat(data.humidity || 0),
          mq2_adc:     parseFloat(data.mq2_adc || 0),
          noise:       parseFloat(data.sound || 0),      // JSON: sound -> DB: noise
          vibration:   parseFloat(data.vibration || 0),
          uv_status:   parseFloat(data.uv || 0)          // JSON: uv -> DB: uv_status
        }
      });

      console.log(`[SAVED] Data dari ${data.device_id} disimpan.`);

    } catch (err) {
      console.error('MQTT Error:', err);
    }
  }
});

// ==========================================
// 3. API ENDPOINTS
// ==========================================

// Endpoint 1: Ambil data history (Support Limit, Range, & Custom Date)
app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const { range, start, end } = req.query; // start & end format ISO string
    
    // A. JIKA TIDAK ADA FILTER SAMA SEKALI (Load Awal)
    if (!range && !start && !end) {
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await prisma.sensorLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      return res.json(history.reverse());
    }

    let startDate = new Date();
    let endDate = new Date(); // Default sekarang

    // B. LOGIC CUSTOM DATE (Jika user input tanggal manual)
    if (start && end) {
      startDate = new Date(start as string);
      endDate = new Date(end as string);
    } 
    // C. LOGIC PRESET RANGE (1d, 1w, etc)
    else if (range) {
      switch (range) {
        case '1d': startDate.setHours(startDate.getHours() - 24); break;
        case '1w': startDate.setDate(startDate.getDate() - 7); break;
        case '1m': startDate.setMonth(startDate.getMonth() - 1); break;
        case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break;
      }
    }

    // Query Database dengan rentang waktu spesifik
    const history = await prisma.sensorLog.findMany({
      where: {
        createdAt: {
          gte: startDate, // Lebih besar atau sama dengan Start
          lte: endDate,   // Lebih kecil atau sama dengan End
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(history);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mengambil history' });
  }
});

// Endpoint 2: Ambil 1 data terbaru (Untuk debugging / cek status aktif)
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

// ==========================================
// 4. JALANKAN SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`API Server berjalan di http://localhost:${PORT}`);
  console.log(`Menunggu data MQTT...`);
});