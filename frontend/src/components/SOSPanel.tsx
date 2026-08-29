'use client';

import { useEffect, useState, useRef } from 'react';

interface SOSPanelProps {
  onLocationUpdate: (lat: number, lng: number | null) => void;
  onSetDestination: (lat: number, lng: number) => void;
}

interface EmergencyService {
  name: string;
  type: 'police' | 'hospital';
  lat: number;
  lng: number;
  distance: number; // in meters
}

export default function SOSPanel({ onLocationUpdate, onSetDestination }: SOSPanelProps) {
  const [isActive, setIsActive] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [nearbyServices, setNearbyServices] = useState<EmergencyService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // Haversine formula to compute distance in meters between two coordinates
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  };

  const startSOS = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsActive(true);

    // Watch position in real time
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords([latitude, longitude]);
        onLocationUpdate(latitude, longitude);
        fetchNearbyEmergency(latitude, longitude);
      },
      (error) => {
        console.error('Error getting location: ', error);
        alert('Could not retrieve your live location. Please check browser permissions.');
        stopSOS();
      },
      { enableHighAccuracy: true }
    );
  };

  const stopSOS = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsActive(false);
    setCoords(null);
    setNearbyServices([]);
    onLocationUpdate(0, null); // Reset marker
  };

  const fetchNearbyEmergency = async (lat: number, lng: number) => {
    setLoadingServices(true);
    // Query Overpass for police and hospitals within 3km around user position
    const query = `
      [out:json][timeout:5];
      (
        node["amenity"="police"](around:3000,${lat},${lng});
        node["amenity"="hospital"](around:3000,${lat},${lng});
      );
      out body;
    `;
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: query })
      });
      const data = await response.json();
      const elements = data.elements || [];

      const services: EmergencyService[] = elements
        .map((elem: any) => {
          const name = elem.tags?.name || (elem.tags?.amenity === 'police' ? 'Police Station' : 'Hospital');
          const type = elem.tags?.amenity === 'police' ? 'police' : 'hospital';
          const dist = getDistance(lat, lng, elem.lat, elem.lon);
          return {
            name,
            type,
            lat: elem.lat,
            lng: elem.lon,
            distance: dist
          };
        })
        // Sort by closest distance
        .sort((a: EmergencyService, b: EmergencyService) => a.distance - b.distance)
        .slice(0, 4); // Limit to top 4 closest

      setNearbyServices(services);
    } catch (err) {
      console.error('Failed to fetch emergency services: ', err);
    } finally {
      setLoadingServices(false);
    }
  };

  // Generate URL encoding location coordinates for receiver
  const getShareLink = () => {
    if (!coords) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/?sos=true&lat=${coords[0]}&lng=${coords[1]}`;
  };

  const copyLink = () => {
    const link = getShareLink();
    if (!link) return;
    navigator.clipboard.writeText(link);
    alert('SOS shareable link copied to clipboard!');
  };

  const shareWhatsApp = () => {
    const link = getShareLink();
    if (!link) return;
    const text = encodeURIComponent(`Emergency SOS! Please track my live location here: ${link}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className={`glass-panel ${isActive ? 'sos-active' : ''}`} style={{ padding: '20px', background: isActive ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: isActive ? '#fff' : 'var(--color-danger)' }}>
              🚨 Emergency SOS
            </h3>
            <p style={{ fontSize: '0.75rem', color: isActive ? '#ffe4e6' : 'var(--color-muted)', marginTop: '2px' }}>
              {isActive ? 'Live location tracking is active.' : 'Share your live path location instantly.'}
            </p>
          </div>
          {!isActive ? (
            <button 
              onClick={startSOS} 
              className="primary-btn" 
              style={{ background: 'var(--color-danger)', color: '#fff', fontSize: '0.85rem', padding: '10px 18px', boxShadow: 'none' }}
            >
              Trigger SOS
            </button>
          ) : (
            <button 
              onClick={stopSOS} 
              className="secondary-btn" 
              style={{ background: '#fff', color: '#ef4444', fontSize: '0.85rem', padding: '10px 18px', fontWeight: 600, border: 'none' }}
            >
              Stop SOS
            </button>
          )}
        </div>

        {isActive && coords && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '12px' }}>
            <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
              📍 <strong>Live GPS:</strong> {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={copyLink} className="secondary-btn" style={{ flex: 1, padding: '10px', fontSize: '0.8rem', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>
                🔗 Copy Link
              </button>
              <button onClick={shareWhatsApp} className="primary-btn" style={{ flex: 1, padding: '10px', fontSize: '0.8rem', background: '#25D366', color: '#fff', border: 'none', boxShadow: 'none' }}>
                💬 WhatsApp
              </button>
            </div>

            {/* Display closest emergency nodes */}
            <div style={{ marginTop: '4px' }}>
              <h4 style={{ fontSize: '0.8rem', color: '#fff', marginBottom: '8px', fontWeight: 600 }}>
                🏥 Closest Emergency Services (3km)
              </h4>
              {loadingServices ? (
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Searching Overpass map...</div>
              ) : nearbyServices.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>No services found nearby.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {nearbyServices.map((svc, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: 'rgba(0,0,0,0.15)', 
                        padding: '8px 10px', 
                        borderRadius: '6px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        <span>{svc.type === 'police' ? '👮' : '🏥'} </span>
                        <span style={{ fontWeight: 500, color: '#fff' }}>{svc.name}</span>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                          Distance: {svc.distance.toFixed(0)}m
                        </div>
                      </div>
                      <button
                        onClick={() => onSetDestination(svc.lat, svc.lng)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: 'none',
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.65rem',
                          fontWeight: 500
                        }}
                      >
                        Route Here
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
