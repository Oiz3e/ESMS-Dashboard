'use client';

import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale, Filler
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import zoomPlugin from 'chartjs-plugin-zoom';
import { startOfMinute, startOfHour, startOfDay, startOfMonth, format, differenceInHours, differenceInDays, subDays, subWeeks, subMonths, subYears, startOfYear } from 'date-fns';
import { id } from 'date-fns/locale';

if (typeof window !== 'undefined') {
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, TimeScale, zoomPlugin, Filler);
}

interface SensorDataPoint {
  time: string;
  value: number;
}

// === 1. LOGIKA AGREGASI (STOCKBIT STYLE) ===
const aggregateData = (data: SensorDataPoint[], rangeType: string, start?: string, end?: string) => {
  if (data.length === 0) return [];

  if (rangeType === 'Latest') {
     return data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  let interval: 'minute' | 'hour' | 'day' | 'month' = 'day';

  // --- LOGIC STRICT SESUAI REQUEST (STOCKBIT) ---
  if (rangeType === '1D') {
      interval = 'minute'; // 1 Hari = Per Menit
  } else if (rangeType === '1W') {
      interval = 'hour';   // 1 Minggu = Per Jam
  } else if (['1M', '3M', 'YTD', '1Y'].includes(rangeType)) {
      interval = 'day';    // 1 Bulan s/d 1 Tahun = Per Hari (Daily)
  } else if (rangeType === 'Custom' && start && end) {
      // Logic Smart Custom (Fallback)
      const diffHours = differenceInHours(new Date(end), new Date(start));
      const diffDays = differenceInDays(new Date(end), new Date(start));
      
      if (diffHours <= 24) interval = 'minute';
      else if (diffDays <= 7) interval = 'hour';
      else if (diffDays <= 365) interval = 'day'; 
      else interval = 'month';
  }

  const grouped: Record<string, { sum: number; count: number; dateObj: Date }> = {};

  data.forEach((point) => {
    const date = new Date(point.time);
    let key = '';
    let groupDate = new Date();

    if (interval === 'minute') { 
       groupDate = startOfMinute(date); 
       key = format(groupDate, 'yyyy-MM-dd HH:mm'); 
    }
    else if (interval === 'hour') { 
        groupDate = startOfHour(date); 
        key = format(groupDate, 'yyyy-MM-dd HH:00'); 
    }
    else if (interval === 'day') { 
        groupDate = startOfDay(date); 
        key = format(groupDate, 'yyyy-MM-dd'); 
    }
    else { 
        groupDate = startOfMonth(date); 
        key = format(groupDate, 'yyyy-MM'); 
    }

    if (!grouped[key]) grouped[key] = { sum: 0, count: 0, dateObj: groupDate };
    const val = Number(point.value);
    if (!isNaN(val)) {
        grouped[key].sum += val;
        grouped[key].count += 1;
    }
  });

  return Object.values(grouped)
    .map((group) => ({ 
        time: group.dateObj.toISOString(), 
        value: group.sum / group.count 
    }))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
};

const HistoryChart = () => {
  const [selectedParam, setSelectedParam] = useState('Suhu (°C)');
  const [timeRange, setTimeRange] = useState('1D'); // Default 1 Hari (Stockbit biasanya default 1D)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeData, setActiveData] = useState<SensorDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState('Suhu');
  const [currentUnit, setCurrentUnit] = useState('°C');

  // Logic Fetch dengan Kalkulasi Tanggal di Frontend (Biar Backend Gak Bingung)
  const fetchAndProcessData = async () => {
    setIsLoading(true);
    try {
        let query = 'limit=31536000'; // Limit gede buat data detail
        const now = new Date();
        let start: Date | null = null;
        let end: Date = now;

        // Hitung Start Date berdasarkan Tombol
        switch (timeRange) {
            case '1D': start = subDays(now, 1); break;
            case '1W': start = subWeeks(now, 1); break;
            case '1M': start = subMonths(now, 1); break;
            case '3M': start = subMonths(now, 3); break;
            case 'YTD': start = startOfYear(now); break;
            case '1Y': start = subYears(now, 1); break;
            case 'Custom': 
                if (startDate && endDate) {
                    start = new Date(startDate);
                    end = new Date(endDate);
                }
                break;
            case 'Latest':
                query = 'limit=100'; // Latest pake limit aja
                break;
        }

        // Kalau bukan Latest, dan start valid, kita kirim start & end ke API
        if (timeRange !== 'Latest' && start) {
            query = `start=${start.toISOString()}&end=${end.toISOString()}`;
        }

        // Fetch
        const res = await fetch(`http://localhost:3001/api/history?${query}`);
        if (!res.ok) throw new Error('Network error');
        const rawData = await res.json();

        // Mapping Field
        const mapParamToField = (item: any) => {
            switch (selectedParam) {
                case 'Suhu (°C)': return item.temperature;
                case 'Kelembapan (%RH)': return item.humidity;
                case 'Cahaya (lux)': return item.lux;
                case 'Kebisingan (dB)': return item.noise; 
                case 'Gas/Asap (ppm)': return item.mq2_adc;
                case 'Getaran (m/s²)': return item.vibration;
                case 'Deteksi Api/UV (Status)': return item.uv_status;
                default: return 0;
            }
        };

        const rawValues = rawData.map((d: any) => ({ 
            time: d.createdAt, 
            value: mapParamToField(d) 
        }));

        // Agregasi
        const aggregated = aggregateData(rawValues, timeRange, startDate, endDate);
        setActiveData(aggregated);

    } catch (err) {
        console.error("Gagal fetch:", err);
        setActiveData([]);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { fetchAndProcessData(); }, [timeRange, selectedParam]); 

  useEffect(() => {
    if (selectedParam.includes('Suhu')) { setCurrentLabel('Suhu'); setCurrentUnit('°C'); }
    else if (selectedParam.includes('Kelembapan')) { setCurrentLabel('Kelembapan'); setCurrentUnit('%RH'); }
    else if (selectedParam.includes('Cahaya')) { setCurrentLabel('Cahaya'); setCurrentUnit('lux'); }
    else if (selectedParam.includes('Gas')) { setCurrentLabel('Gas'); setCurrentUnit('ppm'); }
    else if (selectedParam.includes('Kebisingan')) { setCurrentLabel('Kebisingan'); setCurrentUnit(''); }
    else if (selectedParam.includes('Getaran')) { setCurrentLabel('Getaran'); setCurrentUnit(''); }
    else if (selectedParam.includes('UV')) { setCurrentLabel('Api/UV'); setCurrentUnit(''); }
  }, [selectedParam]);

  // === HELPER UNIT SUMBU X ===
  const getChartUnit = () => {
    if (timeRange === '1D' || timeRange === 'Latest') return 'minute';
    if (timeRange === '1W') return 'hour';
    if (['1M', '3M', 'YTD'].includes(timeRange)) return 'day';
    if (timeRange === '1Y') return 'month'; 
    
    if (timeRange === 'Custom' && startDate && endDate) {
        const diffDays = differenceInDays(new Date(endDate), new Date(startDate));
        if (diffDays <= 1) return 'hour';
        if (diffDays <= 90) return 'day';
        return 'month';
    }
    return 'day'; 
  };

  const chartData = {
    labels: activeData.map(d => d.time),
    datasets: [{
      label: `${currentLabel} ${currentUnit}`,
      data: activeData.map(d => ({ x: d.time, y: d.value })),
      borderColor: '#3b82f6',
      backgroundColor: (context: any) => {
        const ctx = context.chart.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
        return gradient;
      },
      fill: true,
      borderWidth: 2,
      tension: 0.1, // Garis agak tajam (bukan curve banget)

      // Stockbit Style: Titik hilang, muncul pas hover
      pointRadius: 0,
      pointHitRadius: 20, // Area hover luas
      pointHoverRadius: 6,
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderColor: '#3b82f6',
      pointHoverBorderWidth: 2,
    }]
  };

  const minTime = timeRange === 'Custom' && startDate ? new Date(startDate).getTime() : undefined;
  const maxTime = timeRange === 'Custom' && endDate ? new Date(endDate).getTime() : undefined;

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { 
        mode: 'index',  // Crosshair vertical line
        intersect: false,
        axis: 'x'
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#475569',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
           title: (ctx: any) => {
             const d = new Date(ctx[0].parsed.x);
             // Tooltip selalu lengkap tanggal & jam
             return format(d, 'dd MMM yyyy, HH:mm', { locale: id });
           },
           label: (context: any) => {
             let label = '';
             const val = context.parsed.y;
             if (val !== null) {
                if (currentLabel === 'Api/UV') {
                    label = `Status: ${val > 0.1 ? 'TERDETEKSI' : 'Aman'}`;
                } else if (currentLabel === 'Kebisingan') {
                    label = `Status: ${val > 0.1 ? 'Bising' : 'Normal'}`;
                } else if (currentLabel === 'Getaran') {
                    label = `Status: ${val > 0.1 ? 'Bergetar' : 'Stabil'}`;
                } else {
                    const fmtVal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val);
                    label = `${currentLabel}: ${fmtVal} ${currentUnit}`;
                }
             }
             return label;
           }
        }
      },
      zoom: { pan: { enabled: false }, zoom: { enabled: false } }
    },
    scales: {
      x: {
        type: 'time',
        time: {
           unit: getChartUnit(), 
           tooltipFormat: 'dd MMM HH:mm',
           displayFormats: { 
               minute: 'HH:mm', 
               hour: 'HH:mm', 
               day: 'dd MMM', 
               month: 'MMM yy' 
           }
        },
        grid: { display: false }, // Hapus Grid Vertikal
        ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        min: minTime,
        max: maxTime,
      },
      y: { 
        position: 'right', // Sumbu Y di Kanan
        grid: { color: 'rgba(255,255,255,0.05)' }, // Grid tipis banget
        ticks: { color: '#94a3b8' } 
      }
    }
  };

  return (
    <div style={{ backgroundColor: '#1e2b3b', borderRadius: '16px', padding: '20px', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#e2e8f0', fontWeight: 600 }}>
             {currentLabel} {currentUnit ? `(${currentUnit})` : ''}
            </h3>
            <select
                value={selectedParam}
                onChange={(e) => setSelectedParam(e.target.value)}
                style={{ backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.9rem' }}
            >
                <option>Suhu (°C)</option>
                <option>Kelembapan (%RH)</option>
                <option>Cahaya (lux)</option>
                <option>Kebisingan (dB)</option>
                <option>Gas/Asap (ppm)</option>
                <option>Getaran (m/s²)</option>
                <option>Deteksi Api/UV (Status)</option>
            </select>
        </div>

        {/* Tombol Filter Waktu*/}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
            {['Latest', '1D', '1W', '1M', '3M', 'YTD', '1Y', 'Custom'].map((range) => (
                <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    style={{
                        backgroundColor: timeRange === range ? '#3b82f6' : 'transparent',
                        color: timeRange === range ? '#ffffff' : '#94a3b8',
                        border: 'none', borderRadius: '6px', padding: '6px 12px',
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                        transition: 'all 0.2s'
                    }}
                >
                    {range}
                </button>
            ))}
        </div>

        {/* Input Custom Date */}
        {timeRange === 'Custom' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#0f172a', padding: '10px', borderRadius: '8px', flexWrap: 'wrap', marginTop: '-5px' }}>
                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ backgroundColor: '#334155', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '5px' }} />
                <span style={{ color: '#94a3b8' }}>-</span>
                <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ backgroundColor: '#334155', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '5px' }} />
                <button onClick={fetchAndProcessData} style={{ backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 15px', cursor: 'pointer', fontWeight: 'bold' }}>GO</button>
            </div>
        )}
      </div>

      <div style={{ flexGrow: 1, position: 'relative' }}>
        {isLoading ? ( <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: '80px' }}>Memuat data...</div> ) : ( <Line data={chartData} options={options} /> )}
      </div>
    </div>
  );
};

export default HistoryChart;