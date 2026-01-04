import * as Location from 'expo-location';

class LocationService {
    constructor() {
        this.currentLocation = null;
        this.errorMsg = null;
    }

    async requestPermissions() {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            this.errorMsg = 'Permission to access location was denied';
            return false;
        }
        return true;
    }

    async getCurrentLocation() {
        try {
            const location = await Location.getCurrentPositionAsync({});
            this.currentLocation = location.coords;
            return location.coords;
        } catch (error) {
            console.error("LOCATION_ERROR:", error);
            return null;
        }
    }

    watchLocation(callback) {
        return Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 10000,
                distanceInterval: 10,
            },
            (location) => {
                this.currentLocation = location.coords;
                callback(location.coords);
            }
        );
    }
}

export default new LocationService();
