'use client';

import { useEffect, useRef, useState } from 'react';

// Interface untuk status yang akan dikembalikan
interface CardStatus {
  text: string;
  color: string;
}

// Interface untuk props yang diterima oleh komponen SensorCard
// HAPUS: icon: string;
interface SensorCardProps {
  title: string;
  value: string; // Nilai mentah (string) dari MQTT, misal "26.2" atau "—"
  unit: string;
  updated?: string;
  // Prop baru: fungsi untuk menentukan status berdasarkan nilai
  getStatus: (value: number) => CardStatus;
  // Prop baru: untuk membedakan kartu status (teks) vs kartu nilai (angka)
  displayType?: 'value' | 'status';
}

// Komponen SensorCard yang menampilkan data individual sensor
const SensorCard: React.FC<SensorCardProps> = ({
  // HAPUS: icon,
  title,
  value,
  unit,
  updated,
  getStatus,
  displayType = 'value', // Default-nya menampilkan angka
}) => {
  const numericValue =
    typeof value === 'string' && value !== '—' ? parseFloat(value) : NaN;

  // 1. Dapatkan status (teks dan warna) dari fungsi prop 'getStatus'
  const { text: statusText, color: statusColor } = isNaN(numericValue)
    ? { text: 'N/A', color: '#cbd5e1' } // Status default jika data tidak valid
    : getStatus(numericValue); // Menjalankan logika yang dilempar dari parent

  const [fade, setFade] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const previousValue = prevValueRef.current;
    let timer: NodeJS.Timeout | undefined;
    if (value !== '—' && value !== previousValue) {
      setFade(true);
      timer = setTimeout(() => setFade(false), 500);
    }
    prevValueRef.current = value;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [value]);

  // 2. Tentukan apa yang akan ditampilkan sebagai nilai utama
  const displayValue = displayType === 'status' ? statusText : value;
  const displayUnit = displayType === 'status' ? '' : unit;

  return (
    <div
      style={{
        backgroundColor: '#1e293b',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        borderBottom: `4px solid ${statusColor}`,
        transition: 'transform 0.2s ease-in-out',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: statusColor,
        }}
      ></div>

      <div
        style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}
      >

        <h3
          style={{
            margin: 0,
            fontSize: '1.2rem',
            color: '#cbd5e1',
            fontWeight: 500,
          }}
        >
          {title}
        </h3>
      </div>

      <div
        style={{
          fontSize: '2.5rem',
          fontWeight: 700,
          color: displayType === 'status' ? statusColor : '#e2e8f0',
          opacity: fade ? 0.7 : 1,
          transition: 'opacity 0.3s ease-in-out',
          minHeight: '48px',
        }}
      >
        {displayValue}{' '}
        {displayUnit && (
          <span
            style={{
              fontSize: '1.2rem',
              fontWeight: 400,
              color: '#94a3b8',
            }}
          >
            {displayUnit}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: '15px',
          fontSize: '0.9rem',
          color: '#94a3b8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        {updated && <span>Updated: {updated}</span>}
      </div>
    </div>
  );
};

// ==========================================================
// LOGIKA SENSOR "SATU SATU"
// ==========================================================

const getTempStatus = (v: number): CardStatus => {
  if (v > 30 || v < 18) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 28 || v < 20) return { text: 'Waspada', color: '#eab308' };
  return { text: 'Normal', color: '#22c55e' };
};

const getHumidityStatus = (v: number): CardStatus => {
  if (v > 70 || v < 40) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 60 || v < 45) return { text: 'Waspada', color: '#eab308' };
  return { text: 'Normal', color: '#22c55e' };
};

const getLightStatus = (v: number): CardStatus => {
  if (v < 20) return { text: 'Bahaya', color: '#ef4444' };
  if (v < 50 || v > 1000) return { text: 'Waspada', color: '#eab308' };
  return { text: 'Normal', color: '#22c55e' };
};

const getNoiseStatus = (v: number): CardStatus => {
  if (v > 0.5) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 0.1) return { text: 'Waspada', color: '#eab308' };
  return { text: 'Normal', color: '#22c55e' };
};

const getGasStatus = (v: number): CardStatus => {
  if (v > 350) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 200) return { text: 'Waspada', color: '#eab308' };
  return { text: 'Normal', color: '#22c55e' };
};

const getVibrationStatus = (v: number): CardStatus => {
  if (v >= 1) return { text: 'Bahaya', color: '#ef4444' }; // Nilai 1
  return { text: 'Normal', color: '#22c55e' }; // Nilai 0
};

const getUvStatus = (v: number): CardStatus => {
  if (v > 0.5) return { text: 'BAHAYA API/UV', color: '#dc2626' };
  return { text: 'Aman', color: '#22c55e' };
};

// ==========================================================
// KOMPONEN UTAMA
// ==========================================================

interface MqttCardsProps {
  temperature: string;
  humidity: string;
  light: string;
  noise: string;
  gas: string;
  vibration: string;
  uvStatus: string;
  lastUpdated: Record<string, string>;
}

export default function MqttCards({
  temperature,
  humidity,
  light,
  noise,
  gas,
  vibration,
  uvStatus,
  lastUpdated,
}: MqttCardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '20px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        justifyContent: 'center',
        transition: 'all 0.3s ease-in-out',
      }}
    >
      <SensorCard
        title="Suhu"
        value={temperature}
        unit="°C"
        updated={lastUpdated.temperature}
        getStatus={getTempStatus}
        displayType="value"
      />
      <SensorCard
        title="Kelembapan"
        value={humidity}
        unit="%RH"
        updated={lastUpdated.humidity}
        getStatus={getHumidityStatus}
        displayType="value"
      />
      <SensorCard
        title="Cahaya"
        value={light}
        unit="lux"
        updated={lastUpdated.light}
        getStatus={getLightStatus}
        displayType="value"
      />
      <SensorCard
        title="Kebisingan"
        value={noise}
        unit="Status"
        updated={lastUpdated.noise}
        getStatus={getNoiseStatus}
        displayType="status"
      />
      <SensorCard
        title="Gas/Asap"
        value={gas}
        unit="ppm (Relatif)"
        updated={lastUpdated.gas}
        getStatus={getGasStatus}
        displayType="value"
      />
      <SensorCard
        title="Getaran"
        value={vibration}
        unit="Status"
        updated={lastUpdated.vibration}
        getStatus={getVibrationStatus}
        displayType="status"
      />
      <SensorCard
        title="Api/UV"
        value={uvStatus}
        unit="Status"
        updated={lastUpdated.uv_status}
        getStatus={getUvStatus}
        displayType="status"
      />
    </div>
  );
}