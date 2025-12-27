/*
 * TRANSMITTER_MEGA_REQ_RESP.ino
 * Role: CANBus Slave (Menunggu Request)
 * Board: Arduino Mega 2560
 */

#include <Wire.h>
#include <BH1750.h>
#include <SPI.h>
#include <mcp2515.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ================= KONFIGURASI PIN =================
#define CAN_CS            53   // CS Pin untuk MCP2515 di Mega
#define DHTPIN            7    // Pin Data DHT11
#define DHTTYPE           DHT11
#define MQ2_PIN           A1   // Pin Analog Sensor Gas
#define LM393_PIN         2    // Pin Digital Sensor Suara
#define UV_SENSOR_PIN     A0   // Pin Analog Sensor Api/UV

// Threshold Trigger
#define UV_FIRE_THRESHOLD 300  // Nilai ADC triggernya api (sesuaikan kalibrasi)
#define VIB_THRESHOLD     10.5 // m/s^2 (Gravitasi ~9.8, jadi >10.5 dianggap getaran)

// ================= OBJEK =================
BH1750 lightMeter;
DHT dht(DHTPIN, DHTTYPE);
MCP2515 mcp2515(CAN_CS);
Adafruit_MPU6050 mpu;
struct can_frame canMsg;

// ================= VARIABEL DATA =================
float lux = 0;
float temp = 0;
float hum = 0;
uint16_t mq2_val = 0;
uint8_t sound_status = 0;
uint8_t vib_status = 0;
uint8_t uv_status = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  
  // 1. Init Sensor Cahaya
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 Init OK");
  } else {
    Serial.println("Error init BH1750");
  }

  // 2. Init DHT
  dht.begin();

  // 3. Init MPU6050 (Getaran)
  if (!mpu.begin()) {
    Serial.println("MPU6050 Not Found!");
  } else {
    Serial.println("MPU6050 Init OK");
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  // 4. Init Pin Lain
  pinMode(MQ2_PIN, INPUT);
  pinMode(LM393_PIN, INPUT);
  pinMode(UV_SENSOR_PIN, INPUT);

  // 5. Init CANBus
  SPI.begin();
  mcp2515.reset();
  mcp2515.setBitrate(CAN_500KBPS, MCP_8MHZ); // Pastikan kristal 8MHz
  mcp2515.setNormalMode();

  Serial.println("=== ARDUINO MEGA READY (WAITING FOR REQUEST ID 0x01) ===");
}

void loop() {
  // Cek apakah ada pesan masuk
  if (mcp2515.readMessage(&canMsg) == MCP2515::ERROR_OK) {
    
    // HANYA merespon jika ID-nya 0x01 (Request dari ESP32)
    if (canMsg.can_id == 0x01) {
       Serial.println(">> Request Received! Reading sensors...");
       
       readAllSensors(); // 1. Baca Sensor Terbaru
       sendDataBurst();  // 2. Kirim Balasan 3 Frame
    }
  }
}

void readAllSensors() {
  // --- Baca Lux ---
  lux = lightMeter.readLightLevel();
  if (isnan(lux)) lux = 0;

  // --- Baca Temp & Hum ---
  temp = dht.readTemperature();
  hum = dht.readHumidity();
  // Cegah NaN merusak data
  if (isnan(temp)) temp = 0;
  if (isnan(hum)) hum = 0;

  // --- Baca Analog & Digital ---
  mq2_val = analogRead(MQ2_PIN);
  sound_status = !digitalRead(LM393_PIN); // Sesuaikan logic (HIGH/LOW) sensor kamu
  
  int uv_adc = analogRead(UV_SENSOR_PIN);
  uv_status = (uv_adc > UV_FIRE_THRESHOLD) ? 1 : 0;

  // --- Baca Getaran (MPU6050) ---
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  // Hitung total vektor akselerasi
  float totalAccel = sqrt(sq(a.acceleration.x) + sq(a.acceleration.y) + sq(a.acceleration.z));
  vib_status = (totalAccel > VIB_THRESHOLD) ? 1 : 0; 
}

void sendDataBurst() {
  // --- FRAME 1: LUX (ID 0x12) ---
  canMsg.can_id = 0x12;
  canMsg.can_dlc = 4;
  memcpy(canMsg.data, &lux, 4); // Float 4 byte
  mcp2515.sendMessage(&canMsg);
  delay(2); // Jeda mikro agar buffer aman

  // --- FRAME 2: TEMP & HUM (ID 0x13) ---
  canMsg.can_id = 0x13;
  canMsg.can_dlc = 8;
  memcpy(canMsg.data, &temp, 4);     // Byte 0-3
  memcpy(canMsg.data + 4, &hum, 4);  // Byte 4-7
  mcp2515.sendMessage(&canMsg);
  delay(2);

  // --- FRAME 3: STATUS & GAS (ID 0x14) ---
  canMsg.can_id = 0x14;
  canMsg.can_dlc = 5;
  
  // Pecah uint16_t MQ2 jadi 2 byte
  uint16_t mq2_safe = (uint16_t)mq2_val; 
  memcpy(canMsg.data, &mq2_safe, 2);      // Byte 0-1
  
  canMsg.data[2] = (uint8_t)sound_status; // Byte 2
  canMsg.data[3] = (uint8_t)vib_status;   // Byte 3
  canMsg.data[4] = (uint8_t)uv_status;    // Byte 4
  
  mcp2515.sendMessage(&canMsg);
  
  Serial.println(">> Data Replied (3 Frames)");
}