export class MapUtils {
    static NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
    static OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot'; // Foot/Pedestrian routing

    /**
     * Search for a location using Nominatim (No key required)
     */
    static async geocode(query) {
        try {
            const url = `${this.NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&limit=1`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'ARGUS-Navia-App/1.0' // Nominatim requires a User-Agent
                }
            });
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    latitude: parseFloat(data[0].lat),
                    longitude: parseFloat(data[0].lon),
                    displayName: data[0].display_name
                };
            }
            return null;
        } catch (error) {
            console.error("GEOCODE_ERROR:", error);
            return null;
        }
    }

    /**
     * Get directions between two coordinates using OSRM (No key required)
     */
    static async getDirections(start, end) {
        try {
            const coords = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
            const url = `${this.OSRM_BASE}/${coords}?overview=full&steps=true&geometries=geojson`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.code === 'Ok' && data.routes.length > 0) {
                return data.routes[0];
            }
            return null;
        } catch (error) {
            console.error("ROUTING_ERROR:", error);
            return null;
        }
    }

    /**
     * Calculate distance between two points in meters (Haversine formula)
     */
    static getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
