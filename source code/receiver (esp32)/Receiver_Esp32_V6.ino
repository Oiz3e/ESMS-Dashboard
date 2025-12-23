#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <mcp2515.h>
#include <time.h>

// ================= CAN =================
#define CAN_CS   5
#define CAN_MOSI 23
#define CAN_MISO 19
#define CAN_SCK  18

// ================= WIFI & MQTT =================
const char* ssid = "Marlintoed";
const char* password = "Marlino123!!";
const char* mqtt_server = "172.20.10.2";
const int mqtt_port = 1883;

// ================= DEVICE =================
const char* DEVICE_ID = "esp32_01";

// ================= OBJECT =================
WiFiClient espClient;
PubSubClient client(espClient);
MCP2515 mcp2515(CAN_CS);
struct can_frame canMsg;

// ================= TIME =================
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 7 * 3600;
const int daylightOffset_sec = 0;

// ================= SENSOR CACHE =================
float lux = NAN;
float temperature = NAN;
float humidity = NAN;
uint16_t mq2_adc = 0;
uint8_t sound = 0;
uint8_t vibration = 0;
uint8_t uv = 0;

// ================= WIFI =================
void setup_wifi() {
  Serial.print("Connecting WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

// ================= MQTT =================
void reconnect_mqtt() {
  while (!client.connected()) {
    if (client.connect(DEVICE_ID)) {
      Serial.println("MQTT connected");
    } else {
      delay(3000);
    }
  }
}

long getTimestamp() {
  time_t now;
  time(&now);
  return (long)now;
}

void publishCombinedPayload() {
  if (isnan(lux) || isnan(temperature) || isnan(humidity)) return;

  char payload[300];
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
    "\"timestamp\":%ld"
    "}",
    DEVICE_ID, lux, temperature, humidity,
    mq2_adc, sound, vibration, uv,
    getTimestamp()
  );

  client.publish("bems/raw/sensor", payload);
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  SPI.begin(CAN_SCK, CAN_MISO, CAN_MOSI, CAN_CS);
  mcp2515.reset();
  mcp2515.setBitrate(CAN_500KBPS, MCP_8MHZ);
  mcp2515.setNormalMode();

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  Serial.println("ESP32 CAN Receiver Unified Payload Ready");
}

void loop() {
  if (!client.connected()) reconnect_mqtt();
  client.loop();

  if (mcp2515.readMessage(&canMsg) == MCP2515::ERROR_OK) {

    // --- ID 0x12 (LUX) ---
    if (canMsg.can_id == 0x12 && canMsg.can_dlc == 4) {
      memcpy(&lux, canMsg.data, 4);
    }
    // --- ID 0x13 (TEMP/HUM) ---
    else if (canMsg.can_id == 0x13 && canMsg.can_dlc == 8) {
      memcpy(&temperature, canMsg.data, 4);
      memcpy(&humidity, canMsg.data + 4, 4);
    }
    // --- ID 0x14 (GAS/SOUND/VIB/UV) ---
    else if (canMsg.can_id == 0x14 && canMsg.can_dlc == 5) {
      memcpy(&mq2_adc, canMsg.data, 2);
      sound = canMsg.data[2];
      vibration = canMsg.data[3];
      uv = canMsg.data[4];

      // PINDAHKAN FUNGSI PUBLISH KE SINI
      publishCombinedPayload(); 
    }
    
    // HAPUS publishCombinedPayload() DARI SINI
  }
}