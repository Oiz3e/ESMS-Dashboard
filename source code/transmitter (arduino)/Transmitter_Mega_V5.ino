#include <Wire.h>
#include <BH1750.h>
#include <SPI.h>
#include <mcp2515.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

// === DEFINISI PIN & TIPE ===
#define CAN_CS            53
#define DHTPIN            7
#define DHTTYPE           DHT11
#define MQ2_PIN           A1
#define LM393_PIN         2       // Sound sensor
#define UV_SENSOR_PIN     A0      // GUVA-S12SD (Analog)

// <-- BARU: Tentukan threshold ADC untuk deteksi api
// Sesuaikan nilai '300' ini berdasarkan pengujian Anda
#define UV_FIRE_THRESHOLD 20

// === INISIALISASI OBJEK ===
BH1750 lightMeter;
DHT dht(DHTPIN, DHTTYPE);
MCP2515 mcp2515(CAN_CS);
Adafruit_MPU6050 mpu;
struct can_frame canMsg;

// === VARIABEL SENSOR ===
int mq2_value_adc;
int lm393_status;       // 0 (LOW/QUIET) atau 1 (HIGH/LOUD)
int vibration_status = 0; // 0 (STABLE) atau 1 (MOVING)
int uv_status = 0;      // <-- BARU: 0 (SAFE) atau 1 (FIRE)

// === VARIABEL KHUSUS MPU6050 (GETARAN) ===
const float VIBRATION_THRESHOLD = 1; // semakin besar = makin tidak sensitif
float prevAx = 0.0, prevAy = 0.0, prevAz = 0.0;
bool firstReading = true;

void setup() {
  Serial.begin(9600);
  Wire.begin();

  pinMode(LM393_PIN, INPUT);
  // Tidak perlu pinMode untuk input analog

  lightMeter.begin();
  dht.begin();

  if (!mpu.begin()) {
    Serial.println("❌ MPU6050 Failed! Check wiring.");
    while (1);
  }
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  SPI.begin();
  mcp2515.reset();
  mcp2515.setBitrate(CAN_500KBPS, MCP_8MHZ);
  mcp2515.setNormalMode();

  Serial.println("=== ✅ CAN Transmitter Node Ready (with UV Status Threshold) ===");
}

void loop() {
  // === 1. MPU6050: Deteksi Getaran ===
  sensors_event_t a, g, temp_mpu;
  mpu.getEvent(&a, &g, &temp_mpu);

  float ax = a.acceleration.x;
  float ay = a.acceleration.y;
  float az = a.acceleration.z;

  if (firstReading) {
    prevAx = ax; prevAy = ay; prevAz = az;
    firstReading = false;
  } else {
    float vibrationValue = abs(ax - prevAx) + abs(ay - prevAy) + abs(az - prevAz);
    vibration_status = (vibrationValue > VIBRATION_THRESHOLD) ? 1 : 0;
    prevAx = ax; prevAy = ay; prevAz = az;
  }

  // === 2. Baca sensor lingkungan ===
  float lux = lightMeter.readLightLevel();
  float dht_temp = dht.readTemperature();
  float dht_hum = dht.readHumidity();
  mq2_value_adc = analogRead(MQ2_PIN);
  lm393_status = !digitalRead(LM393_PIN);    // 1 = loud
  
  // <-- LOGIKA BARU: Baca ADC UV dan terapkan threshold
  int uv_value_adc = analogRead(UV_SENSOR_PIN); 
  uv_status = (uv_value_adc > UV_FIRE_THRESHOLD) ? 1 : 0;

  if (isnan(dht_temp) || isnan(dht_hum)) {
    Serial.println("❌ DHT11 Error");
    delay(100);
    return;
  }

  // --- PESAN 1: LUX (ID 0x12) ---
  canMsg.can_id = 0x12;
  canMsg.can_dlc = 4;
  memcpy(canMsg.data, &lux, 4);
  mcp2515.sendMessage(&canMsg);
  delay(10);

  // --- PESAN 2: TEMP & HUM (ID 0x13) ---
  canMsg.can_id = 0x13;
  canMsg.can_dlc = 8;
  memcpy(canMsg.data, &dht_temp, 4);
  memcpy(canMsg.data + 4, &dht_hum, 4);
  mcp2515.sendMessage(&canMsg);
  delay(10);

  // --- PESAN 3: GAS, SOUND, VIBRATION, UV (ID 0x14) ---
  // Perubahan format (5 bytes):
  // Byte 0-1: MQ2 ADC (uint16_t)
  // Byte 2:   Sound Status (uint8_t)
  // Byte 3:   Vibration Status (uint8_t)
  // Byte 4:   UV Status (0/1) (uint8_t)
  canMsg.can_id = 0x14;
  canMsg.can_dlc = 5; // <-- Diubah dari 6 ke 5
  
  uint16_t mq2_val = (uint16_t)mq2_value_adc;

  memcpy(canMsg.data, &mq2_val, 2);           // Byte 0-1: MQ2
  canMsg.data[2] = (uint8_t)lm393_status;      // Byte 2: Sound
  canMsg.data[3] = (uint8_t)vibration_status; // Byte 3: Vibration
  canMsg.data[4] = (uint8_t)uv_status;        // Byte 4: UV Status (0 atau 1)
  
  mcp2515.sendMessage(&canMsg);

  // === Logging ===
  Serial.println("Sending 3 CAN Msgs (0x12, 0x13, 0x14)");
  Serial.print("  - Lux: "); Serial.println(lux, 2);
  Serial.print("  - Temp: "); Serial.println(dht_temp, 2);
  Serial.print("  - Hum: "); Serial.println(dht_hum, 2);
  Serial.print("  - Gas Concentration: "); Serial.println(mq2_value_adc);
  Serial.print("  - Sound Status: "); Serial.println(lm393_status == 1 ? "LOUD" : "QUIET");
  Serial.print("  - Vibration: "); Serial.println(vibration_status == 1 ? "MOVING" : "STABLE");
  Serial.print("  - UV/Api Status (Raw ADC: "); Serial.print(uv_value_adc); Serial.print("): ");
  Serial.println(uv_status == 1 ? "🔥 FIRE/UV DETECTED" : "SAFE"); // <-- BARU
  Serial.println("---------------------------------");

  delay(1000);
}