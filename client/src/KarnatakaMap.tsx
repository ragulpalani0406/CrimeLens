import { useEffect, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import "leaflet/dist/leaflet.css";
import "./KarnatakaMap.css";

type Hotspot = {
  district: string;
  position: [number, number];
  incidents: number;
  priority: "High" | "Medium" | "Low";
};

// Demo points only. Later, these will come from your uploaded dataset.
const demoHotspots: Hotspot[] = [
  { district: "Bengaluru Urban", position: [12.9716, 77.5946], incidents: 42, priority: "High" },
  { district: "Mysuru", position: [12.2958, 76.6394], incidents: 21, priority: "Medium" },
  { district: "Mangaluru", position: [12.9141, 74.856], incidents: 12, priority: "Low" },
  { district: "Hubballi-Dharwad", position: [15.3647, 75.124], incidents: 28, priority: "High" },
  { district: "Belagavi", position: [15.8497, 74.4977], incidents: 19, priority: "Medium" },
  { district: "Kalaburagi", position: [17.3297, 76.8343], incidents: 16, priority: "Medium" },
  { district: "Shivamogga", position: [13.9299, 75.5681], incidents: 14, priority: "Low" },
  { district: "Tumakuru", position: [13.3392, 77.113], incidents: 18, priority: "Medium" },
  { district: "Ballari", position: [15.1394, 76.9214], incidents: 23, priority: "High" },
  { district: "Davanagere", position: [14.4644, 75.9218], incidents: 11, priority: "Low" },
];

const priorityColor = {
  High: "#ff5d73",
  Medium: "#ffb454",
  Low: "#56d8ba",
};

export default function KarnatakaMap() {
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    fetch("/karnataka-districts.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Boundary file not found");
        return response.json();
      })
      .then((data) => setBoundary(data))
      .catch(() => {
        setMapError("Karnataka boundary file could not be loaded.");
      });
  }, []);

  return (
    <section className="karnataka-map-panel">
      <div className="map-heading">
        <div>
          <p className="eyebrow">Geo Crime Intelligence</p>
          <h1>Karnataka Priority Map</h1>
          <p>Real Karnataka district boundary · Demo markers until dataset is uploaded</p>
        </div>

        <div className="map-legend">
          <span><i className="high" /> High</span>
          <span><i className="medium" /> Medium</span>
          <span><i className="low" /> Low</span>
        </div>
      </div>

      {mapError && <p className="map-error">{mapError}</p>}

      <MapContainer
        center={[15.3173, 75.7139]}
        zoom={7}
        scrollWheelZoom
        className="karnataka-map"
      >
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {boundary && (
          <GeoJSON
            data={boundary}
            style={{
              color: "#6c7cff",
              weight: 1.4,
              fillColor: "#222b59",
              fillOpacity: 0.22,
            }}
          />
        )}

        {demoHotspots.map((spot) => (
          <CircleMarker
            key={spot.district}
            center={spot.position}
            radius={Math.max(8, Math.min(spot.incidents / 2, 22))}
            pathOptions={{
              color: priorityColor[spot.priority],
              fillColor: priorityColor[spot.priority],
              fillOpacity: 0.78,
            }}
          >
            <Popup>
              <strong>{spot.district}</strong>
              <br />
              Priority: {spot.priority}
              <br />
              Cases: {spot.incidents}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </section>
  );
}