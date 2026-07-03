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

  try {
    const body = await request.json();
    
    // Log the received data in the console for verification
    console.log("-----------------------------------------");
    console.log(`[${new Date().toISOString()}] Received Sensor Data:`, JSON.stringify(body, null, 2));
    console.log("-----------------------------------------");

    // Extract common fields for soil humidity and weather
    const { deviceId, humidity, moisture, temperature } = body;

    // You can process the data here (e.g. save to database)
    // For now, we will return the received data in the response body.
    return NextResponse.json({
      success: true,
      message: "Sensor data received successfully",
      data: {
        deviceId: deviceId || "ESP32-Default",
        humidity: typeof humidity === "number" ? humidity : null,
        moisture: typeof moisture === "number" ? moisture : null,
        temperature: typeof temperature === "number" ? temperature : null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body format" },
      { status: 400 }
    );
  }
}
