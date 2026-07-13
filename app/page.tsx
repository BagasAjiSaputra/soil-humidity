import { Metadata } from "next";
import { fetchDashboardData } from "./actions";
import Dashboard from "./components/dashboard";

// Force dynamic rendering to ensure fresh data is always fetched
export const dynamic = "force-dynamic";

// SEO Metadata for the dashboard home page
export const metadata: Metadata = {
  title: "ESP32 Soil Moisture & Climate Telemetry",
  description: "Real-time soil humidity, air temperature, and air humidity monitor telemetry dashboard fetched via Supabase database.",
  keywords: ["ESP32", "Soil Moisture", "Humidity", "Temperature", "Supabase", "IoT", "Telemetry"],
  authors: [{ name: "Soil Humidity Monitor System" }],
};

export default async function Home() {
  const result = await fetchDashboardData();
  
  // Hand over data (or fallback empty array) to the interactive Client Dashboard
  const initialData = result.success ? result.data : [];

  return (
    <div className="flex-1 flex flex-col bg-[#070b0d]">
      <main className="flex-1 flex flex-col">
        <Dashboard initialData={initialData} />
      </main>
    </div>
  );
}
