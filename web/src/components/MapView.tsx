import { useState } from "react";
import { APIProvider, Map, Marker, InfoWindow } from "@vis.gl/react-google-maps";
import type { Course } from "../../shared/types.ts";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const ZURICH = { lat: 47.3769, lng: 8.5417 };

export function MapView({ courses, onSelect }: { courses: Course[]; onSelect: (c: Course) => void }) {
  const [active, setActive] = useState<Course | null>(null);
  const located = courses.filter((c) => c.lat != null && c.lng != null);

  if (!API_KEY) {
    return (
      <div className="mapview map-missing">
        <p>🗺️ Google Maps key not configured.</p>
        <p className="map-note">
          Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>web/.env</code> and restart the dev server.
        </p>
      </div>
    );
  }

  const center = located.length ? { lat: located[0].lat!, lng: located[0].lng! } : ZURICH;

  return (
    <div className="mapview">
      <APIProvider apiKey={API_KEY}>
        <Map
          defaultCenter={center}
          defaultZoom={10}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "72vh" }}
        >
          {located.map((c) => (
            <Marker
              key={c.id}
              position={{ lat: c.lat!, lng: c.lng! }}
              onClick={() => setActive(c)}
            />
          ))}
          {active && active.lat != null && (
            <InfoWindow
              position={{ lat: active.lat, lng: active.lng! }}
              onCloseClick={() => setActive(null)}
            >
              <div className="gm-popup">
                <strong>{active.title}</strong>
                <div>{active.communeClean} · {active.weekLabel}</div>
                <button className="popup-btn" onClick={() => onSelect(active)}>Details →</button>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
      <p className="map-note">{located.length} / {courses.length} mit Standort</p>
    </div>
  );
}
