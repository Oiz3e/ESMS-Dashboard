'use client';

import dynamic from 'next/dynamic';
import Header from './components/Header';
// HAPUS IMPORT STATIS INI:
// import HistoryChart from './components/HistoryChart'; 
import AnalyticsPrediction from './components/AnalyticsPrediction';
import Footer from './components/Footer';

import { useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt/dist/mqtt.min';
import type { MqttClient } from 'mqtt';

const URL = process.env.NEXT_PUBLIC_MQTT_WS_URL as string;
console.log('Connecting to MQTT Broker:', URL);
type Msg = Record<string, any>;

const MqttCards = dynamic(() => import('./components/MqttCards'), { ssr: false });

// --- PERBAIKAN DI SINI: Gunakan dynamic import dengan ssr: false ---
const HistoryChart = dynamic(() => import('./components/HistoryChart'), { ssr: false });
// ------------------------------------------------------------------

// Definisi interface untuk data historis
interface SensorDataPoint {
  time: string; // Timestamp atau label waktu
  value: number; // Nilai sensor
}

export default function Page() {
  const clientRef = useRef<MqttClient | null>(null);
  const [status, setStatus] = useState('connecting');

  const [temperature, setTemperature] = useState<number | string>('—');
  const [humidity, setHumidity] = useState<number | string>('—');
  const [light, setLight] = useState<number | string>('—');
  const [noise, setNoise] = useState<number | string>('—');
  const [gas, setGas] = useState<number | string>('—');
  const [vibration, setVibration] = useState<number | string>('—');
  const [uvStatus, setUvStatus] = useState<number | string>('—'); // <-- BARU: Menggantikan 'uvSensor'

  const [lastUpdated, setLastUpdated] = useState<Record<string, string>>({
    temperature: 'N/A',
    humidity: 'N/A',
    light: 'N/A',
    noise: 'N/A',
    gas: 'N/A',
    vibration: 'N/A',
    uv_status: 'N/A', // <-- BARU: Menggantikan 'uv_sensor'
  });

  // --- State untuk Data Historis ---
  const [temperatureHistory, setTemperatureHistory] = useState<SensorDataPoint[]>([]);
  const [humidityHistory, setHumidityHistory] = useState<SensorDataPoint[]>([]);
  const [lightHistory, setLightHistory] = useState<SensorDataPoint[]>([]);
  const [noiseHistory, setNoiseHistory] = useState<SensorDataPoint[]>([]);
  const [gasHistory, setGasHistory] = useState<SensorDataPoint[]>([]);
  const [vibrationHistory, setVibrationHistory] = useState<SensorDataPoint[]>([]);
  const [uvStatusHistory, setUvStatusHistory] = useState<SensorDataPoint[]>([]); // <-- BARU: Menggantikan 'uvHistory'

  // Fungsi helper untuk menambahkan data point dan membatasi jumlah data
  const addDataPoint = (
    history: SensorDataPoint[],
    setValue: React.Dispatch<React.SetStateAction<SensorDataPoint[]>>,
    value: number,
    timestamp: string,
    maxPoints: number = 20 // Batasi jumlah titik data untuk grafik realtime
  ) => {
    const newPoint = { time: timestamp, value: value };
    setValue((prevHistory) => {
      const updatedHistory = [...prevHistory, newPoint];
      // Jika melebihi batas, hapus data terlama
      if (updatedHistory.length > maxPoints) {
        return updatedHistory.slice(updatedHistory.length - maxPoints);
      }
      return updatedHistory;
    });
  };

  useEffect(() => {
    if (!URL) {
      setStatus('missing NEXT_PUBLIC_MQTT_WS_URL env');
      console.error('Environment variable NEXT_PUBLIC_MQTT_WS_URL is not set.');
      return;
    }

    const client = mqtt.connect(URL, { protocolVersion: 4 });
    clientRef.current = client;

    client.on('connect', () => {
      console.log('MQTT Connected!');
      setStatus('connected');
      client.subscribe('bems/#');
    });
    client.on('reconnect', () => {
      console.log('MQTT Reconnecting...');
      setStatus('reconnecting');
    });
    client.on('close', () => {
      console.log('MQTT Closed');
      setStatus('closed');
    });
    client.on('error', (err) => {
      console.error('MQTT Error:', err);
      setStatus('error: ' + (err?.message ?? 'unknown'));
    });

    client.on('message', (topic, payload) => {
      try {
        const obj: Msg = JSON.parse(payload.toString());
        const sensorTimestamp =
          obj.datetime ??
          new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

        switch (topic) {
          // =======================================================
          // 1. TOPIC: bems/environment
          // =======================================================
          case 'bems/environment':
            if (obj.lux !== undefined) {
              const luxValue = parseFloat(obj.lux);
              if (!isNaN(luxValue)) {
                setLight(luxValue);
                addDataPoint(
                  lightHistory,
                  setLightHistory,
                  luxValue,
                  sensorTimestamp
                );
              } else {
                setLight('—');
              }
            }
            if (obj.tempC !== undefined) {
              const tempValue = parseFloat(obj.tempC);
              if (!isNaN(tempValue)) {
                setTemperature(tempValue);
                addDataPoint(
                  temperatureHistory,
                  setTemperatureHistory,
                  tempValue,
                  sensorTimestamp
                );
              } else {
                setTemperature('—');
              }
            }
            if (obj.hum !== undefined) {
              const humValue = parseFloat(obj.hum);
              if (!isNaN(humValue)) {
                setHumidity(humValue);
                addDataPoint(
                  humidityHistory,
                  setHumidityHistory,
                  humValue,
                  sensorTimestamp
                );
              } else {
                setHumidity('—');
              }
            }
            setLastUpdated((prev) => ({
              ...prev,
              light: sensorTimestamp,
              temperature: sensorTimestamp,
              humidity: sensorTimestamp,
            }));
            break;

          // =======================================================
          // 2. TOPIC: bems/gas_sound
          // =======================================================
          case 'bems/gas_sound':
            if (obj.mq2_adc !== undefined) {
              const gasValue = parseFloat(obj.mq2_adc);
              if (!isNaN(gasValue)) {
                setGas(gasValue);
                addDataPoint(
                  gasHistory,
                  setGasHistory,
                  gasValue,
                  sensorTimestamp
                );
              } else {
                setGas('—');
              }
            }
            if (obj.sound_status_avg !== undefined) {
              const noiseValue = parseFloat(obj.sound_status_avg);
              if (!isNaN(noiseValue)) {
                setNoise(noiseValue);
                addDataPoint(
                  noiseHistory,
                  setNoiseHistory,
                  noiseValue,
                  sensorTimestamp
                );
              } else {
                setNoise('—');
              }
            }
            setLastUpdated((prev) => ({
              ...prev,
              gas: sensorTimestamp,
              noise: sensorTimestamp,
            }));
            break;

          // =======================================================
          // 3. TOPIC: bems/motion
          // =======================================================
          case 'bems/motion':
            if (obj.vibration_status !== undefined) {
              const vibrationValue = parseFloat(obj.vibration_status);
              if (!isNaN(vibrationValue)) {
                setVibration(vibrationValue);
                addDataPoint(
                  vibrationHistory,
                  setVibrationHistory,
                  vibrationValue,
                  sensorTimestamp
                );
              } else {
                setVibration('—');
              }
            }
            setLastUpdated((prev) => ({ ...prev, vibration: sensorTimestamp }));
            break;

          // =======================================================
          // 4. TOPIC BARU: bems/uv_status (Menggantikan bems/uv_sensor)
          // =======================================================
          case 'bems/uv_status': // <-- BARU: Topik baru
            if (obj.uv_status !== undefined) { // <-- BARU: Cek key 'uv_status'
              const uvValue = parseFloat(obj.uv_status); // Ini akan 0.0 - 1.0
              if (!isNaN(uvValue)) {
                setUvStatus(uvValue); // <-- BARU
                addDataPoint(
                  uvStatusHistory, // <-- BARU
                  setUvStatusHistory, // <-- BARU
                  uvValue,
                  sensorTimestamp
                );
              } else {
                setUvStatus('—'); // <-- BARU
              }
            }
            setLastUpdated((prev) => ({ ...prev, uv_status: sensorTimestamp })); // <-- BARU
            break;

          default:
            break;
        }
      } catch (e) {
        console.error('Failed to parse MQTT message:', e);
      }
    });

    // Cleanup
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
      }
    };
  }, []); // Array dependensi kosong

  const fmt = (v: number | string | null | undefined): string => {
    if (v === null || v === undefined || v === '—') return '—';
    if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(1) : '—';
    return String(v);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <Header status={status} />

      <main
        style={{
          flex: 1,
          padding: '24px',
          maxWidth: '1400px',
          margin: '0 auto',
          width: '100%',
          display: 'grid',
          gap: '24px',
          gridTemplateColumns: '1fr',
        }}
      >
        {/* Section Realtime Monitoring */}
        <section aria-label="Realtime Monitoring">
          <h2
            style={{
              fontSize: '1.5rem',
              marginBottom: '16px',
              color: '#cbd5e1',
            }}
          >
            Realtime Monitoring
          </h2>
          <MqttCards
            temperature={fmt(temperature)}
            humidity={fmt(humidity)}
            light={fmt(light)}
            noise={fmt(noise)}
            gas={fmt(gas)}
            vibration={fmt(vibration)}
            uvStatus={fmt(uvStatus)} // <-- BARU: Menggantikan 'uvSensor'
            lastUpdated={lastUpdated}
          />
        </section>

        {/* Section Grafik Historis */}
        <section aria-label="Grafik Historis">
          <h2
            style={{
              fontSize: '1.5rem',
              marginBottom: '16px',
              color: '#cbd5e1',
            }}
          >
            Grafik Historis
          </h2>

          <HistoryChart
            temperatureHistory={temperatureHistory}
            humidityHistory={humidityHistory}
            lightHistory={lightHistory}
            noiseHistory={noiseHistory}
            gasHistory={gasHistory}
            vibrationHistory={vibrationHistory}
            uvStatusHistory={uvStatusHistory} // <-- BARU: Menggantikan 'uvHistory'
          />
        </section>

        {/* Section Analitik & Prediksi */}
        <section aria-label="Analitik dan Prediksi">
          <h2
            style={{
              fontSize: '1.5rem',
              marginBottom: '16px',
              color: '#cbd5e1',
            }}
          >
            Analitik & Prediksi
          </h2>
          <AnalyticsPrediction />
        </section>
      </main>

      <Footer />
    </div>
  );
}