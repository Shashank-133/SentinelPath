'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map, LayerGroup, Polyline } from 'leaflet';

interface SafetyMapProps {
  startCoords: [number, number] | null;
  endCoords: [number, number] | null;
  routes: any[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  incidents: any[];
  heatmapCells: any[];
  showHeatmap: boolean;
  onMapClick: (lat: number, lng: number) => void;
  userLiveLocation: [number, number] | null;
}

export default function SafetyMap({
  startCoords,
  endCoords,
  routes,
  selectedRouteIndex,
  onSelectRoute,
  incidents,
  heatmapCells,
  showHeatmap,
  onMapClick,
  userLiveLocation
}: SafetyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const routeLayersRef = useRef<LayerGroup | null>(null);
  const incidentLayersRef = useRef<LayerGroup | null>(null);
  const heatmapLayersRef = useRef<LayerGroup | null>(null);
  const markersLayersRef = useRef<LayerGroup | null>(null);
  const [LInstance, setLInstance] = useState<any>(null);

  // 1. Initialize Leaflet map client-side
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapInstanceRef.current) return;

    // Check custom initialization tag to prevent React StrictMode duplicate concurrent runs
    if ((mapContainerRef.current as any)._initializationTriggered) return;
    (mapContainerRef.current as any)._initializationTriggered = true;

