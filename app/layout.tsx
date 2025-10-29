export const metadata = {
  title: 'Realtime Sensors',
  description: 'MQTT WebSocket dashboard hosted on Vercel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
