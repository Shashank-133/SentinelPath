'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the Leaflet map component to prevent SSR errors (window is not defined)
const SafetyMap = dynamic(() => import('@/components/SafetyMap'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#060913', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <span className="spin-loading" style={{ fontSize: '2.5rem' }}>⌛</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>INITIALIZING SENTINEL PATHS...</span>
      </div>
    </div>
  )
});

const RouteComparison = dynamic(() => import('@/components/RouteComparison'), { ssr: false });
const ReportIncident = dynamic(() => import('@/components/ReportIncident'), { ssr: false });
const SOSPanel = dynamic(() => import('@/components/SOSPanel'), { ssr: false });

export default function Home() {
  // Navigation coordinates
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [endCoords, setEndCoords] = useState<[number, number] | null>(null);
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');

  // Results
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [heatmapCells, setHeatmapCells] = useState<any[]>([]);

  // Toggles and Modals
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [activePinDrop, setActivePinDrop] = useState<[number, number] | null>(null);
  const [userLiveLocation, setUserLiveLocation] = useState<[number, number] | null>(null);
  const [isSOSReceiver, setIsSOSReceiver] = useState(false);
  const [sosSenderCoords, setSosSenderCoords] = useState<[number, number] | null>(null);

  // States
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Fetch initial incidents and heatmap data on load
  useEffect(() => {
    fetchIncidents();
    fetchHeatmap();
    checkSOSParam();
  }, []);

  // Fetch routes when start and end coordinates are resolved
  useEffect(() => {
    if (startCoords && endCoords) {
      fetchRoutes(startCoords, endCoords);
    }
  }, [startCoords, endCoords]);

  // Checks URL query parameters to see if this is an SOS share receiver link
  const checkSOSParam = () => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('sos') === 'true') {
      const lat = parseFloat(urlParams.get('lat') || '0');
      const lng = parseFloat(urlParams.get('lng') || '0');
      if (lat && lng) {
        setIsSOSReceiver(true);
        setSosSenderCoords([lat, lng]);
        setStartCoords(null);
        setEndCoords(null);
      }
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/incidents');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error('Error fetching incidents:', err);
    }
  };

  const fetchHeatmap = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/heatmap');
      if (res.ok) {
        const data = await res.json();
        setHeatmapCells(data);
      }
    } catch (err) {
      console.error('Error fetching heatmap:', err);
    }
  };

  const refreshHeatmap = async () => {
    setLoadingHeatmap(true);
    try {
      // Refresh centered around Delhi (Can be updated dynamically)
      const center = startCoords || [28.6139, 77.2090];
      const res = await fetch(`http://127.0.0.1:8000/api/heatmap/refresh?center_lat=${center[0]}&center_lng=${center[1]}`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Safety Heatmap cells precomputed successfully!');
        fetchHeatmap();
      } else {
        alert('Failed to refresh heatmap grid.');
      }
    } catch (err) {
      alert('Error triggering precomputation: ' + err);
    } finally {
      setLoadingHeatmap(false);
    }
  };

  const fetchRoutes = async (start: [number, number], end: [number, number]) => {
    setLoadingRoutes(true);
    setRoutes([]);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/routes?start_lat=${start[0]}&start_lng=${start[1]}&end_lat=${end[0]}&end_lng=${end[1]}`
      );
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
        setSelectedRouteIndex(0); // Select the first (recommended safest) route by default
      } else {
        console.error('Routing service returned error:', await res.text());
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      setLoadingRoutes(false);
    }
  };

  // Resolve Search Addresses using free OpenStreetMap Nominatim API
  const handleSearch = async (address: string, isStart: boolean) => {
    if (!address.trim()) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        if (isStart) {
          setStartCoords([lat, lon]);
        } else {
          setEndCoords([lat, lon]);
        }
      } else {
        alert(`Location "${address}" not found. Try search query (e.g. New Delhi, South Campus).`);
      }
    } catch (err) {
      alert('Search geocoder unreachable: ' + err);
    }
  };

  // Handles clicks on the Leaflet map dynamically
  const handleMapClick = (lat: number, lng: number) => {
    if (isSOSReceiver) return; // Ignore input when viewing SOS

    if (!startCoords) {
      setStartCoords([lat, lng]);
      setStartQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else if (!endCoords) {
      setEndCoords([lat, lng]);
      setEndQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else {
      // Both start and end are set. Clicking elsewhere opens the anonymous incident reporter pin!
      setActivePinDrop([lat, lng]);
    }
  };

  const handleSetDestinationFromSOS = (lat: number, lng: number) => {
    // Route from user's live position to the emergency service coordinate
    if (userLiveLocation) {
      setStartCoords(userLiveLocation);
      setStartQuery('Current Location');
      setEndCoords([lat, lng]);
      setEndQuery('Emergency Service');
    } else {
      alert('Start your live location tracking first to route to this service.');
    }
  };

  const clearRoutes = () => {
    setStartCoords(null);
    setEndCoords(null);
    setStartQuery('');
    setEndQuery('');
    setRoutes([]);
    setSelectedRouteIndex(0);
    setActivePinDrop(null);
  };

  return (
    <main className={`app-container theme-${theme}`}>
      {/* Sidebar Control Panel */}
      <section className="sidebar glass-panel">
        <header style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '4px' }}>
          <div className="title-badge">Minor Project v1.0</div>
          <h1 className="header-title" style={{ marginTop: '8px' }}>SentinelPath AI</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: '4px' }}>
            College Campus Safety-First Routing Platform
          </p>
        </header>

        {isSOSReceiver ? (
          /* SOS Shared Link Tracker Mode */
          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <h2 style={{ fontSize: '1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚨 Active SOS Tracking
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', marginTop: '6px', lineHeight: '1.4' }}>
              You are currently viewing a shared live location. The map shows their coordinates and tracks their movement.
            </p>
            <button 
              onClick={() => {
                setIsSOSReceiver(false);
                setSosSenderCoords(null);
                window.history.replaceState({}, document.title, window.location.pathname);
              }} 
              className="secondary-btn" 
              style={{ width: '100%', marginTop: '14px', fontSize: '0.8rem', color: '#fff' }}
            >
              Exit SOS Tracking
            </button>
          </div>
        ) : (
          /* Standard Route Planner Mode */
          <>
            {/* 1. Navigation Card */}
            <div className="input-group" style={{ gap: '14px' }}>
              <div className="input-group">
                <label className="input-label">Start Point</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter start location or click map"
                    value={startQuery}
                    onChange={(e) => setStartQuery(e.target.value)}
                    className="text-input"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(startQuery, true)}
                  />
                  <button onClick={() => handleSearch(startQuery, true)} className="secondary-btn" style={{ padding: '12px 14px' }}>🔍</button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Destination</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter destination location or click map"
                    value={endQuery}
                    onChange={(e) => setEndQuery(e.target.value)}
                    className="text-input"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(endQuery, false)}
                  />
                  <button onClick={() => handleSearch(endQuery, false)} className="secondary-btn" style={{ padding: '12px 14px' }}>🔍</button>
                </div>
              </div>

              {(startCoords || endCoords) && (
                <button onClick={clearRoutes} className="secondary-btn" style={{ fontSize: '0.85rem' }}>
                  🧹 Clear Route Points
                </button>
              )}
            </div>

            {/* Instruction Banner if points not selected */}
            {!startCoords && (
              <div style={{ padding: '12px', background: 'rgba(0, 242, 254, 0.04)', border: '1px solid rgba(0, 242, 254, 0.1)', borderRadius: '10px', fontSize: '0.75rem', lineHeight: '1.5', color: 'var(--color-muted)' }}>
                ℹ️ <strong>Quick Instructions:</strong><br/>
                1. Click the map to drop the <strong>Start Point</strong>.<br/>
                2. Click again to set the <strong>Destination</strong>.<br/>
                3. Subsequent clicks will drop a pin to submit an incident.
              </div>
            )}

            {/* 2. Loading State */}
            {loadingRoutes && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', gap: '10px' }}>
                <span className="spin-loading" style={{ fontSize: '1.4rem' }}>⌛</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>CALCULATING ROUTE SAFETY...</span>
              </div>
            )}

            {/* 3. Route Selector cards */}
            <RouteComparison
              routes={routes}
              selectedIndex={selectedRouteIndex}
              onSelectRoute={setSelectedRouteIndex}
            />

            {/* 4. Incident Reporting popup in sidebar (if clicked) */}
            {activePinDrop && (
              <ReportIncident
                latitude={activePinDrop[0]}
                longitude={activePinDrop[1]}
                onClose={() => setActivePinDrop(null)}
                onSubmitSuccess={fetchIncidents}
              />
            )}

            {/* 5. Live SOS tracker activator */}
            <SOSPanel
              onLocationUpdate={(lat, lng) => {
                if (lng === null) {
                  setUserLiveLocation(null);
                } else {
                  setUserLiveLocation([lat, lng]);
                }
              }}
              onSetDestination={handleSetDestinationFromSOS}
            />
          </>
        )}
      </section>

      {/* Floating Map Utility Buttons (Heatmap, precomputation refresh, Theme toggle) */}
      <section className="floating-controls">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="glass-panel toggle-btn"
          style={{ background: 'var(--bg-surface)' }}
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`glass-panel toggle-btn ${showHeatmap ? 'active' : ''}`}
          style={{ background: 'var(--bg-surface)' }}
          title="Toggle Safety Heatmap Layer"
        >
          🗺️
        </button>
        <button
          onClick={refreshHeatmap}
          className={`glass-panel toggle-btn ${loadingHeatmap ? 'active' : ''}`}
          style={{ background: 'var(--bg-surface)' }}
          disabled={loadingHeatmap}
          title="Refresh/Precompute Heatmap Safety Cells"
        >
          {loadingHeatmap ? '⏳' : '⚡'}
        </button>
      </section>

      {/* Leaflet Map rendering */}
      <SafetyMap
        startCoords={startCoords}
        endCoords={endCoords}
        routes={routes}
        selectedRouteIndex={selectedRouteIndex}
        onSelectRoute={setSelectedRouteIndex}
        incidents={incidents}
        heatmapCells={heatmapCells}
        showHeatmap={showHeatmap}
        onMapClick={handleMapClick}
        userLiveLocation={isSOSReceiver ? sosSenderCoords : userLiveLocation}
      />
    </main>
  );
}
