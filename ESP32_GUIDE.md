# Panduan Integrasi ESP32 ke Next.js API

Dokumen ini berisi penjelasan cara menghubungkan sensor ESP32 ke API endpoint Next.js yang telah terproteksi token.

## 1. Konfigurasi Endpoint & Token
- **Token API (di env):** `my-super-secret-esp32-token-2026` (bisa diubah di file `.env` pada root project Next.js).
- **Endpoint URL:** 
  - Lokal: `http://<IP_LAPTOP_KAMU>:3000/api/sensor`
  - Production: `https://<domain-kamu>.vercel.app/api/sensor`

## 2. Cara Test Menggunakan cURL
Kamu bisa menguji endpoint ini terlebih dahulu dari terminal laptop/PC kamu:

### A. Test GET (Mengecek Status API)
```bash
curl -X GET "http://localhost:3000/api/sensor" \
  -H "x-api-token: my-super-secret-esp32-token-2026"
```
**Response sukses (200 OK):**
```json
{
  "success": true,
  "message": "ESP32 Sensor API is online and authenticated.",
  "timestamp": "2026-07-03T07:15:30.000Z"
}
```

### B. Test POST (Mengirim Data Sensor)
```bash
curl -X POST "http://localhost:3000/api/sensor" \
  -H "Content-Type: application/json" \
  -H "x-api-token: my-super-secret-esp32-token-2026" \
  -d '{
    "deviceId": "ESP32-Soil-01",
    "humidity": 65.5,
    "moisture": 720,
    "temperature": 27.8
  }'
```
**Response sukses (200 OK):**
```json
{
  "success": true,
  "message": "Sensor data received successfully",
  "data": {
    "deviceId": "ESP32-Soil-01",
    "humidity": 65.5,
    "moisture": 720,
    "temperature": 27.8,
    "timestamp": "2026-07-03T07:16:00.000Z"
  }
}
```

---

## 3. Contoh Kode Arduino/C++ untuk ESP32
Berikut adalah kode lengkap untuk ESP32 menggunakan library `WiFi.h`, `HTTPClient.h`, dan `ArduinoJson.h` (pastikan kamu sudah menginstal library **ArduinoJson** dari Library Manager di Arduino IDE).

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Membutuhkan library ArduinoJson (v6 atau v7)

// ----------------------------------------------------
// KONFIGURASI WIFI & API
// ----------------------------------------------------
const char* ssid = "SSID_WIFI_KAMU";           // Ganti dengan nama WiFi kamu
const char* password = "PASSWORD_WIFI_KAMU";   // Ganti dengan password WiFi kamu

// Gunakan alamat IP laptop/PC kamu jika menjalankan Next.js secara lokal.
// Jangan gunakan 'localhost' karena ESP32 adalah perangkat terpisah.
const char* serverUrl = "http://192.168.1.100:3000/api/sensor"; // Ganti IP sesuai IP laptop kamu
const char* apiToken = "my-super-secret-esp32-token-2026";       // Token yang sama dengan di file .env

// Pin sensor kelembapan tanah (Analog Pin)
const int soilPin = 34; 

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Konek ke WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    // Mulai koneksi HTTP ke URL server
    http.begin(serverUrl);

    // Set Header wajib
    http.addHeader("Content-Type", "application/json");
    // Token validasi bisa dikirim lewat header "x-api-token"
    http.addHeader("x-api-token", apiToken);
    
    // Atau alternatifnya lewat Header Authorization Bearer:
    // String authHeader = "Bearer " + String(apiToken);
    // http.addHeader("Authorization", authHeader);

    // Membaca nilai dari sensor kelembapan tanah
    int rawMoisture = analogRead(soilPin);
    
    // Konversi nilai analog ke persen kelembapan (sesuaikan dengan kalibrasi sensor kamu)
    // Contoh: sensor output 4095 saat kering sekali, 1500 saat sangat basah
    float humidityPercent = map(rawMoisture, 4095, 1500, 0, 100);
    humidityPercent = constrain(humidityPercent, 0, 100);

    // Dummy temperatur (bisa diganti dengan data sensor asli seperti DHT11/DHT22 jika ada)
    float temperature = 28.5;

    // Membuat JSON document
    StaticJsonDocument<200> doc;
    doc["deviceId"] = "ESP32-Soil-Sensor-01";
    doc["humidity"] = humidityPercent;
    doc["moisture"] = rawMoisture;
    doc["temperature"] = temperature;

    // Serialisasikan JSON ke string
    String requestBody;
    serializeJson(doc, requestBody);

    Serial.println("Sending data: " + requestBody);

    // Melakukan HTTP POST request
    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("HTTP Response Code: ");
      Serial.println(httpResponseCode);
      Serial.print("Response: ");
      Serial.println(response);
    } else {
      Serial.print("Error on sending POST request: ");
      Serial.println(httpResponseCode);
    }

    // Akhiri sesi HTTP
    http.end();
  } else {
    Serial.println("WiFi Disconnected. Reconnecting...");
    WiFi.begin(ssid, password);
  }

  // Kirim data setiap 10 detik (silakan sesuaikan kebutuhan)
  delay(10000);
}
```

## 4. Keunggulan Desain Token Ini
Endpoint ini menggunakan sistem **multi-source validation**, artinya ESP32 kamu bisa mengirimkan token lewat salah satu dari 3 cara berikut:
1. **Custom Header (`x-api-token`)**: Sangat direkomendasikan dan paling mudah di-set di library HTTPClient ESP32.
2. **Authorization Header (`Authorization: Bearer <token>`)**: Standar industri untuk REST API.
3. **Query Parameter (`?token=<token>`)**: Berguna jika kamu ingin melakukan testing cepat langsung dari browser.
