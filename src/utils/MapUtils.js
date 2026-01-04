
export const MapUtils = {
  geocode: async (address) => {
    try {
      const encodedAddress = encodeURIComponent(address.trim());
      console.log("📍 Geocoding:", address);
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
        { headers: { 'User-Agent': 'NaviaApp/1.0' } }
      );
      
      const data = await response.json();
      console.log("📍 Geocode result:", data);
      
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        };
      }
      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  },

  getDirections: async (origin, destination) => {
    try {
      console.log("🚶 Getting directions from", origin, "to", destination);
      
      const url = `https://router.project-osrm.org/route/v1/walking/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log("🚶 Route response:", data.code);
      
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        const coordinates = route.geometry.coordinates.map(coord => ({
          longitude: coord[0],
          latitude: coord[1],
        }));
        
        console.log("✅ Route found:", coordinates.length, "points");
        
        return {
          coordinates,
          distance: route.distance,
          duration: route.duration,
          steps: leg.steps,
          destination: {
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
        };
      }
      return null;
    } catch (error) {
      console.error("Directions error:", error);
      return null;
    }
  },

  formatDistance: (meters) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  },

  formatDuration: (seconds) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  },

  getDistance: (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
};