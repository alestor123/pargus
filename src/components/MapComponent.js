import React from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { MapUtils } from '../utils/MapUtils';

const MapComponent = ({ location, routeData }) => {
  console.log("🗺️ MapComponent render:", { 
    hasLocation: !!location, 
    hasRoute: !!routeData,
    coordsCount: routeData?.coordinates?.length 
  });

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading location...</Text>
      </View>
    );
  }

  const hasRoute = routeData && routeData.coordinates && routeData.coordinates.length > 0;
  const destination = routeData?.destination;

  const openInGoogleMaps = () => {
    if (destination) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=walking`;
      Linking.openURL(url).catch(err => console.error('Cannot open maps', err));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        
        {/* Current Location */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 YOUR LOCATION</Text>
          <Text style={styles.coords}>Lat: {location.latitude.toFixed(6)}</Text>
          <Text style={styles.coords}>Lon: {location.longitude.toFixed(6)}</Text>
        </View>

        {/* Route Info */}
        {hasRoute && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🎯 DESTINATION</Text>
              <Text style={styles.coords}>Lat: {destination.latitude.toFixed(6)}</Text>
              <Text style={styles.coords}>Lon: {destination.longitude.toFixed(6)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 ROUTE</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Distance:</Text>
                <Text style={styles.statValue}>{MapUtils.formatDistance(routeData.distance)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Duration:</Text>
                <Text style={styles.statValue}>{MapUtils.formatDuration(routeData.duration)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Steps:</Text>
                <Text style={styles.statValue}>{routeData.steps?.length || 0}</Text>
              </View>
            </View>

            {/* First 5 directions */}
            {routeData.steps && routeData.steps.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🧭 DIRECTIONS</Text>
                {routeData.steps.slice(0, 5).map((step, index) => (
                  <View key={index} style={styles.stepRow}>
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepInstruction}>
                        {step.maneuver?.instruction || 'Continue'}
                      </Text>
                      <Text style={styles.stepDistance}>
                        {MapUtils.formatDistance(step.distance)}
                      </Text>
                    </View>
                  </View>
                ))}
                {routeData.steps.length > 5 && (
                  <Text style={styles.moreSteps}>+ {routeData.steps.length - 5} more steps</Text>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.mapsButton} onPress={openInGoogleMaps}>
              <Text style={styles.mapsButtonText}>🗺️ OPEN IN GOOGLE MAPS</Text>
            </TouchableOpacity>
          </>
        )}

        {!hasRoute && (
          <View style={styles.card}>
            <Text style={styles.noRouteText}>
              No active route. Set a destination to begin navigation.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 15,
  },
  loadingText: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
  },
  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00FF00',
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  coords: {
    color: '#00AA00',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    color: '#00AA00',
    fontSize: 14,
  },
  statValue: {
    color: '#00FF00',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  stepNumber: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
    width: 30,
    marginRight: 10,
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 4,
  },
  stepDistance: {
    color: '#00AA00',
    fontSize: 12,
  },
  moreSteps: {
    color: '#00AA00',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  noRouteText: {
    color: '#00AA00',
    fontSize: 14,
    textAlign: 'center',
  },
  mapsButton: {
    backgroundColor: '#003300',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#00FF00',
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  mapsButtonText: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
export default MapComponent;