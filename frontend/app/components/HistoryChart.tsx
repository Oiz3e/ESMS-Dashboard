'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import zoomPlugin from 'chartjs-plugin-zoom';

// --- PERBAIKAN DI SINI: Bungkus register dengan pengecekan window ---
if (typeof window !== 'undefined') {
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale, zoomPlugin);
}
// ------------------------------------------------------------------

interface SensorDataPoint {
  time: string;
  value: number;
}

// 1. TAMBAHKAN 'uvStatusHistory' DI INTERFACE INI
interface HistoryChartProps {
  temperatureHistory: SensorDataPoint[];
  humidityHistory: SensorDataPoint[];
  lightHistory: SensorDataPoint[];
  noiseHistory: SensorDataPoint[];
  gasHistory: SensorDataPoint[];
  vibrationHistory: SensorDataPoint[];
  uvStatusHistory: SensorDataPoint[]; // <-- BARU: Menggantikan 'uvHistory'
}

const HistoryChart: React.FC<HistoryChartProps> = ({
  temperatureHistory,
  humidityHistory,
  lightHistory,
  noiseHistory,
  gasHistory,
  vibrationHistory,
  uvStatusHistory, // <-- 2. TERIMA PROP BARU DI SINI
}) => {
  const [selectedParam, setSelectedParam] = useState('Suhu (°C)');
  const [timeRange, setTimeRange] = useState('1 Hari');
  const [chartData, setChartData] = useState<any>({ labels: [], datasets: [] });
  const chartRef = useRef<ChartJS<'line', number[], string> | null>(null);
  const [currentLabel, setCurrentLabel] = useState('Suhu');
  const [currentUnit, setCurrentUnit] = useState('°C');
  const [currentDate, setCurrentDate] = useState('');

  // Konfigurasi berapa banyak titik data yang ingin ditampilkan secara default di viewport
  const MAX_VISIBLE_DATAPOINTS = 10; 

  // State untuk menyimpan rentang min/max waktu yang aktif pada chart
  const [fullTimeMin, setFullTimeMin] = useState<Date | null>(null); // Min dari SEMUA data
  const [fullTimeMax, setFullTimeMax] = useState<Date | null>(null); // Max dari SEMUA data

  useEffect(() => {
    let fullHistory: SensorDataPoint[] = [];
    let label = '';
    let unit = '';

    switch (selectedParam) {
      case 'Suhu (°C)': fullHistory = temperatureHistory; label = 'Suhu'; unit = '°C'; break;
      case 'Kelembapan (%RH)': fullHistory = humidityHistory; label = 'Kelembapan'; unit = '%RH'; break;
      case 'Cahaya (lux)': fullHistory = lightHistory; label = 'Cahaya'; unit = 'lux'; break;
      case 'Kebisingan (dB)': fullHistory = noiseHistory; label = 'Kebisingan'; unit = 'dB (Analog)'; break;
      case 'Gas/Asap (ppm)': fullHistory = gasHistory; label = 'Gas/Asap'; unit = 'ppm (Relatif)'; break;
      case 'Getaran (m/s²)': fullHistory = vibrationHistory; label = 'Getaran'; unit = 'm/s²'; break;
      // 3. UBAH CASE UNTUK 'uvStatusHistory' DI SWITCH INI
      case 'Deteksi Api/UV (Status)': fullHistory = uvStatusHistory; label = 'Deteksi Api/UV'; unit = 'Status (0/1)'; break; // <-- BARU
      default: break;
    }

    setCurrentLabel(label);
    setCurrentUnit(unit);

    let dataPoints: { x: string, y: number }[] = [];

    if (fullHistory.length > 0) {
      dataPoints = fullHistory.map(point => ({
          x: new Date(point.time).toISOString(),
          y: point.value
      }));

      setFullTimeMin(new Date(dataPoints[0].x));
      setFullTimeMax(new Date(dataPoints[dataPoints.length - 1].x));

      const latestTimestamp = new Date(dataPoints[dataPoints.length - 1].x);
      setCurrentDate(latestTimestamp.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

    } else {
      dataPoints = [];
      setFullTimeMin(null);
      setFullTimeMax(null);
      setCurrentDate('');
    }

    setChartData({
      labels: dataPoints.map(p => p.x),
      datasets: [
        {
          label: `${label} (${unit})`,
          data: dataPoints,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
        },
      ],
    });

    if (chartRef.current) {
        chartRef.current.resetZoom();
    }

  }, [
    selectedParam,
    timeRange,
    temperatureHistory,
    humidityHistory,
    lightHistory,
    noiseHistory,
    gasHistory,
    vibrationHistory,
    uvStatusHistory, // <-- 4. TAMBAHKAN 'uvStatusHistory' DI DEPENDENCY ARRAY INI
  ]);

  // Hitung min/max untuk viewport
  const xAxesDisplayRange = useMemo(() => {
    if (!chartData.datasets[0] || chartData.datasets[0].data.length === 0) {
      return { min: undefined, max: undefined };
    }

    const allData = chartData.datasets[0].data;
    const dataLength = allData.length;

    if (dataLength <= MAX_VISIBLE_DATAPOINTS) {
      return {
        min: new Date(allData[0].x).toISOString(),
        max: new Date(allData[dataLength - 1].x).toISOString(),
      };
    } else {
      const maxTime = new Date(allData[dataLength - 1].x).toISOString();
      const minTime = new Date(allData[dataLength - MAX_VISIBLE_DATAPOINTS].x).toISOString();
      return { min: minTime, max: maxTime };
    }
  }, [chartData.datasets]);


  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#3b82f6',
        borderWidth: 1,
        callbacks: {
          title: function(context: any) {
            if (context[0] && context[0].parsed && context[0].parsed.x) {
              return new Date(context[0].parsed.x).toLocaleDateString('id-ID', {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
              });
            }
            return '';
          },
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) { label += ': '; }
            if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(context.parsed.y) + ` ${currentUnit}`;
            }
            return label;
          }
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
          limits: {
            x: {
              min: fullTimeMin ? fullTimeMin.valueOf() : undefined,
              max: fullTimeMax ? fullTimeMax.valueOf() : undefined,
            },
          },
        },
        zoom: {
          wheel: { enabled: false },
          pinch: { enabled: false },
          mode: 'x',
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        min: xAxesDisplayRange.min,
        max: xAxesDisplayRange.max,
        time: {
          tooltipFormat: 'dd MMMM yyyy, HH:mm:ss',
          displayFormats: {
             second: 'HH:mm:ss',
             minute: 'HH:mm:ss',
             hour: 'HH:mm:ss',
             day: 'HH:mm:ss',
             week: 'HH:mm:ss',
             month: 'HH:mm:ss',
             quarter: 'HH:mm:ss',
             year: 'HH:mm:ss',
          }
        },
        grid: {
          color: 'rgba(255,255,255,0.1)',
          borderColor: 'rgba(255,255,255,0.2)',
        },
        ticks: {
          color: '#cbd5e1',
          source: 'data',
          autoSkip: true,
          maxRotation: 0,
          minRotation: 0,
          font: {
            size: 10,
            weight: 'normal',
          },
        },
        title: { display: false }
      },
      y: {
        type: 'linear',
        grid: {
          color: 'rgba(255,255,255,0.1)',
          borderColor: 'rgba(255,255,255,0.2)',
        },
        ticks: {
          color: '#cbd5e1',
          font: {
            size: 10,
            weight: 'normal',
          },
        },
        title: {
          display: true,
          text: `${currentLabel} (${currentUnit})`,
          color: '#cbd5e1',
          font: {
            size: 12,
            weight: 'bold',
          }
        }
      },
    },
  };

  return (
    <div
      style={{
        backgroundColor: '#1e2b3b',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
        height: '400px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#e2e8f0', fontWeight: 600 }}>
          Grafik {currentLabel}
        </h3>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
                <select
                    value={selectedParam}
                    onChange={(e) => setSelectedParam(e.target.value)}
                    style={{
                        backgroundColor: '#334155',
                        color: '#e2e8f0',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '0.9rem',
                        appearance: 'none',
                        paddingRight: '30px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        outline: 'none',
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#475569'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#334155'}
                >
                    <option>Suhu (°C)</option>
                    <option>Kelembapan (%RH)</option>
                    <option>Cahaya (lux)</option>
                    <option>Kebisingan (dB)</option>
                    <option>Gas/Asap (ppm)</option>
                    <option>Getaran (m/s²)</option>
                    <option>Deteksi Api/UV (Status)</option> {/* <-- 4. UBAH OPTION DI SINI */}
                </select>
                <span
                    style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: '#94a3b8',
                    }}
                >
                    ▼
                </span>
            </div>

            {['1 Hari', '1 Minggu', '1 Bulan'].map((range) => (
                <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    style={{
                        backgroundColor: timeRange === range ? '#3b82f6' : '#334155',
                        color: '#e2e8f0',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 15px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        transition: 'background-color 0.2s ease',
                        outline: 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = timeRange === range ? '#3b82f6' : '#475569'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = timeRange === range ? '#3b82f6' : '#334155'}
                >
                    {range}
                </button>
            ))}
        </div>
      </div>

      <div style={{ flexGrow: 1, position: 'relative', marginBottom: timeRange === '1 Hari' ? '10px' : '0' }}>
        <Line
            ref={chartRef}
            data={chartData}
            options={options}
        />
      </div>

      {timeRange === '1 Hari' && (
        <div style={{
            textAlign: 'center',
            fontSize: '0.9rem',
            color: 'white',
            fontWeight: 600,
            margin: '0 auto',
            padding: '5px 10px',
            backgroundColor: '#1e2b3b', // Sesuaikan dengan background
            borderRadius: '8px',
            alignSelf: 'center',
        }}>
          {currentDate}
        </div>
      )}
    </div>
  );
};

export default HistoryChart;