// mqtt-worker.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import mqtt from 'mqtt';

// Setup Database & MQTT
const prisma = new PrismaClient();
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_PORT = process.env.MQTT_PORT;

if (!MQTT_HOST || !MQTT_PORT) {
  throw new Error('MQTT_HOST atau MQTT_PORT belum diset di .env');
}

const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`);

console.log('Worker: Mencoba connect ke MQTT...');

client.on('connect', () => {
  console.log('Worker: TERHUBUNG ke Broker MQTT!');
  // Subscribe ke semua topik bems
  client.subscribe('bems/#', (err) => {
    if (!err) {
      console.log('Worker: Sukses subscribe ke bems/#');
    }
  });
});

client.on('message', async (topic, message) => {
  const payloadStr = message.toString();
  // console.log(`Terima data: ${topic} -> ${payloadStr}`);

  try {
    const data = JSON.parse(payloadStr);

    // Kita siapin array janji (Promises) buat nyimpen data berbarengan
    const savePromises = [];

    // ==========================================
    // LOGIC MAPPING: MQTT JSON -> DATABASE ROW
    // ==========================================

    // 1. Cek Topik Environment
    if (topic === 'bems/environment') {
      if (data.tempC) savePromises.push(saveToDB('temperature', parseFloat(data.tempC)));
      if (data.hum)   savePromises.push(saveToDB('humidity', parseFloat(data.hum)));
      if (data.lux)   savePromises.push(saveToDB('light', parseFloat(data.lux)));
    }
    
    // 2. Cek Topik Gas & Suara
    else if (topic === 'bems/gas_sound') {
      if (data.sound_status_avg) savePromises.push(saveToDB('noise', parseFloat(data.sound_status_avg)));
      if (data.mq2_adc)          savePromises.push(saveToDB('gas', parseFloat(data.mq2_adc)));
    }

    // 3. Cek Topik Getaran
    else if (topic === 'bems/motion') {
      if (data.vibration_status) savePromises.push(saveToDB('vibration', parseFloat(data.vibration_status)));
    }

    // 4. Cek Topik UV (Baru)
    else if (topic === 'bems/uv_status') {
      if (data.uv_status) savePromises.push(saveToDB('uv_status', parseFloat(data.uv_status)));
    }

    // Jalankan simpan ke database
    if (savePromises.length > 0) {
      await Promise.all(savePromises);
      console.log(`[SAVED] Disimpan ${savePromises.length} data dari ${topic}`);
    }

  } catch (err) {
    console.error('Error parsing JSON:', err);
  }
});

// Fungsi Helper buat Simpan ke Prisma
async function saveToDB(topicName: string, value: number) {
  if (isNaN(value)) return; // Jangan simpan kalau bukan angka
  
  return prisma.energyLog.create({
    data: {
      topic: topicName,
      value: value,
      // deviceId: "ESP32_01", // Opsional kalau mau diisi
    },
  });
}