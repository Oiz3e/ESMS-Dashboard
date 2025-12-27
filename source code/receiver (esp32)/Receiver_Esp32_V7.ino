/*
 * RECEIVER_ESP32_RTT_CALC.ino
 * Role: CANBus Master (Requestor)
 * Logic: Timestamp disesuaikan dengan (RTT / 2)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <mcp2515.h>
#include <time.h>

// ================= KONFIGURASI PIN =================
#define CAN_CS   5
#define CAN_MOSI 23
#define CAN_MISO 19
#define CAN_SCK  18

// ================= KONFIGURASI WIFI & MQTT =================
const char* ssid = "Marlintoed";          // GANTI DENGAN WIFI KAMU
const char* password = "Marlino123!!";    // GANTI PASSWORD
const char* mqtt_server = "192.168.1.10"; // GANTI IP SERVER/LAPTOP
const int mqtt_port = 1883;

// ================= DEVICE & WAKTU =================
const char* DEVICE_ID = "esp32_01";
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 7 * 3600; // WIB (GMT+7)
const int daylightOffset_sec = 0;

// ================= OBJEK =================
WiFiClient espClient;
PubSubClient client(espClient);
MCP2515 mcp2515(CAN_CS);
struct can_frame canMsg;

// ================= VARIABEL DATA SENSOR =================
float lux = NAN;
float temp = NAN;
float hum = NAN;
uint16_t mq2_adc = 0;
uint8_t sound = 0;
uint8_t vibration = 0;
uint8_t uv = 0;

// ================= VARIABEL RTT & TIMING =================
unsigned long lastRequestTime = 0;
const long interval = 1000;         // Interval Request 1 Hz (1000ms)
unsigned long requestStartMicros = 0; // Waktu mulai request (mikrodetik)
float rtt_latency = 0.0;            // Latensi (ms)

// ================= FUNGSI WIFI =================
void setup_wifi() {
  delay(10);
  Serial.print("Connecting to "); Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void reconnect_mqtt() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32_Gateway")) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc="); Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  // Init CAN
  SPI.begin(CAN_SCK, CAN_MISO, CAN_MOSI, CAN_CS);
  mcp2515.reset();
  mcp2515.setBitrate(CAN_500KBPS, MCP_8MHZ);
  mcp2515.setNormalMode();

  // Init Network
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  
  // Init Time (NTP)
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  Serial.println("=== SYSTEM READY: RTT Based Timestamp ===");
}

// ================= LOOP UTAMA =================
void loop() {
  if (!client.connected()) reconnect_mqtt();
  client.loop();

  unsigned long currentMillis = millis();

  // -----------------------------------------------------------
  // 1. KIRIM REQUEST (INITIATOR) - Setiap 1 Detik
  // -----------------------------------------------------------
  if (currentMillis - lastRequestTime >= interval) {
    lastRequestTime = currentMillis;

    // Siapkan frame Request
    canMsg.can_id = 0x01; // ID Khusus Request
    canMsg.can_dlc = 0;   // Tidak perlu bawa data

    // CATAT WAKTU MULAI (Titik t1)
    requestStartMicros = micros(); 

    mcp2515.sendMessage(&canMsg);
    // Serial.println(">> Request Sent");
  }

  // -----------------------------------------------------------
  // 2. TERIMA RESPONSE DARI ARDUINO
  // -----------------------------------------------------------
  if (mcp2515.readMessage(&canMsg) == MCP2515::ERROR_OK) {
    
    // Frame 1: Lux
    if (canMsg.can_id == 0x12) {
      memcpy(&lux, canMsg.data, 4);
    }
    // Frame 2: Suhu & Lembab
    else if (canMsg.can_id == 0x13) {
      memcpy(&temp, canMsg.data, 4);
      memcpy(&hum, canMsg.data + 4, 4);
    }
    // Frame 3: Data Lainnya (Penanda Akhir)
    else if (canMsg.can_id == 0x14) {
      memcpy(&mq2_adc, canMsg.data, 2);
      sound = canMsg.data[2];
      vibration = canMsg.data[3];
      uv = canMsg.data[4];

      // CATAT WAKTU SELESAI (Titik t4)
      unsigned long endMicros = micros();
      
      // HITUNG RTT (Round Trip Time) dalam milidetik
      // Rumus: (Waktu Terima - Waktu Kirim)
      rtt_latency = (endMicros - requestStartMicros) / 1000.0;

      // PROSES DATA & KIRIM JSON
      processAndPublish();
    }
  }
}

// ================= LOGIKA HITUNG TIMESTAMP & JSON =================
void processAndPublish() {
  // Filter Data Error (NaN)
  if (isnan(lux) || isnan(temp) || isnan(hum)) return;

  // 1. Ambil Waktu NTP Saat Ini (Detik)
  time_t now;
  time(&now);
  long currentEpoch = (long)now;

  // 2. Koreksi Timestamp Berdasarkan RTT
  // Rumus: Waktu Sensor = Waktu Sekarang - (Latensi / 2)
  // Karena Epoch dalam DETIK, kita konversi latensi (ms) ke detik
  long correctionSeconds = (long)(rtt_latency / 2000.0); // dibagi 2, lalu dibagi 1000
  long sensorTimestamp = currentEpoch - correctionSeconds;

  // 3. Buat JSON Payload
  char payload[350];
  snprintf(payload, sizeof(payload),
    "{"
    "\"device_id\":\"%s\","
    "\"lux\":%.2f,"
    "\"temperature\":%.2f,"
    "\"humidity\":%.2f,"
    "\"mq2_adc\":%u,"
    "\"sound\":%u,"
    "\"vibration\":%u,"
    "\"uv\":%u,"
    "\"latency_ms\":%.2f,"     // Menampilkan nilai RTT asli
    "\"timestamp\":%ld"        // Timestamp hasil koreksi
    "}",
    DEVICE_ID, 
    lux, temp, hum,
    mq2_adc, sound, vibration, uv,
    rtt_latency,       
    sensorTimestamp 
  );

  // 4. Kirim ke MQTT Broker
  client.publish("bems/raw/sensor", payload);
  
  // Debug di Serial Monitor
  Serial.print("RTT: "); Serial.print(rtt_latency); Serial.print("ms | ");
  Serial.print("Time Adjusted: "); Serial.println(sensorTimestamp);
  Serial.println(payload);
}