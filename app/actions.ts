"use server";

export interface SensorReading {
  id: number;
  moisture: string;
  humidity: string | null;
  temperature: string | null;
  created_at?: string; // Optional in case it exists in database
}

export interface SystemLog {
  id: number;
  device_id: string;
  cpu_temperature: string | null;
  hall_magnetic: string | null;
  touch_raw: string | null;
  created_at?: string;
}

export interface MergedSensorData {
  id: number;
  moisture: number;
  humidity: number;
  temperature: number;
  deviceId: string;
  cpuTemperature: number;
  hallMagnetic: number;
  touchRaw: number;
  timestamp: string;
}

export async function fetchDashboardData(): Promise<{
  success: boolean;
  data: MergedSensorData[];
  error?: string;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = 
    process.env.SUPABASE_SECRET_KEY || 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      success: false,
      data: [],
      error: "Supabase configuration is missing in environment variables.",
    };
  }

  try {
    // Fetch latest 1000 sensor records
    const sensorRes = await fetch(
      `${supabaseUrl}/rest/v1/sensor?select=*&order=id.desc&limit=1000`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
        next: { revalidate: 10 }, // Cache for 10 seconds
      }
    );

    // Fetch latest 1000 system logs
    const logsRes = await fetch(
      `${supabaseUrl}/rest/v1/system_logs?select=*&order=id.desc&limit=1000`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
        next: { revalidate: 10 },
      }
    );

    if (!sensorRes.ok) {
      throw new Error(`Failed to fetch sensor data: ${sensorRes.statusText}`);
    }

    const sensors: SensorReading[] = await sensorRes.json();
    const logs: SystemLog[] = logsRes.ok ? await logsRes.json() : [];

    // Map system logs by index or id for merging
    // Since ESP32 inserts to both tables in Promise.all, they should align closely by index or id.
    const merged: MergedSensorData[] = sensors.map((sensor, idx) => {
      // Find corresponding log. Usually, they correspond by position if they were inserted together.
      const log = logs[idx] || {
        device_id: "ESP32-Soil-Sensor-01",
        cpu_temperature: null,
        hall_magnetic: null,
        touch_raw: null,
        created_at: undefined,
      };

      // Determine timestamp: use database's created_at, or log's created_at, or simulate.
      // If neither exists, generate timestamps spaced by 1 minute (or 10 seconds depending on position).
      let timestamp = sensor.created_at || log.created_at;
      if (!timestamp) {
        // ESP32 usually logs every 10 seconds (as seen in ESP32_GUIDE.md delay(10000))
        // So we can simulate from current time backwards:
        const simulatedTime = new Date(Date.now() - idx * 10 * 1000);
        timestamp = simulatedTime.toISOString();
      }

      // Parse values carefully (they are saved as strings in Supabase)
      const moistureRaw = parseFloat(sensor.moisture) || 0;
      // In the Arduino code: float humidityPercent = map(rawMoisture, 4095, 1500, 0, 100);
      // Wait, is moisture stored as the raw analog value (e.g. 1500-4095) or as a mapped percentage?
      // In ESP32_GUIDE.md:
      // doc["moisture"] = rawMoisture; // (e.g. 65 or raw analog)
      // doc["humidity"] = humidityPercent;
      // If moisture is raw analog, let's convert it to a percentage for user display, or show both.
      // We will present moisture as a mapped percentage (0-100%) or raw.
      // Let's assume moisture is stored. We'll show its value, and if it's high (e.g. > 1000),
      // we can also compute/map it to a percentage for beautiful charting, or display it as is.
      // Let's check: if moisture is > 100, it's likely a raw analog value.
      let moisturePercent = moistureRaw;
      if (moistureRaw > 100) {
        // Map 4095 (dry) to 0%, and 1500 (wet) to 100%
        moisturePercent = Math.max(0, Math.min(100, Math.round(((4095 - moistureRaw) / (4095 - 1500)) * 100)));
      }

      return {
        id: Number(sensor.id),
        moisture: moisturePercent, // mapped percentage or raw if already percentage
        humidity: parseFloat(sensor.humidity || "0") || 0,
        temperature: parseFloat(sensor.temperature || "0") || 0,
        deviceId: log.device_id || "ESP32-Soil-Sensor-01",
        cpuTemperature: parseFloat(log.cpu_temperature || "0") || 0,
        hallMagnetic: parseFloat(log.hall_magnetic || "0") || 0,
        touchRaw: parseFloat(log.touch_raw || "0") || 0,
        timestamp,
      };
    });

    // Sort by timestamp ascending (needed for charts)
    // Wait, the client might need chronological order for chart, reverse chronological for table.
    // Let's sort ascending for the graph. The table can reverse it in the client component.
    const sorted = merged.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      success: true,
      data: sorted,
    };
  } catch (error: any) {
    console.error("Error in fetchDashboardData Server Action:", error);
    return {
      success: false,
      data: [],
      error: error.message || "An unexpected error occurred.",
    };
  }
}
