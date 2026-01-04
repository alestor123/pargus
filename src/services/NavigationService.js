import { MapUtils } from '../utils/MapUtils';

class NavigationService {
  constructor() {
    this.activeRoute = null;
    this.currentStepIndex = 0;
    this.lastAnnouncedStepIndex = -1;
  }

  startRoute(route) {
    this.activeRoute = route;
    this.currentStepIndex = 0;
    this.lastAnnouncedStepIndex = -1;
    console.log("🧭 Navigation started:", route.steps?.length, "steps");
  }

  stopRoute() {
    this.activeRoute = null;
    this.currentStepIndex = 0;
    this.lastAnnouncedStepIndex = -1;
    console.log("🧭 Navigation stopped");
  }

  updateProgress(currentLocation) {
    if (!this.activeRoute || !this.activeRoute.steps) return null;

    const steps = this.activeRoute.steps;
    const currentStep = steps[this.currentStepIndex];
    
    if (!currentStep) return null;

    if (currentStep.maneuver && currentStep.maneuver.location) {
      const waypoint = currentStep.maneuver.location;
      
      const distanceToNext = MapUtils.getDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        waypoint[1],
        waypoint[0]
      );

      if (distanceToNext < 15 && this.currentStepIndex + 1 < steps.length) {
        this.currentStepIndex++;
        this.lastAnnouncedStepIndex = this.currentStepIndex;
        return this.getInstructionForStep(this.currentStepIndex);
      }

      if (distanceToNext < 50 && this.currentStepIndex !== this.lastAnnouncedStepIndex) {
        this.lastAnnouncedStepIndex = this.currentStepIndex;
        return this.getInstructionForStep(this.currentStepIndex);
      }
    }

    return null;
  }

  getInstructionForStep(index) {
    if (!this.activeRoute || !this.activeRoute.steps) return null;
    
    const steps = this.activeRoute.steps;
    const step = steps[index];
    
    if (!step) return "You have reached your destination.";

    const instruction = step.maneuver?.instruction || "Continue straight";
    const distance = Math.round(step.distance || 0);

    if (distance > 20) {
      return `${instruction} in ${distance} meters.`;
    }
    return instruction;
  }
}

export default new NavigationService();


// ============================================
// FILE 4: App.js - CRITICAL NAVIGATION FIX
// Add this handleStartNavigation function
// ============================================

const handleStartNavigation = async (targetOverride = null) => {
  const targetDest = targetOverride || destination;
  
  console.log("🎯 START NAVIGATION:", targetDest);
  
  // Validation
  if (!targetDest || targetDest.trim().length === 0) {
    Alert.alert("No Destination", "Please enter a destination.");
    return;
  }

  if (!location) {
    Alert.alert("No GPS", "Location not available. Please wait for GPS signal.");
    console.log("❌ No location available");
    return;
  }

  console.log("📍 Current location:", location.latitude, location.longitude);

  // Stop chat if running
  if (chatActiveRef.current) await stopChatSession();

  // Show loading
  setIsSearchingRoute(true);
  setStatus('Finding route...');
  AudioService.speak(`Finding route to ${targetDest}`);

  try {
    // Step 1: Geocode
    console.log("🗺️ Geocoding:", targetDest);
    const target = await MapUtils.geocode(targetDest);
    console.log("🗺️ Target:", target);
    
    if (!target) {
      setIsSearchingRoute(false);
      setShowSearch(false);
      Alert.alert("Not Found", `Cannot find "${targetDest}". Try adding city or state.`);
      AudioService.speak("Destination not found");
      return;
    }

    // Step 2: Get directions
    console.log("🚶 Getting route...");
    const route = await MapUtils.getDirections(location, target);
    console.log("🚶 Route result:", route ? `${route.steps.length} steps` : "null");
    
    if (route && route.coordinates && route.coordinates.length > 0) {
      console.log("✅ SUCCESS! Setting up navigation...");
      
      // Close modal
      setShowSearch(false);
      setIsConfirmingVoice(false);
      setIsSearchingRoute(false);
      
      // Set navigation data
      NavigationService.startRoute(route);
      setActiveRouteData(route);
      setIsNavigating(true);
      setShowMap(true); // ← KEY: Show the map!
      
      console.log("✅ Map showing:", true);
      console.log("✅ Route data set with", route.coordinates.length, "coordinates");
      
      // Audio feedback
      const instruction = NavigationService.getInstructionForStep(0);
      const distText = MapUtils.formatDistance(route.distance);
      const durText = MapUtils.formatDuration(route.duration);
      
      setStatus(`NAV: ${instruction}`);
      AudioService.speak(`Route found. ${distText}, ${durText}. ${instruction}`);
      
      // Verify after delay
      setTimeout(() => {
        console.log("🔍 Verification - showMap:", showMap);
        console.log("🔍 Verification - isNavigating:", isNavigating);
        console.log("🔍 Verification - routeData exists:", !!activeRouteData);
      }, 500);
      
    } else {
      console.log("❌ No route found");
      setIsSearchingRoute(false);
      setShowSearch(false);
      Alert.alert("No Route", "Cannot find walking route to this location.");
      AudioService.speak("No walking route found");
    }
    
  } catch (error) {
    console.error("❌ Navigation error:", error);
    setIsSearchingRoute(false);
    setShowSearch(false);
    Alert.alert("Error", "Failed to get route. Check internet connection.");
    AudioService.speak("Navigation error");
  }
};