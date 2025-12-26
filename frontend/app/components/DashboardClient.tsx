'use client';

import dynamic from 'next/dynamic';
import Header from './Header';
// import AnalyticsPrediction from './AnalyticsPrediction';
import Footer from './Footer';
import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';

// Konfigurasi URL Mosquitto (WebSocket)
const URL = process.env.NEXT_PUBLIC_MQTT_WS_URL || 'ws://localhost:9001';

const MqttCards = dynamic(() => import('./MqttCards'), { ssr: false });
const HistoryChart = dynamic(() => import('./HistoryChart'), { ssr: false });

// Tipe Data untuk Grafik
export interface SensorDataPoint {
  time: string;
  value: number;
}

// Interface Props yang diterima dari page.tsx
interface DashboardProps {
  initialHistory: {
    temp: SensorDataPoint[];
    hum: SensorDataPoint[];
    light: SensorDataPoint[];
    noise: SensorDataPoint[];
    gas: SensorDataPoint[];
    vib: SensorDataPoint[];
    uv: SensorDataPoint[];
  }
}

export default function DashboardClient({ initialHistory }: DashboardProps) {
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const [status, setStatus] = useState('Connecting to Mosquitto...');

  // --- 1. STATE NILAI TERAKHIR (CARD) ---
  const [temperature, setTemperature] = useState<number | string>(initialHistory.temp.at(-1)?.value ?? '—');
  const [humidity, setHumidity] = useState<number | string>(initialHistory.hum.at(-1)?.value ?? '—');
  const [light, setLight] = useState<number | string>(initialHistory.light.at(-1)?.value ?? '—');
  const [noise, setNoise] = useState<number | string>(initialHistory.noise.at(-1)?.value ?? '—');
  const [gas, setGas] = useState<number | string>(initialHistory.gas.at(-1)?.value ?? '—');
  const [vibration, setVibration] = useState<number | string>(initialHistory.vib.at(-1)?.value ?? '—');
  const [uvStatus, setUvStatus] = useState<number | string>(initialHistory.uv.at(-1)?.value ?? '—');

  // --- 2. STATE LAST UPDATED ---
  const [lastUpdated, setLastUpdated] = useState<Record<string, string>>({});

  // --- 3. STATE HISTORY (GRAFIK) ---
  const [temperatureHistory, setTemperatureHistory] = useState<SensorDataPoint[]>(initialHistory.temp);
  const [humidityHistory, setHumidityHistory] = useState<SensorDataPoint[]>(initialHistory.hum);
  const [lightHistory, setLightHistory] = useState<SensorDataPoint[]>(initialHistory.light);
  const [noiseHistory, setNoiseHistory] = useState<SensorDataPoint[]>(initialHistory.noise);
  const [gasHistory, setGasHistory] = useState<SensorDataPoint[]>(initialHistory.gas);
  const [vibrationHistory, setVibrationHistory] = useState<SensorDataPoint[]>(initialHistory.vib);
  const [uvStatusHistory, setUvStatusHistory] = useState<SensorDataPoint[]>(initialHistory.uv);

  // Helper: Tambah data ke array grafik (Limit 20 titik)
  const addDataPoint = (
    setValue: React.Dispatch<React.SetStateAction<SensorDataPoint[]>>,
    value: number,
    timestamp: string
  ) => {
    setValue((prev) => {
      const newHistory = [...prev, { time: timestamp, value }];
      return newHistory.slice(-20); // Ambil 20 terakhir biar ringan
    });
  };

  // --- LOGIC MQTT (WEBSOCKETS) ---
  useEffect(() => {
    console.log(`Connecting MQTT to ${URL}...`);
    
    const client = mqtt.connect(URL);
    clientRef.current = client;

    client.on('connect', () => {
      console.log('Connected to Mosquitto!');
      setStatus('Connected (Realtime)');
      client.subscribe('bems/raw/sensor');
    });

    client.on('message', (topic, payload) => {
      if (topic === 'bems/raw/sensor') {
        try {
          const data = JSON.parse(payload.toString());
          
          const timeLabel = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
          });

          // === UPDATE STATE BERDASARKAN JSON DARI ESP32 ===
          
          if (data.temperature !== undefined) {
             const val = parseFloat(data.temperature);
             setTemperature(val);
             addDataPoint(setTemperatureHistory, val, timeLabel);
          }

          if (data.humidity !== undefined) {
             const val = parseFloat(data.humidity);
             setHumidity(val);
             addDataPoint(setHumidityHistory, val, timeLabel);
          }

          if (data.lux !== undefined) {
             const val = parseFloat(data.lux);
             setLight(val);
             addDataPoint(setLightHistory, val, timeLabel);
          }

          if (data.sound !== undefined) {
             const val = parseFloat(data.sound);
             setNoise(val);
             addDataPoint(setNoiseHistory, val, timeLabel);
          }

          if (data.mq2_adc !== undefined) {
             const val = parseFloat(data.mq2_adc);
             setGas(val);
             addDataPoint(setGasHistory, val, timeLabel);
          }

          if (data.vibration !== undefined) {
             const val = parseFloat(data.vibration);
             setVibration(val);
             addDataPoint(setVibrationHistory, val, timeLabel);
          }

          if (data.uv !== undefined) { // ESP kirim key 'uv'
             const val = parseFloat(data.uv);
             setUvStatus(val);
             addDataPoint(setUvStatusHistory, val, timeLabel);
          }

          setLastUpdated({
            temperature: timeLabel,
            humidity: timeLabel,
            light: timeLabel,
            noise: timeLabel,
            gas: timeLabel,
            vibration: timeLabel,
            uv_status: timeLabel,
          });

        } catch (error) {
          console.error('JSON Parse Error:', error);
        }
      }
    });

    client.on('error', (err) => {
      console.error('MQTT Error:', err);
      setStatus('Connection Error');
    });

    client.on('close', () => {
      setStatus('Disconnected');
    });

    return () => {
      client.end();
    };
  }, []);

  const fmt = (v: number | string | null | undefined): string => {
    if (v === null || v === undefined || v === '—') return '—';
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(1) : '—';
    return String(v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header status={status} />
      <main style={{ flex: 1, padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'grid', gap: '24px', gridTemplateColumns: '1fr' }}>
        
        <section aria-label="Realtime Monitoring">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#cbd5e1' }}>
            Realtime Monitoring
          </h2>
          <MqttCards
            temperature={fmt(temperature)}
            humidity={fmt(humidity)}
            light={fmt(light)}
            noise={fmt(noise)}
            gas={fmt(gas)}
            vibration={fmt(vibration)}
            uvStatus={fmt(uvStatus)}
            lastUpdated={lastUpdated}
          />
        </section>

        <section aria-label="Grafik Historis">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#cbd5e1' }}>
            Grafik Historis
          </h2>
          <HistoryChart />
        </section>

        {/* <section aria-label="Analitik dan Prediksi">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#cbd5e1' }}>
            Analitik & Prediksi
          </h2>
          <AnalyticsPrediction />
        </section> */}

      </main>
      <Footer />
    </div>
  );
}