export class MapTemplate {
    static getHTML(location, routeData) {
        const userLat = location?.latitude || 0;
        const userLon = location?.longitude || 0;

        // Extract polyline points if route exists
        let routeGeoJSON = 'null';
        let destLat = 0;
        let destLon = 0;

        if (routeData && routeData.geometry) {
            routeGeoJSON = JSON.stringify(routeData.geometry);
            const coords = routeData.geometry.coordinates;
            const lastCoord = coords[coords.length - 1];
            destLon = lastCoord[0];
            destLat = lastCoord[1];
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                    body { margin: 0; padding: 0; }
                    #map { height: 100vh; width: 100vw; background: #000; }
                    .leaflet-tile { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
                </style>
            </head>
            <body>
                <div id="map"></div>
                <script>
                    const map = L.map('map', { zoomControl: false }).setView([${userLat}, ${userLon}], 16);
                    
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap'
                    }).addTo(map);

                    const userIcon = L.divIcon({
                        className: 'user-icon',
                        html: '<div style="background: #007AFF; width: 15px; height: 15px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
                        iconSize: [15, 15]
                    });

                    const userMarker = L.marker([${userLat}, ${userLon}], { icon: userIcon }).addTo(map);

                    const routeData = ${routeGeoJSON};
                    if (routeData) {
                        const routeLine = L.geoJSON(routeData, {
                            style: { color: '#007AFF', weight: 6, opacity: 0.8 }
                        }).addTo(map);

                        const destMarker = L.marker([${destLat}, ${destLon}]).addTo(map);
                        
                        // Fit map to show both user and destination
                        const bounds = L.latLngBounds([
                            [${userLat}, ${userLon}],
                            [${destLat}, ${destLon}]
                        ]);
                        map.fitBounds(bounds, { padding: [50, 50] });
                    }
                </script>
            </body>
            </html>
        `;
    }
}
