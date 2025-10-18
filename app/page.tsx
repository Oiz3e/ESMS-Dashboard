import dynamic from 'next/dynamic';

const MqttCards = dynamic(() => import('./components/MqttCards'), { ssr: false });

export default function Page() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16 }}>Realtime Sensor Dashboard</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>
        Broker WS: {process.env.NEXT_PUBLIC_MQTT_WS_URL}
      </p>
      <MqttCards />
    </main>
  );
}
