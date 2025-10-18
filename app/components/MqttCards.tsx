'use client';

import { useEffect, useRef, useState } from 'react';
// gunakan bundle browser untuk Next.js (v4 stabil)
import mqtt from 'mqtt/dist/mqtt.min';
import type { MqttClient } from 'mqtt';

const URL = process.env.NEXT_PUBLIC_MQTT_WS_URL as string; // contoh: ws://localhost:9001
type Msg = Record<string, any>;

export default function MqttCards() {
  const clientRef = useRef<MqttClient | null>(null);

  // --- state untuk semua sensor ---
  const [status, setStatus] = useState('connecting');

  const [lux, setLux] = useState('—');   // BH1750
  const [uvi, setUvi] = useState('—');   // GUVA
  const [tc, setTc]   = useState('—');   // MAX6675
  const [dhtT, setDhtT] = useState('—'); // DHT11 temp
  const [dhtH, setDhtH] = useState('—'); // DHT11 hum
  const [temtV, setTemtV] = useState('—'); // TEMT6000 volts
  const [gx, setGx] = useState('—'); const [gy, setGy] = useState('—'); const [gz, setGz] = useState('—'); // MPU6050
  const [hall, setHall] = useState('—');   // Hall
  const [sound, setSound] = useState('—'); // Sound

  useEffect(() => {
    if (!URL) { setStatus('missing NEXT_PUBLIC_MQTT_WS_URL env'); return; }

    // v4: panggil mqtt.connect()
    const client = mqtt.connect(URL, {
      protocolVersion: 4, // 3.1.1 (umum untuk Mosquitto)
      // username: process.env.NEXT_PUBLIC_MQTT_USER,
      // password: process.env.NEXT_PUBLIC_MQTT_PASS,
    });
    clientRef.current = client;

    client.on('connect', () => {
      setStatus('connected');
      client.subscribe('bems/#');
    });
    client.on('reconnect', () => setStatus('reconnecting'));
    client.on('close', () => setStatus('closed'));
    client.on('error', (err) => setStatus('error: ' + (err?.message ?? 'unknown')));

    client.on('message', (topic, payload) => {
      // Format payload yang diharapkan:
      // bems/bh1750   -> {"lux":123.4}
      // bems/guva     -> {"uvi":2.8,"volts":2.04}
      // bems/max6675  -> {"tempC":87.5} atau {"error":"open"}
      // bems/dht11    -> {"tempC":27.2,"hum":62}
      // bems/temt6000 -> {"volts":2.50,"adc":512}
      // bems/mpu6050  -> {"gx":..,"gy":..,"gz":..}
      // bems/hall     -> {"state":1}
      // bems/sound    -> {"level":320}
      try {
        const obj: Msg = JSON.parse(payload.toString());
        switch (topic) {
          case 'bems/bh1750':   setLux(fmt(obj.lux)); break;
          case 'bems/guva':     setUvi(fmt(obj.uvi)); break;
          case 'bems/max6675':  setTc(obj?.error ? 'OPEN' : fmt(obj.tempC)); break;
          case 'bems/dht11':    setDhtT(fmt(obj.tempC)); setDhtH(fmt(obj.hum)); break;
          case 'bems/temt6000': setTemtV(fmt(obj.volts)); break;
          case 'bems/mpu6050':  setGx(fmt(obj.gx)); setGy(fmt(obj.gy)); setGz(fmt(obj.gz)); break;
          case 'bems/hall':     setHall(fmt(obj.state)); break;
          case 'bems/sound':    setSound(fmt(obj.level)); break;
          default: break;
        }
      } catch { /* payload bukan JSON → abaikan */ }
    });

    return () => client.end(true);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.7 }}>Status: {status}</div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Card title="BH1750 (Lux)" value={lux} />
        <Card title="GUVA (UVI)" value={uvi} />
        <Card title="MAX6675 (°C)" value={tc} />
        <Card title="DHT11 Temp (°C)" value={dhtT} />
        <Card title="DHT11 Humidity (%)" value={dhtH} />
        <Card title="TEMT6000 (V)" value={temtV} />
        <Card title="MPU6050 gx (°/s)" value={gx} />
        <Card title="MPU6050 gy (°/s)" value={gy} />
        <Card title="MPU6050 gz (°/s)" value={gz} />
        <Card title="Hall (state)" value={hall} />
        <Card title="Sound (level)" value={sound} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 28 }}>{value}</div>
    </div>
  );
}

function fmt(v: any) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toString() : '—';
  return String(v);
}