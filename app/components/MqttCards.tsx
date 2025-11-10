'use client';

import { useEffect, useRef, useState } from 'react';

// Interface untuk status yang akan dikembalikan
interface CardStatus {
  text: string;
  color: string;
}

// Interface untuk props yang diterima oleh komponen SensorCard
interface SensorCardProps {
  icon: string;
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
// Komponen ini sekarang "bodoh" dan hanya menerima logika dari parent
const SensorCard: React.FC<SensorCardProps> = ({
  icon,
  title,
  value,
  unit,
  updated,
  getStatus,
  displayType = 'value', // Default-nya menampilkan angka
}) => {
  const numericValue = typeof value === 'string' && value !== '—' ? parseFloat(value) : NaN;
  
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

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '2rem', marginRight: '10px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#cbd5e1', fontWeight: 500 }}>{title}</h3>
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
        {displayUnit && <span style={{ fontSize: '1.2rem', fontWeight: 400, color: '#94a3b8' }}>{displayUnit}</span>}
      </div>

      <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        {updated && <span>Updated: {updated}</span>}
      </div>
    </div>
  );
};


// ==========================================================
// LOGIKA SENSOR "SATU SATU"
// Didefinisikan di sini, di komponen parent
// ==========================================================

const getTempStatus = (v: number): CardStatus => {
  if (v > 30 || v < 18) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 28 || v < 20) return { text: 'Waspada', color: '#eab308' }; // Rentang normal 20-28°C
  return { text: 'Normal', color: '#22c55e' };
};

const getHumidityStatus = (v: number): CardStatus => {
  if (v > 70 || v < 40) return { text: 'Bahaya', color: '#ef4444' };
  if (v > 60 || v < 45) return { text: 'Waspada', color: '#eab308' }; // Rentang normal 45-60%
  return { text: 'Normal', color: '#22c55e' };
};

const getLightStatus = (v: number): CardStatus => {
  if (v < 20) return { text: 'Bahaya', color: '#ef4444' }; // Terlalu gelap
  if (v < 50 || v > 1000) return { text: 'Waspada', color: '#eab308' }; // Agak gelap / terlalu silau
  return { text: 'Normal', color: '#22c55e' }; // Rentang normal 50-1000 lux
};

const getNoiseStatus = (v: number): CardStatus => {
  // Menerima nilai 0.0 - 1.0 (rata-rata status)
  if (v > 0.5) return { text: 'Bahaya', color: '#ef4444' }; // Sering berisik
  if (v > 0.1) return { text: 'Waspada', color: '#eab308' }; // Kadang berisik
  return { text: 'Normal', color: '#22c55e' };
};

const getGasStatus = (v: number): CardStatus => {
  // Menerima nilai ADC MQ-2
  if (v > 350) return { text: 'Bahaya', color: '#ef4444' }; // Asap tebal
  if (v > 200) return { text: 'Waspada', color: '#eab308' }; // Kualitas udara buruk
  return { text: 'Normal', color: '#22c55e' }; // Udara bersih (< 200)
};

const getVibrationStatus = (v: number): CardStatus => {
  // Menerima nilai 0 (Normal) atau 1 (Moving)
  if (v >= 1) return { text: 'Bahaya', color: '#ef4444' };
  return { text: 'Normal', color: '#22c55e' };
};


// ==========================================================
// KOMPONEN UTAMA
// ==========================================================

// Interface untuk props yang diterima oleh komponen MqttCards
interface MqttCardsProps {
  temperature: string;
  humidity: string;
  light: string;
  noise: string;
  gas: string;
  vibration: string;
  lastUpdated: Record<string, string>;
}

export default function MqttCards({
  temperature,
  humidity,
  light,
  noise,
  gas,
  vibration,
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
        icon="🌡️"
        title="Suhu"
        value={temperature}
        unit="°C"
        updated={lastUpdated.temperature}
        getStatus={getTempStatus} // <-- Melempar logika
        displayType="value"
      />
      <SensorCard
        icon="💧"
        title="Kelembapan"
        value={humidity}
        unit="%RH"
        updated={lastUpdated.humidity}
        getStatus={getHumidityStatus} // <-- Melempar logika
        displayType="value"
      />
      <SensorCard
        icon="💡"
        title="Cahaya"
        value={light}
        unit="lux"
        updated={lastUpdated.light}
        getStatus={getLightStatus} // <-- Melempar logika
        displayType="value"
      />
      <SensorCard
        icon="🔊"
        title="Kebisingan"
        value={noise}
        unit="Status"
        updated={lastUpdated.noise}
        getStatus={getNoiseStatus} // <-- Melempar logika
        displayType="status" // <-- Menampilkan teks (Normal/Bahaya)
      />
      <SensorCard
        icon="💨"
        title="Gas/Asap"
        value={gas}
        unit="ppm (Relatif)"
        updated={lastUpdated.gas}
        getStatus={getGasStatus} // <-- Melempar logika
        displayType="value"
      />
      <SensorCard
        icon="⚡"
        title="Getaran"
        value={vibration}
        unit="Status"
        updated={lastUpdated.vibration}
        getStatus={getVibrationStatus} // <-- Melempar logika
        displayType="status" // <-- Menampilkan teks (Normal/Bahaya)
      />
    </div>
  );
}