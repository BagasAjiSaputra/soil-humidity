"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  RotateCw, 
  Droplet, 
  CloudRain, 
  Thermometer, 
  Cpu, 
  LineChart, 
  Table, 
  Search, 
  X 
} from "lucide-react";
import { MergedSensorData } from "../actions";

interface DashboardProps {
  initialData: MergedSensorData[];
}

type MetricType = "all" | "moisture" | "humidity" | "temperature";
type TimeFilterType = "24h" | "12h" | "6h";

export default function Dashboard({ initialData }: DashboardProps) {
  const router = useRouter();
  const [activeMetric, setActiveMetric] = useState<MetricType>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>("24h");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 350;
  const paddingX = 60;
  const paddingY = 40;

  // Manual refresh logic
  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Filter data based on time filter
  const filteredData = useMemo(() => {
    if (initialData.length === 0) return [];
    
    // Find the latest timestamp in the dataset
    const latestTime = new Date(initialData[initialData.length - 1].timestamp).getTime();
    
    let timeLimitMs = 24 * 60 * 60 * 1000; // default 24h
    if (timeFilter === "12h") timeLimitMs = 12 * 60 * 60 * 1000;
    if (timeFilter === "6h") timeLimitMs = 6 * 60 * 60 * 1000;

    return initialData.filter((item) => {
      const itemTime = new Date(item.timestamp).getTime();
      return latestTime - itemTime <= timeLimitMs;
    });
  }, [initialData, timeFilter]);

  // Search filtered table data (reverse order for table: newest first)
  const tableData = useMemo(() => {
    const reversed = [...filteredData].reverse();
    if (!searchQuery) return reversed;
    
    return reversed.filter((item) => {
      const dateStr = new Date(item.timestamp).toLocaleString("id-ID");
      const status = getMoistureStatus(item.moisture).label;
      return (
        dateStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.deviceId.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [filteredData, searchQuery]);

  // Latest readings for Hero Summary Cards
  const latest = useMemo(() => {
    if (initialData.length === 0) return null;
    return initialData[initialData.length - 1];
  }, [initialData]);

  // Calculate stats/averages for cards
  const stats = useMemo(() => {
    if (filteredData.length === 0) return { avgMoisture: 0, avgHumidity: 0, avgTemp: 0 };
    const sum = filteredData.reduce(
      (acc, curr) => ({
        moisture: acc.moisture + curr.moisture,
        humidity: acc.humidity + curr.humidity,
        temperature: acc.temperature + curr.temperature,
      }),
      { moisture: 0, humidity: 0, temperature: 0 }
    );
    return {
      avgMoisture: Math.round(sum.moisture / filteredData.length),
      avgHumidity: Math.round(sum.humidity / filteredData.length),
      avgTemp: Number((sum.temperature / filteredData.length).toFixed(1)),
    };
  }, [filteredData]);

  // Helper: Moisture status badge creator
  function getMoistureStatus(val: number) {
    if (val < 30) return { label: "Kering", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" };
    if (val <= 70) return { label: "Optimal", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    return { label: "Basah", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" };
  }

  // Calculate coordinates for the SVG path
  const chartPoints = useMemo(() => {
    if (filteredData.length < 2) return { moisture: [], humidity: [], temperature: [] };

    const minTime = new Date(filteredData[0].timestamp).getTime();
    const maxTime = new Date(filteredData[filteredData.length - 1].timestamp).getTime();
    const timeRange = maxTime - minTime || 1;

    // Get value bounds for scaling (autoscale with buffers)
    const temps = filteredData.map((d) => d.temperature);
    const minTemp = Math.max(0, Math.min(...temps) - 2);
    const maxTemp = Math.max(40, Math.max(...temps) + 2);
    const tempRange = maxTemp - minTemp || 1;

    return {
      moisture: filteredData.map((d) => {
        const time = new Date(d.timestamp).getTime();
        const x = paddingX + ((time - minTime) / timeRange) * (svgWidth - 2 * paddingX);
        // Moisture: 0% to 100%
        const y = svgHeight - paddingY - (d.moisture / 100) * (svgHeight - 2 * paddingY);
        return { x, y, val: d.moisture, time: d.timestamp };
      }),
      humidity: filteredData.map((d) => {
        const time = new Date(d.timestamp).getTime();
        const x = paddingX + ((time - minTime) / timeRange) * (svgWidth - 2 * paddingX);
        // Humidity: 0% to 100%
        const y = svgHeight - paddingY - (d.humidity / 100) * (svgHeight - 2 * paddingY);
        return { x, y, val: d.humidity, time: d.timestamp };
      }),
      temperature: filteredData.map((d) => {
        const time = new Date(d.timestamp).getTime();
        const x = paddingX + ((time - minTime) / timeRange) * (svgWidth - 2 * paddingX);
        // Temp: scaled based on minTemp to maxTemp
        const y = svgHeight - paddingY - ((d.temperature - minTemp) / tempRange) * (svgHeight - 2 * paddingY);
        return { x, y, val: d.temperature, time: d.timestamp };
      }),
    };
  }, [filteredData]);

  // Generate SVG Path using smoothing control points (Cubic Bezier)
  const getBezierPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      // Smooth out curve using control points
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const paths = useMemo(() => {
    const mPath = getBezierPath(chartPoints.moisture);
    const hPath = getBezierPath(chartPoints.humidity);
    const tPath = getBezierPath(chartPoints.temperature);

    const closeArea = (points: { x: number; y: number }[], pathStr: string) => {
      if (points.length === 0 || !pathStr) return "";
      return `${pathStr} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z`;
    };

    return {
      moistureLine: mPath,
      moistureArea: closeArea(chartPoints.moisture, mPath),
      humidityLine: hPath,
      humidityArea: closeArea(chartPoints.humidity, hPath),
      temperatureLine: tPath,
      temperatureArea: closeArea(chartPoints.temperature, tPath),
    };
  }, [chartPoints]);

  // Hover detection logic: find nearest point on chart
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (filteredData.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;

    // Binary search or linear search for nearest X point
    let nearestIdx = 0;
    let minDiff = Infinity;
    
    // Check points in moisture (all metric X-coords are aligned because they share same timestamps)
    chartPoints.moisture.forEach((pt, index) => {
      const diff = Math.abs(pt.x - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        nearestIdx = index;
      }
    });

    setHoveredIndex(nearestIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  // Get active hovered details
  const hoveredPoint = useMemo(() => {
    if (hoveredIndex === null || !filteredData[hoveredIndex]) return null;
    const raw = filteredData[hoveredIndex];
    return {
      raw,
      moisturePt: chartPoints.moisture[hoveredIndex],
      humidityPt: chartPoints.humidity[hoveredIndex],
      temperaturePt: chartPoints.temperature[hoveredIndex],
    };
  }, [hoveredIndex, filteredData, chartPoints]);

  // Y-axis grid labels (0 to 100%)
  const yGridTicks = [0, 25, 50, 75, 100];

  // X-axis ticks (showing 4 key time intervals)
  const xGridTicks = useMemo(() => {
    if (filteredData.length < 2) return [];
    const ticks = [];
    const step = Math.floor(filteredData.length / 4) || 1;
    for (let i = 0; i < filteredData.length; i += step) {
      ticks.push(filteredData[i]);
    }
    // Ensure last item is included
    if (ticks[ticks.length - 1] !== filteredData[filteredData.length - 1]) {
      ticks.push(filteredData[filteredData.length - 1]);
    }
    return ticks;
  }, [filteredData]);

  // Formatter for timestamp labels
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };

  return (
    <div className="min-h-screen bg-[#070b0d] text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 antialiased overflow-x-hidden relative">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-zinc-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                ESP32 Sensor Monitor
              </h1>
            </div>
            <p className="text-zinc-400 text-sm mt-1">
              Data telemetri real-time IoT Sensor Capacitive, Humidity, Moisture
            </p>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-800/80 border border-zinc-700/60 hover:bg-zinc-700/80 hover:border-zinc-600 active:scale-[0.98] transition-all disabled:opacity-50 flex-1 sm:flex-none cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 text-emerald-400 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Memperbarui..." : "Perbarui Data"}
            </button>
          </div>
        </header>

        {/* Hero Cards: Latest Readings */}
        {latest ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {/* Moisture Card */}
            <div className="relative overflow-hidden rounded-xl bg-zinc-900/40 border border-zinc-800/80 p-5 hover:border-emerald-500/30 transition-all group shadow-[0_4px_20px_-8px_rgba(0,0,0,0.7)]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
              <div className="flex justify-between items-start mb-3">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  Kelembapan Tanah
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${getMoistureStatus(latest.moisture).color} font-medium`}>
                  {getMoistureStatus(latest.moisture).label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {latest.moisture}%
                </span>
                <span className="text-zinc-500 text-xs font-mono">
                  (raw: {Math.round((4095 - (latest.moisture / 100) * (4095 - 1500)))})
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs border-t border-zinc-800/60 pt-3">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Droplet className="w-3.5 h-3.5 text-emerald-400" /> Rata-rata (1 hari):
                </span>
                <span className="font-semibold text-emerald-400">{stats.avgMoisture}%</span>
              </div>
            </div>

            {/* Humidity Card */}
            <div className="relative overflow-hidden rounded-xl bg-zinc-900/40 border border-zinc-800/80 p-5 hover:border-sky-500/30 transition-all group shadow-[0_4px_20px_-8px_rgba(0,0,0,0.7)]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-sky-500/10 transition-all" />
              <div className="flex justify-between items-start mb-3">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  Kelembapan Udara
                </span>
                <div className="p-1.5 rounded bg-sky-500/10 text-sky-400">
                  <CloudRain className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {latest.humidity}%
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs border-t border-zinc-800/60 pt-3">
                <span className="text-zinc-400">Rata-rata (1 hari):</span>
                <span className="font-semibold text-sky-400">{stats.avgHumidity}%</span>
              </div>
            </div>

            {/* Temperature Card */}
            <div className="relative overflow-hidden rounded-xl bg-zinc-900/40 border border-zinc-800/80 p-5 hover:border-rose-500/30 transition-all group shadow-[0_4px_20px_-8px_rgba(0,0,0,0.7)]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-rose-500/10 transition-all" />
              <div className="flex justify-between items-start mb-3">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  Suhu Lingkungan
                </span>
                <div className="p-1.5 rounded bg-rose-500/10 text-rose-400">
                  <Thermometer className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {latest.temperature}°C
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs border-t border-zinc-800/60 pt-3">
                <span className="text-zinc-400">Rata-rata (1 hari):</span>
                <span className="font-semibold text-rose-400">{stats.avgTemp}°C</span>
              </div>
            </div>

            {/* Hardware CPU / Health Card */}
            <div className="relative overflow-hidden rounded-xl bg-zinc-900/40 border border-zinc-800/80 p-5 hover:border-zinc-700 transition-all group shadow-[0_4px_20px_-8px_rgba(0,0,0,0.7)]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-500/5 rounded-full blur-xl pointer-events-none transition-all" />
              <div className="flex justify-between items-start mb-3">
                <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  Status Hardware (ESP32)
                </span>
                <Cpu className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="space-y-1.5 mt-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400">Suhu CPU:</span>
                  <span className="font-semibold text-zinc-100">{latest.cpuTemperature}°C</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400">Hall Magnetic:</span>
                  <span className="font-semibold text-teal-400 font-mono">{latest.hallMagnetic}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400">Touch Sensor:</span>
                  <span className="font-semibold text-indigo-400 font-mono">{latest.touchRaw}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-zinc-900/30 rounded-2xl border border-zinc-800/80 mb-8">
            <svg className="w-12 h-12 text-zinc-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-zinc-400">Belum ada data sensor yang masuk.</p>
            <p className="text-zinc-500 text-sm mt-1">Silakan sambungkan ESP32 Anda untuk mulai merekam data.</p>
          </div>
        )}

        {/* main Chart Card */}
        <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/80 p-6 mb-8 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <LineChart className="w-5 h-5 text-emerald-400" />
                Kurva Telemetri 24 Jam
              </h2>
              <p className="text-zinc-400 text-xs mt-0.5">
                Menggunakan visualisasi kurva smooth spline interaktif.
              </p>
            </div>

            {/* Chart Metric Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-zinc-950/80 border border-zinc-800 p-1 rounded-lg flex gap-1">
                {(["all", "moisture", "humidity", "temperature"] as MetricType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setActiveMetric(type)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                      activeMetric === type
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {type === "all" && "Semua"}
                    {type === "moisture" && "Tanah"}
                    {type === "humidity" && "Udara"}
                    {type === "temperature" && "Suhu"}
                  </button>
                ))}
              </div>

              {/* Timeframe selector */}
              <div className="bg-zinc-950/80 border border-zinc-800 p-1 rounded-lg flex gap-1">
                {(["24h", "12h", "6h"] as TimeFilterType[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFilter(tf)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                      timeFilter === tf
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tf === "24h" && "24J"}
                    {tf === "12h" && "12J"}
                    {tf === "6h" && "6J"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom SVG Curve Chart */}
          <div className="relative w-full overflow-hidden bg-zinc-950/60 rounded-xl border border-zinc-800/50 p-2 sm:p-4">
            {filteredData.length >= 2 ? (
              <div className="w-full h-[220px] sm:h-auto sm:aspect-[8/3.5]">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full select-none overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <defs>
                    {/* Gradients for glow areas */}
                    <linearGradient id="grad-moisture" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="grad-humidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="grad-temp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {yGridTicks.map((val) => {
                    const y = svgHeight - paddingY - (val / 100) * (svgHeight - 2 * paddingY);
                    return (
                      <g key={val} className="opacity-40">
                        <line
                          x1={paddingX}
                          y1={y}
                          x2={svgWidth - paddingX}
                          y2={y}
                          stroke="#27272a"
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                        <text
                          x={paddingX - 12}
                          y={y + 4}
                          fill="#71717a"
                          fontSize={10}
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {val}%
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis Labels */}
                  {xGridTicks.map((pt, idx) => {
                    const time = new Date(pt.timestamp).getTime();
                    const minTime = new Date(filteredData[0].timestamp).getTime();
                    const maxTime = new Date(filteredData[filteredData.length - 1].timestamp).getTime();
                    const timeRange = maxTime - minTime || 1;
                    const x = paddingX + ((time - minTime) / timeRange) * (svgWidth - 2 * paddingX);
                    return (
                      <g key={idx} className="opacity-55">
                        <line
                          x1={x}
                          y1={paddingY}
                          x2={x}
                          y2={svgHeight - paddingY}
                          stroke="#27272a"
                          strokeWidth={1}
                          strokeDasharray="4 4"
                        />
                        <text
                          x={x}
                          y={svgHeight - paddingY + 18}
                          fill="#71717a"
                          fontSize={9}
                          textAnchor="middle"
                        >
                          {formatTime(pt.timestamp)}
                        </text>
                        <text
                          x={x}
                          y={svgHeight - paddingY + 28}
                          fill="#52525b"
                          fontSize={8}
                          textAnchor="middle"
                        >
                          {formatDate(pt.timestamp)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Draw Moisture Curve */}
                  {(activeMetric === "all" || activeMetric === "moisture") && (
                    <>
                      <path
                        d={paths.moistureArea}
                        fill="url(#grad-moisture)"
                        className="transition-all duration-300"
                      />
                      <path
                        d={paths.moistureLine}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </>
                  )}

                  {/* Draw Humidity Curve */}
                  {(activeMetric === "all" || activeMetric === "humidity") && (
                    <>
                      <path
                        d={paths.humidityArea}
                        fill="url(#grad-humidity)"
                        className="transition-all duration-300"
                      />
                      <path
                        d={paths.humidityLine}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </>
                  )}

                  {/* Draw Temperature Curve */}
                  {(activeMetric === "all" || activeMetric === "temperature") && (
                    <>
                      <path
                        d={paths.temperatureArea}
                        fill="url(#grad-temp)"
                        className="transition-all duration-300"
                      />
                      <path
                        d={paths.temperatureLine}
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </>
                  )}

                  {/* Interactive Cursor line & dots */}
                  {hoveredPoint && (
                    <g>
                      {/* Vertical line at cursor */}
                      <line
                        x1={hoveredPoint.moisturePt.x}
                        y1={paddingY}
                        x2={hoveredPoint.moisturePt.x}
                        y2={svgHeight - paddingY}
                        stroke="#a1a1aa"
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        className="opacity-70"
                      />

                      {/* Moisture Hover dot */}
                      {(activeMetric === "all" || activeMetric === "moisture") && (
                        <circle
                          cx={hoveredPoint.moisturePt.x}
                          cy={hoveredPoint.moisturePt.y}
                          r={6}
                          fill="#10b981"
                          stroke="#070b0d"
                          strokeWidth={2.5}
                          className="shadow-sm"
                        />
                      )}

                      {/* Humidity Hover dot */}
                      {(activeMetric === "all" || activeMetric === "humidity") && (
                        <circle
                          cx={hoveredPoint.humidityPt.x}
                          cy={hoveredPoint.humidityPt.y}
                          r={6}
                          fill="#0ea5e9"
                          stroke="#070b0d"
                          strokeWidth={2.5}
                        />
                      )}

                      {/* Temperature Hover dot */}
                      {(activeMetric === "all" || activeMetric === "temperature") && (
                        <circle
                          cx={hoveredPoint.temperaturePt.x}
                          cy={hoveredPoint.temperaturePt.y}
                          r={6}
                          fill="#f43f5e"
                          stroke="#070b0d"
                          strokeWidth={2.5}
                        />
                      )}

                      {/* Floating Tooltip inside SVG */}
                      <g transform={`translate(${Math.min(svgWidth - 190, Math.max(10, hoveredPoint.moisturePt.x - 90))}, 15)`} className="pointer-events-none">
                        {/* Tooltip Background */}
                        <rect width="180" height="115" rx="8" fill="#18181b" stroke="#27272a" strokeWidth="1.5" opacity="0.95" />
                        
                        {/* Title / Time */}
                        <text x="12" y="22" fill="#d4d4d8" fontSize="11" fontWeight="bold">
                          {new Date(hoveredPoint.raw.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </text>
                        <text x="168" y="22" fill="#71717a" fontSize="10" textAnchor="end">
                          {new Date(hoveredPoint.raw.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </text>
                        
                        {/* Divider */}
                        <line x1="10" y1="30" x2="170" y2="30" stroke="#27272a" strokeWidth="1" />
                        
                        {/* Moisture */}
                        <text x="12" y="48" fill="#10b981" fontSize="11" fontWeight="600">Tanah:</text>
                        <text x="168" y="48" fill="#10b981" fontSize="11" fontWeight="bold" textAnchor="end">{hoveredPoint.raw.moisture}%</text>
                        
                        {/* Humidity */}
                        <text x="12" y="68" fill="#0ea5e9" fontSize="11" fontWeight="600">Udara:</text>
                        <text x="168" y="68" fill="#0ea5e9" fontSize="11" fontWeight="bold" textAnchor="end">{hoveredPoint.raw.humidity}%</text>
                        
                        {/* Temperature */}
                        <text x="12" y="88" fill="#f43f5e" fontSize="11" fontWeight="600">Suhu:</text>
                        <text x="168" y="88" fill="#f43f5e" fontSize="11" fontWeight="bold" textAnchor="end">{hoveredPoint.raw.temperature}°C</text>
                        
                        {/* CPU */}
                        <line x1="10" y1="96" x2="170" y2="96" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2 2" />
                        <text x="12" y="107" fill="#a1a1aa" fontSize="9">CPU Temp:</text>
                        <text x="168" y="107" fill="#a1a1aa" fontSize="9" textAnchor="end">{hoveredPoint.raw.cpuTemperature}°C</text>
                      </g>
                    </g>
                  )}
                </svg>
              </div>
            ) : (
              <div className="text-center py-20 text-zinc-500 text-sm">
                Kurang dari 2 titik data untuk membuat kurva grafik.
              </div>
            )}
          </div>
        </div>

        {/* Data Table Section */}
        <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden shadow-[0_4px_25px_-5px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          {/* Table Header Controls */}
          <div className="p-5 border-b border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Table className="w-5 h-5 text-emerald-400" />
                Tabel Riwayat Pembacaan Sensor
              </h2>
              <p className="text-zinc-400 text-xs mt-0.5">
                Menampilkan data berurutan dari yang terbaru (scrollable)
              </p>
            </div>

            {/* Table Search Input */}
            <div className="relative max-w-sm w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-zinc-500" />
              </span>
              <input
                type="text"
                placeholder="Cari status (Kering, Optimal, Basah)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-9 pr-4 py-2 border border-zinc-800 rounded-lg bg-zinc-950/60 placeholder-zinc-500 text-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Viewport Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {tableData.length > 0 ? (
              <table className="min-w-full divide-y divide-zinc-800/80">
                <thead className="bg-zinc-950/80 sticky top-0 backdrop-blur-md z-10">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Waktu Pembacaan
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Kelembapan Tanah
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Status Tanah
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Kelembapan Udara
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Suhu Udara
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Suhu CPU
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 bg-transparent">
                  {tableData.map((row, idx) => {
                    const status = getMoistureStatus(row.moisture);
                    return (
                      <tr
                        key={row.id || idx}
                        className="hover:bg-zinc-800/20 transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-300">
                          <span className="group-hover:text-emerald-400 transition-colors">
                            {new Date(row.timestamp).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}{" "}
                            {new Date(row.timestamp).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-white font-semibold">
                          {row.moisture}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-sky-400">
                          {row.humidity}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-rose-400">
                          {row.temperature}°C
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-zinc-400">
                          {row.cpuTemperature}°C
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-zinc-500 text-sm">
                Tidak ada data pembacaan yang cocok dengan pencarian.
              </div>
            )}
          </div>

          {/* Table Footer */}
          <div className="bg-zinc-950/40 p-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Menampilkan {tableData.length} pembacaan sensor (total {filteredData.length} dalam{" "}
              {timeFilter === "24h" ? "24" : timeFilter === "12h" ? "12" : "6"} jam)
            </span>
            {/* <span className="font-mono">Supabase Realtime Sync Ready</span> */}
          </div>
        </div>
      </div>
    </div>
  );
}