    const initMap = async () => {
      const L = await import('leaflet');
      setLInstance(L);

      // Verify that map is not already created on this DOM node
      if ((mapContainerRef.current as any)._leaflet_id) return;

      // Create map centered on New Delhi (Default coverage area)
      const map = L.map(mapContainerRef.current!, {
        center: [28.6139, 77.2090],
        zoom: 13,
        zoomControl: true,
        attributionControl: false
      });

      // Standard open-source OpenStreetMap tiles (100% free, no key required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Create separate layer groups for organization
      routeLayersRef.current = L.layerGroup().addTo(map);
      incidentLayersRef.current = L.layerGroup().addTo(map);
      heatmapLayersRef.current = L.layerGroup().addTo(map);
      markersLayersRef.current = L.layerGroup().addTo(map);

      // Handle Map Clicks to set start/end or report coordinate
      map.on('click', (e) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Render Heatmap Cells
  useEffect(() => {
    if (!LInstance || !mapInstanceRef.current || !heatmapLayersRef.current) return;

    heatmapLayersRef.current.clearLayers();

    if (showHeatmap && heatmapCells.length > 0) {
      heatmapCells.forEach((cell) => {
        // Color based on safety score
        let fillColor = '#ef4444'; // Red
        if (cell.safety_score >= 80) fillColor = '#10b981'; // Green
        else if (cell.safety_score >= 50) fillColor = '#f59e0b'; // Amber

        const polygon = LInstance.polygon(cell.coordinates, {
          fillColor: fillColor,
          fillOpacity: 0.25,
          stroke: true,
          color: 'rgba(255, 255, 255, 0.05)',
          weight: 0.5,
          className: 'heatmap-cell'
        });

        polygon.bindPopup(`<strong>Safety Cell</strong><br/>Score: ${cell.safety_score}/100`);
        heatmapLayersRef.current!.addLayer(polygon);
      });
    }
  }, [LInstance, heatmapCells, showHeatmap]);

  // 3. Render User Incidents
  useEffect(() => {
    if (!LInstance || !mapInstanceRef.current || !incidentLayersRef.current) return;

    incidentLayersRef.current.clearLayers();

    incidents.forEach((inc) => {
      // Create a glowing, category-specific custom HTML marker
      let markerColor = '#9b5de5'; // default violet
      let categoryLabel = 'Alert';
      
      if (inc.category === 'poor_lighting') {
        markerColor = '#f59e0b';
        categoryLabel = '💡 Poor Lighting';
      } else if (inc.category === 'harassment') {
        markerColor = '#ef4444';
        categoryLabel = '⚠️ Harassment';
      } else if (inc.category === 'suspicious_activity') {
        markerColor = '#ec4899';
        categoryLabel = '👁️ Suspicious';
      } else {
        markerColor = '#8a99ad';
        categoryLabel = '📍 Other Alert';
      }

      const pulseStyle = `
        background-color: ${markerColor};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 0 10px ${markerColor};
      `;

      const customIcon = LInstance.divIcon({
        html: `<div style="${pulseStyle}"></div>`,
        className: 'custom-div-icon',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = LInstance.marker([inc.latitude, inc.longitude], { icon: customIcon });
      
      const popupContent = `
        <div style="font-family: sans-serif; padding: 4px;">
          <h4 style="margin: 0 0 4px 0; color: ${markerColor};">${categoryLabel}</h4>
          <p style="margin: 0; font-size: 0.85rem; color: #cbd5e1;">${inc.description || 'Anonymous alert reported here.'}</p>
          <small style="display: block; margin-top: 8px; color: #8a99ad; font-size: 0.7rem;">
            ${new Date(inc.created_at).toLocaleString()}
          </small>
        </div>
      `;

      marker.bindPopup(popupContent);
      incidentLayersRef.current!.addLayer(marker);
    });
  }, [LInstance, incidents]);

  // 4. Render Routes & Start/End Markers
  useEffect(() => {
    if (!LInstance || !mapInstanceRef.current || !routeLayersRef.current || !markersLayersRef.current) return;

    routeLayersRef.current.clearLayers();
    markersLayersRef.current.clearLayers();

    // Add Start Marker if set
    if (startCoords) {
      const startIcon = LInstance.divIcon({
        html: `<div style="background-color: #10b981; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #060913; box-shadow: 0 0 15px #10b981;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: 'start-marker'
      });
      LInstance.marker(startCoords, { icon: startIcon })
        .bindPopup("<strong>Start Point</strong>")
        .addTo(markersLayersRef.current);
    }

    // Add End Marker if set
    if (endCoords) {
      const endIcon = LInstance.divIcon({
        html: `<div style="background-color: #ef4444; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #060913; box-shadow: 0 0 15px #ef4444;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: 'end-marker'
      });
      LInstance.marker(endCoords, { icon: endIcon })
        .bindPopup("<strong>End Destination</strong>")
        .addTo(markersLayersRef.current);
    }

    // Add User Live Location Marker (SOS Mode)
    if (userLiveLocation) {
      const liveIcon = LInstance.divIcon({
        html: `<div style="background-color: #00f2fe; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #060913; box-shadow: 0 0 20px #00f2fe; animation: pulse-glow 1.5s infinite;"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        className: 'live-marker'
      });
      LInstance.marker(userLiveLocation, { icon: liveIcon })
        .bindPopup("<strong>Your Shared Location (Live SOS Active)</strong>")
        .addTo(markersLayersRef.current);

      // Pan to user's live position when actively tracking
      mapInstanceRef.current.panTo(userLiveLocation);
    }

    // Draw lines for each fetched route
    if (routes.length > 0) {
      routes.forEach((route, idx) => {
        // Swap coordinates format (OSRM returns Lng, Lat, Leaflet needs Lat, Lng)
        const pathCoords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
        
        const isSelected = idx === selectedRouteIndex;
        const color = isSelected 
          ? (route.is_recommended ? '#10b981' : '#00f2fe') // Emerald for safest, cyan for chosen alternative
          : 'rgba(255, 255, 255, 0.25)';                  // Faded grey/white for inactive
          
        const weight = isSelected ? 6 : 4;
        const opacity = isSelected ? 0.95 : 0.6;

        const polyline = LInstance.polyline(pathCoords, {
          color: color,
          weight: weight,
          opacity: opacity,
          lineJoin: 'round'
        });

        // Glowing shadow effect for selected route
        if (isSelected) {
          const shadowPolyline = LInstance.polyline(pathCoords, {
            color: color,
            weight: weight + 6,
            opacity: 0.15,
            lineJoin: 'round'
          });
          routeLayersRef.current!.addLayer(shadowPolyline);
        }

        // Make line interactive so users can click directly to select
        polyline.on('click', (e: any) => {
          LInstance.DomEvent.stopPropagation(e);
          onSelectRoute(idx);
        });

        // Add a floating popup indicating safety score along the route path
        polyline.bindTooltip(
          `<strong>Safety: ${route.safety_score}/100</strong>${route.is_recommended ? ' (Recommended)' : ''}`, 
          { sticky: true, className: 'route-tooltip' }
        );

        routeLayersRef.current!.addLayer(polyline);
      });

      // Fit bounds to fit the primary route
      const activeRouteCoords = routes[selectedRouteIndex].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      mapInstanceRef.current.fitBounds(LInstance.polyline(activeRouteCoords).getBounds(), {
        padding: [60, 60]
      });
    }
  }, [LInstance, routes, selectedRouteIndex, startCoords, endCoords, userLiveLocation]);

  return (
    <div ref={mapContainerRef} className="map-container" id="map" />
  );
}
