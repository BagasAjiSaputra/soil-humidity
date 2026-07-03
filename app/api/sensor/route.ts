import { NextRequest, NextResponse } from "next/server";

// Helper function to extract and validate the token
function validateToken(request: NextRequest): boolean {
  const expectedToken = process.env.SENSOR_API_TOKEN;
  
  if (!expectedToken) {
    console.error("Warning: SENSOR_API_TOKEN is not configured in env variables.");
    return false;
  }

  // Extract token from multiple possible sources:
  // 1. Authorization header: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (token === expectedToken) return true;
  }

  // 2. Custom header: x-api-token
  const customHeader = request.headers.get("x-api-token");
  if (customHeader === expectedToken) return true;

  // 3. Query parameter: ?token=<token>
  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken === expectedToken) return true;

  return false;
}

/**
 * GET Handler - Check if API is online and verify connection
 */
export async function GET(request: NextRequest) {
  if (!validateToken(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid or missing token" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "ESP32 Sensor API is online and authenticated.",
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST Handler - Receive soil humidity and other sensor data from ESP32
 */
export async function POST(request: NextRequest) {
  if (!validateToken(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid or missing token" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prioritize Secret/Service Role Key if it exists in .env, fallback to Publishable key
  const supabaseKey = 
    process.env.SUPABASE_SECRET_KEY || 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Database configuration missing in environment variables.");
    return NextResponse.json(
      { success: false, error: "Database configuration (Supabase) is missing in .env" },
      { status: 500 }
    );
  }

  // Parse JSON Body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body format" },
      { status: 400 }
    );
  }

  try {
    // Log the received data in the console for verification
    console.log("-----------------------------------------");
    console.log(`[${new Date().toISOString()}] Received Sensor Data:`, JSON.stringify(body, null, 2));
    console.log("-----------------------------------------");

    // Extract fields
    const { 
      moisture, 
      humidity, 
      temperature, 
      deviceId, 
      cpuTemperature, 
      hallMagnetic, 
      touchRaw 
    } = body;

    // Validate moisture (must not be empty since it is NOT NULL in database)
    if (moisture === undefined || moisture === null) {
      return NextResponse.json(
        { success: false, error: "Field 'moisture' is required and cannot be null" },
        { status: 400 }
      );
    }

    // Insert into 'sensor' table promise
    const sensorInsertPromise = fetch(`${supabaseUrl}/rest/v1/sensor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=representation", // Request return of inserted row
      },
      body: JSON.stringify({
        moisture: String(moisture),
        humidity: humidity !== undefined && humidity !== null ? String(humidity) : null,
        temperature: temperature !== undefined && temperature !== null ? String(temperature) : null,
      }),
    });

    // Insert into 'system_logs' table promise
    const systemLogsInsertPromise = fetch(`${supabaseUrl}/rest/v1/system_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "return=representation", // Request return of inserted row
      },
      body: JSON.stringify({
        device_id: deviceId || "ESP32-Default",
        cpu_temperature: cpuTemperature !== undefined && cpuTemperature !== null ? String(cpuTemperature) : null,
        hall_magnetic: hallMagnetic !== undefined && hallMagnetic !== null ? String(hallMagnetic) : null,
        touch_raw: touchRaw !== undefined && touchRaw !== null ? String(touchRaw) : null,
      }),
    });

    // Execute insertions concurrently
    const [sensorRes, systemLogRes] = await Promise.all([
      sensorInsertPromise,
      systemLogsInsertPromise,
    ]);

    // Handle sensor insert failure
    if (!sensorRes.ok) {
      const errorText = await sensorRes.text();
      console.error("Supabase Sensor Table Insert Error:", errorText);
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to save sensor data to 'sensor' table", 
          details: errorText 
        },
        { status: sensorRes.status }
      );
    }

    // Handle system logs insert failure
    if (!systemLogRes.ok) {
      const errorText = await systemLogRes.text();
      console.error("Supabase System Logs Table Insert Error:", errorText);
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to save system logs to 'system_logs' table", 
          details: errorText 
        },
        { status: systemLogRes.status }
      );
    }

    const sensorDataRows = await sensorRes.json();
    const systemLogRows = await systemLogRes.json();

    return NextResponse.json({
      success: true,
      message: "Sensor and system log data saved successfully",
      sensorData: sensorDataRows[0] || null,
      systemLogData: systemLogRows[0] || null,
    });
  } catch (error) {
    console.error("Unexpected server error in POST handler:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error occurred", details: String(error) },
      { status: 500 }
    );
  }
}
