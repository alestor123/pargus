import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, ActivityIndicator, Linking, Dimensions, Vibration } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import CameraView from './src/components/CameraView';
import AudioService from './src/services/AudioService';
import GroqService from './src/services/GroqService';
import LocationService from './src/services/LocationService';
import MapComponent from './src/components/MapComponent';
import WebView from 'react-native-webview';
import NavigationService from './src/services/NavigationService';
import { MapUtils } from './src/utils/MapUtils';

// 🔑 Google Maps API Key (Optional - OSM is used as free fallback)
// To use Google: Get key from https://console.cloud.google.com/
// To use OSM only: Leave as null
const GOOGLE_MAPS_API_KEY = null; // Set to your key or null for OSM only
import { Alert, TextInput, Modal } from 'react-native';
import VoiceService from './src/services/VoiceService';
import ChatService from './src/services/ChatService';
import VoiceWebView from './src/components/VoiceWebView';
import * as ImageManipulator from 'expo-image-manipulator';

export default function App() {
  const [status, setStatus] = useState('Initializing...');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const cameraRef = useRef(null);
  const liveLoopRef = useRef(null);
  const chatActiveRef = useRef(false);
  const [location, setLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [mapType, setMapType] = useState('satellite'); // 'roadmap', 'satellite', 'streetview', or 'liveview'
  const [currentStepInstruction, setCurrentStepInstruction] = useState('');
  const [heading, setHeading] = useState(0); // Device compass heading
  const [nextTurnDirection, setNextTurnDirection] = useState('STRAIGHT'); // Direction to turn
  const [targetBearing, setTargetBearing] = useState(0); // Bearing to next waypoint
  const [arrowRotation, setArrowRotation] = useState(0); // Calculated arrow rotation
  const lastPositionRef = useRef(null);
  const magnetometerSubscription = useRef(null);
  const lastAnnouncedDirection = useRef(''); // Track last announced direction to avoid repetition
  const [destination, setDestination] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeRouteData, setActiveRouteData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isConfirmingVoice, setIsConfirmingVoice] = useState(false);

  // Smart alert filtering with time-based throttling
  const lastGuidanceRef = useRef('');
  const lastGuidanceTimeRef = useRef(0);
  const isNavigationSpeakingRef = useRef(false);
  
  // Alert history for display
  const [alertHistory, setAlertHistory] = useState([]);
  const [lastAlertTime, setLastAlertTime] = useState(null);

  // Handle incoming live alerts from Groq with smart filtering
  const handleLiveAlert = async (guidance) => {
    try {
      if (guidance && guidance.trim().length > 0) {
        const now = Date.now();
        const cleanedGuidance = guidance.trim().toLowerCase();
        const lastGuidance = lastGuidanceRef.current.toLowerCase();
        
        // Filter out unhelpful Groq responses
        const unhelpfulPhrases = [
          'unrelated to visually impaired',
          'here is an example',
          'however',
          'the image is',
          '(or)',
        ];
        
        const isUnhelpful = unhelpfulPhrases.some(phrase => 
          cleanedGuidance.includes(phrase.toLowerCase())
        );
        
        if (isUnhelpful) {
          console.log("🔇 Groq alert skipped (unhelpful response):", guidance);
          return;
        }
        
        // Calculate similarity (simple word overlap check)
        const isSimilar = cleanedGuidance === lastGuidance || 
                         (cleanedGuidance.length > 10 && lastGuidance.includes(cleanedGuidance.substring(0, 10)));
        
        // Time since last alert
        const timeSinceLastAlert = now - lastGuidanceTimeRef.current;
        
        // ALWAYS update status display (show text even if not speaking)
        setStatus(guidance.toUpperCase());
        setLastAlertTime(now);
        
        // PRIORITY SYSTEM: Don't interrupt navigation voice
        if (isNavigationSpeakingRef.current) {
          console.log("🔇 Groq alert skipped (navigation is speaking):", guidance);
          return;
        }
        
        // SMART FILTER: Only speak if:
        // 1. Guidance has CHANGED (not similar to last)
        // 2. At least 5 seconds have passed since last alert (prevents spam)
        // 3. Navigation is not currently speaking
        if (!isSimilar && timeSinceLastAlert > 5000) {
          // Update alert history (keep last 3 unique alerts)
          setAlertHistory(prev => {
            // Only add if different from most recent
            if (prev.length === 0 || prev[0].toLowerCase() !== cleanedGuidance) {
              const newHistory = [guidance, ...prev.slice(0, 2)];
              return newHistory;
            }
            return prev;
          });
          
          // Haptic feedback for new alerts
          Vibration.vibrate(100);
          
          // Speak the alert (Groq has lower priority)
          await AudioService.speak(guidance);
          
          // Update tracking
          lastGuidanceRef.current = guidance;
          lastGuidanceTimeRef.current = now;
          
          console.log("🔊 Groq alert spoken:", guidance);
        } else {
          // Silently skip - either duplicate or too soon
          if (isSimilar) {
            console.log("🔇 Groq alert skipped (duplicate):", guidance);
          } else {
            console.log("🔇 Groq alert skipped (too soon, wait", (5000 - timeSinceLastAlert)/1000, "more seconds)");
          }
        }
      }
    } catch (e) {
      console.error("ALERT_ERROR", e);
    }
  };

  const analyzeEnvironment = async () => {
    if (!cameraRef.current || !isCameraReady || isAnalyzing) return;

    try {
      setIsAnalyzing(true);

      // 1. Capture with timeout (prevent camera hang)
      const cameraPromise = cameraRef.current.takePictureAsync({
        base64: false,
        shutterSound: false,
        skipProcessing: true
      });
      const camTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('CAM_TIMEOUT')), 2000));

      const photo = await Promise.race([cameraPromise, camTimeout]);

      // 2. Resize
      const manipResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 224 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // 3. API Call with timeout
      const apiTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('API_TIMEOUT')), 8000));
      const guidance = await Promise.race([
        GroqService.analyzeImage(manipResult.base64),
        apiTimeout
      ]);

      handleLiveAlert(guidance);
    } catch (error) {
      if (error.message !== 'CAM_TIMEOUT' && error.message !== 'API_TIMEOUT') {
        console.error("LOOP_ERROR:", error);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleLiveMode = () => {
    const nextLive = !isLive;
    setIsLive(nextLive);

    if (nextLive) {
      // Reset tracking when starting live mode
      lastGuidanceRef.current = '';
      lastGuidanceTimeRef.current = 0;
      setAlertHistory([]);
      setLastAlertTime(null);
      AudioService.speak('Navia Safety Monitoring active. Groq Vision will alert you to obstacles and hazards.');
    } else {
      AudioService.speak('Navia Safety Monitoring deactivated.');
      setStatus('Ready');
      // Reset tracking when stopping
      lastGuidanceRef.current = '';
      lastGuidanceTimeRef.current = 0;
      setAlertHistory([]);
      setLastAlertTime(null);
    }
  };

  useEffect(() => {
    (async () => {
      // Parallel permissions request
      const [locationPerm, voicePerm] = await Promise.all([
        LocationService.requestPermissions(),
        VoiceService.requestPermissions()
      ]);

      if (locationPerm) {
        const coords = await LocationService.getCurrentLocation();
        setLocation(coords);
        
        // Watch location with heading
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (loc) => {
            setLocation(loc.coords);
            if (loc.coords.heading !== undefined && loc.coords.heading !== null && loc.coords.heading >= 0) {
              setHeading(loc.coords.heading);
            }
          }
        );
        
        // Start magnetometer for compass heading
        Magnetometer.setUpdateInterval(100);
        magnetometerSubscription.current = Magnetometer.addListener((data) => {
          const { x, y, z } = data;
          // Calculate heading from magnetometer
          let angle = Math.atan2(y, x) * (180 / Math.PI);
          // Normalize to 0-360
          angle = (angle + 360) % 360;
          setHeading(angle);
        });
      }

      if (!voicePerm) {
        Alert.alert("Permission Required", "Microphone access is needed for voice commands.");
      }
    })();
    
    return () => {
      if (magnetometerSubscription.current) {
        magnetometerSubscription.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (location && isNavigating && activeRouteData) {
      const instruction = NavigationService.updateProgress(location);
      if (instruction) {
        // PRIORITY: Navigation voice is speaking
        isNavigationSpeakingRef.current = true;
        
        AudioService.speak(instruction).then(() => {
          // Navigation finished speaking
          setTimeout(() => {
            isNavigationSpeakingRef.current = false;
          }, 1000); // 1 second buffer
        });
        
        setStatus(`NAV: ${instruction}`);
        setCurrentStepInstruction(instruction);
        
        console.log("🧭 Navigation instruction:", instruction);
      }
      
      // Calculate bearing to next waypoint
      if (activeRouteData.steps && activeRouteData.steps.length > 0) {
        const currentStepIndex = NavigationService.currentStepIndex || 0;
        const currentStep = activeRouteData.steps[currentStepIndex];
        
        if (currentStep && currentStep.maneuver && currentStep.maneuver.location) {
          const targetLat = currentStep.maneuver.location[1];
          const targetLon = currentStep.maneuver.location[0];
          
          // Calculate bearing from current position to target
          const bearing = calculateBearing(
            location.latitude,
            location.longitude,
            targetLat,
            targetLon
          );
          
          setTargetBearing(bearing);
          
          // Determine turn direction based on maneuver type
          const maneuverType = currentStep.maneuver.type || '';
          if (maneuverType.includes('left')) {
            setNextTurnDirection('LEFT');
          } else if (maneuverType.includes('right')) {
            setNextTurnDirection('RIGHT');
          } else if (maneuverType.includes('straight') || maneuverType.includes('continue')) {
            setNextTurnDirection('STRAIGHT');
          } else if (maneuverType.includes('arrive')) {
            setNextTurnDirection('ARRIVE');
          } else {
            setNextTurnDirection('STRAIGHT');
          }
        }
      }
      
      lastPositionRef.current = location;
    }
  }, [location, isNavigating, activeRouteData]);
  
  // Calculate arrow rotation based on compass heading and target bearing
  useEffect(() => {
    if (isNavigating && mapType === 'liveview') {
      // Calculate the difference between where we need to go and where we're facing
      let rotation = targetBearing - heading;
      
      // Normalize to -180 to 180
      while (rotation > 180) rotation -= 360;
      while (rotation < -180) rotation += 360;
      
      setArrowRotation(rotation);
      
      // Voice feedback for direction changes
      const direction = getArrowDirection(rotation);
      if (direction.label !== lastAnnouncedDirection.current) {
        // Announce new direction (with throttling to avoid spam)
        lastAnnouncedDirection.current = direction.label;
        
        // Only announce significant changes (not every tiny adjustment)
        // AND don't interrupt navigation instructions
        if (direction.label !== 'GO STRAIGHT' || Math.abs(rotation) < 10) {
          if (!isNavigationSpeakingRef.current) {
            setTimeout(() => {
              if (!isNavigationSpeakingRef.current) {
                AudioService.speak(direction.voiceCommand);
              }
            }, 500);
          }
        }
      }
    }
  }, [heading, targetBearing, isNavigating, mapType]);
  
  // Get arrow direction based on angle rules
  const getArrowDirection = (rotation) => {
    const absRotation = Math.abs(rotation);
    
    // Define angle thresholds
    if (absRotation <= 20) {
      // 0-20°: Go straight
      return {
        emoji: '⬆️',
        label: 'GO STRAIGHT',
        color: '#00FF00',
        rotation: 0, // Lock to straight
        voiceCommand: 'Keep going straight'
      };
    } else if (absRotation <= 45) {
      // 20-45°: Slight turn
      return {
        emoji: rotation < 0 ? '↖️' : '↗️',
        label: rotation < 0 ? 'SLIGHT LEFT' : 'SLIGHT RIGHT',
        color: '#FFFF00',
        rotation: rotation < 0 ? -30 : 30,
        voiceCommand: rotation < 0 ? 'Bear slightly left' : 'Bear slightly right'
      };
    } else if (absRotation <= 90) {
      // 45-90°: Turn
      return {
        emoji: rotation < 0 ? '⬅️' : '➡️',
        label: rotation < 0 ? 'TURN LEFT' : 'TURN RIGHT',
        color: '#FF9900',
        rotation: rotation < 0 ? -90 : 90,
        voiceCommand: rotation < 0 ? 'Turn left now' : 'Turn right now'
      };
    } else if (absRotation <= 135) {
      // 90-135°: Sharp turn
      return {
        emoji: rotation < 0 ? '↙️' : '↘️',
        label: rotation < 0 ? 'SHARP LEFT' : 'SHARP RIGHT',
        color: '#FF6600',
        rotation: rotation < 0 ? -120 : 120,
        voiceCommand: rotation < 0 ? 'Make a sharp left turn' : 'Make a sharp right turn'
      };
    } else {
      // 135-180°: Turn around
      return {
        emoji: '⬇️',
        label: 'TURN AROUND',
        color: '#FF0000',
        rotation: 180,
        voiceCommand: 'Turn around, you are going the wrong way'
      };
    }
  };
  
  // Helper function to calculate bearing between two points
  const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    return bearing;
  };
  
  // Google Directions API call
  const getGoogleDirections = async (origin, destination) => {
    try {
      console.log("🗺️ Getting Google Directions...");
      
      const url = `https://maps.googleapis.com/maps/api/directions/json?` +
        `origin=${origin.latitude},${origin.longitude}` +
        `&destination=${destination.latitude},${destination.longitude}` +
        `&mode=walking` +
        `&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log("🗺️ Google response status:", data.status);
      
      if (data.status === 'OK' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        // Decode polyline
        const coordinates = decodePolyline(route.overview_polyline.points);
        
        // Process steps
        const steps = leg.steps.map((step, index) => ({
          distance: step.distance.value,
          duration: step.duration.value,
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''), // Remove HTML tags
          maneuver: {
            type: step.maneuver || 'straight',
            location: [
              step.start_location.lng,
              step.start_location.lat
            ],
            instruction: step.html_instructions.replace(/<[^>]*>/g, '')
          }
        }));
        
        console.log("✅ Google route found:", coordinates.length, "points,", steps.length, "steps");
        
        return {
          coordinates,
          distance: leg.distance.value,
          duration: leg.duration.value,
          steps,
          destination: {
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
          source: 'google'
        };
      } else {
        console.log("❌ Google Directions failed:", data.status, data.error_message);
        return null;
      }
    } catch (error) {
      console.error("❌ Google Directions error:", error);
      return null;
    }
  };
  
  // Decode Google polyline
  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5
      });
    }
    return points;
  };

  const handleStartNavigation = async (targetOverride = null) => {
    // Get destination - prioritize override, then state
    let targetDest = targetOverride || destination;
    
    console.log("🎯 START NAVIGATION");
    console.log("🎯 targetOverride:", targetOverride);
    console.log("🎯 destination state:", destination);
    console.log("🎯 targetDest:", targetDest);
    console.log("🎯 Type:", typeof targetDest);
    console.log("🎯 Length:", targetDest?.length);
    
    // Convert to string if needed
    if (targetDest && typeof targetDest !== 'string') {
      targetDest = String(targetDest);
      console.log("🎯 Converted to string:", targetDest);
    }
    
    // Trim whitespace
    if (targetDest && typeof targetDest === 'string') {
      targetDest = targetDest.trim();
      console.log("🎯 After trim:", targetDest, "Length:", targetDest.length);
    }
    
    // Validate destination input
    if (!targetDest || targetDest.length === 0) {
      console.log("❌ Validation failed - empty destination");
      AudioService.speak("Please enter a valid destination.");
      Alert.alert("No Destination", "Please enter a destination.");
      return;
    }

    // Validate location is available
    if (!location) {
      console.log("❌ No location available");
      AudioService.speak("Location not available yet. Please wait a moment.");
      Alert.alert("No GPS", "Location not available. Please wait for GPS signal.");
      return;
    }

    console.log("✅ Validation passed!");
    console.log("📍 Current location:", location.latitude, location.longitude);

    // Stop chat if running, as navigation takes over audio
    if (chatActiveRef.current) await stopChatSession();

    setShowSearch(false);
    setIsConfirmingVoice(false);
    setStatus('Finding route...');
    AudioService.speak(`Searching for ${targetDest}`);

    try {
      console.log("🗺️ Geocoding:", targetDest);
      const target = await MapUtils.geocode(targetDest);
      console.log("🗺️ Target result:", target);
      
      if (target && location) {
        console.log("🚶 Getting route...");
        
        let route = null;
        
        // Try Google Directions if API key is available
        if (GOOGLE_MAPS_API_KEY) {
          route = await getGoogleDirections(location, target);
        }
        
        // Use OpenStreetMap if Google not available or failed
        if (!route) {
          console.log("🗺️ Using OpenStreetMap (free)...");
          route = await MapUtils.getDirections(location, target);
          if (route) route.source = 'osm';
        }
        
        console.log("🚶 Route result:", route ? `${route.steps?.length} steps from ${route.source || 'OSM'}` : "null");
        
        if (route && route.coordinates && route.coordinates.length > 0) {
          console.log("✅ SUCCESS! Setting up navigation...");
          
          NavigationService.startRoute(route);
          setActiveRouteData(route);
          setIsNavigating(true);
          setShowMap(true); // Show the map
          lastPositionRef.current = location;
          setNextTurnDirection('STRAIGHT');
          lastAnnouncedDirection.current = ''; // Reset voice announcements
          
          const instruction = NavigationService.getInstructionForStep(0);
          const distText = MapUtils.formatDistance(route.distance);
          const durText = MapUtils.formatDuration(route.duration);
          
          setStatus(`NAV: ${instruction}`);
          const sourceName = route.source === 'google' ? 'Google Maps' : 'OpenStreetMap';
          AudioService.speak(`Route found via ${sourceName}. ${distText}, ${durText}. ${instruction}`);
        } else {
          console.log("❌ No route found");
          setStatus('Ready');
          AudioService.speak("Could not find a walking route to that location.");
          Alert.alert("No Route", "Cannot find walking route to this location.");
        }
      } else {
        console.log("❌ Destination not found");
        setStatus('Ready');
        AudioService.speak("Destination not found. Please try a different location.");
        Alert.alert("Not Found", `Cannot find "${targetDest}". Try adding city or state.`);
      }
    } catch (error) {
      console.error("❌ Navigation error:", error);
      setStatus('Ready');
      AudioService.speak("Navigation error. Please try again.");
      Alert.alert("Error", "Failed to get route. Check internet connection.");
    }
  };

  const stopChatSession = async () => {
    chatActiveRef.current = false;
    setIsChatting(false);
    setIsListening(false);
    await VoiceService.stopListening();
    AudioService.stop();
    setStatus("Ready");
  };

  const runChatLoop = async () => {
    if (!chatActiveRef.current) return;

    await VoiceService.startListening(
      async (result) => {
        // onResult
        setIsListening(false);
        if (!chatActiveRef.current) return;

        setStatus(`Navia Thinking...`);

        const responseObj = await ChatService.getChatResponse(result, location);

        if (!chatActiveRef.current) return;

        setStatus(`Navia: ${responseObj.text}`);
        await AudioService.speak(responseObj.text);

        // Handle Navigation Intent
        if (responseObj.navTarget) {
          setDestination(responseObj.navTarget);
          await handleStartNavigation(responseObj.navTarget);
          return; // Exit loop since navigation took over
        }

        // Loop: Listen again if still active
        if (chatActiveRef.current) {
          runChatLoop();
        }
      },
      (error) => {
        // onError
        setIsListening(false);
        if (!chatActiveRef.current) return;

        if (error === 'INITIALIZING') {
          setTimeout(() => { if (chatActiveRef.current) runChatLoop(); }, 1000);
        } else {
          console.log("Chat Loop Error:", error);
          if (chatActiveRef.current) {
            runChatLoop();
          }
        }
      },
      () => {
        // onStart
        if (chatActiveRef.current) {
          setIsListening(true);
        }
      }
    );
  };

  const toggleChatSession = async () => {
    if (isChatting) {
      await stopChatSession();
    } else {
      setIsChatting(true);
      chatActiveRef.current = true;
      AudioService.speak("I'm listening.").then(() => {
        runChatLoop();
      });
    }
  };

  const startVoiceSearch = async () => {
    AudioService.speak("Connecting to Google Voice.");

    await VoiceService.startListening(
      (result) => {
        console.log("🎤 Voice result received:", result);
        console.log("🎤 Type:", typeof result, "Length:", result?.length);
        
        // Validate voice result
        if (result && typeof result === 'string' && result.trim().length > 0) {
          const trimmedResult = result.trim();
          console.log("✅ Valid voice input:", trimmedResult);
          
          setDestination(trimmedResult);
          setIsListening(false);
          setIsConfirmingVoice(true);
          AudioService.speak(`I heard ${trimmedResult}. Tap START to navigate or speak again to change.`);
        } else {
          console.log("❌ Invalid voice result");
          setIsListening(false);
          AudioService.speak("Sorry, I didn't catch that. Please try again.");
        }
      },
      (error) => {
        console.log("🎤 Voice error:", error);
        setIsListening(false);
        if (error === 'INITIALIZING') {
          AudioService.speak("Voice search is initializing. Please try again in a moment.");
        } else {
          AudioService.speak("Sorry, I didn't catch that.");
        }
      },
      () => {
        console.log("🎤 Voice listening started");
        setIsListening(true);
        AudioService.speak("Ready. Speak your destination.");
      }
    );
  };

  useEffect(() => {
    return () => {
      VoiceService.destroy();
    };
  }, []);

  const openGoogleMaps = () => {
    if (location) {
      const url = `google.navigation:q=desired+destination&mode=w`;
      Linking.openURL(url).catch(err => console.error("LINKING_ERROR", err));
    } else {
      AudioService.speak('Location not available yet.');
    }
  };

  useEffect(() => {
    let isActive = true;

    const runLiveLoop = async () => {
      if (!isLive || !isCameraReady || !isActive) return;

      await analyzeEnvironment();

      // Reliable delay for hardware reset
      if (isActive && isLive) {
        liveLoopRef.current = setTimeout(runLiveLoop, 200);
      }
    };

    if (isLive && isCameraReady) {
      runLiveLoop();
    }

    return () => {
      isActive = false;
      if (liveLoopRef.current) clearTimeout(liveLoopRef.current);
    };
  }, [isLive, isCameraReady]);

  useEffect(() => {
    AudioService.speak('Navia Safety Intelligence. Tap top for check, or bottom for Continuous Protection.');
    setStatus('Ready');
  }, []);

  // Timer to show "seconds ago" for last alert
  const getTimeSinceLastAlert = () => {
    if (!lastAlertTime || !isLive) return '';
    const seconds = Math.floor((Date.now() - lastAlertTime) / 1000);
    if (seconds < 2) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  // Update timer display every second when live
  useEffect(() => {
    if (!isLive) return;
    
    const interval = setInterval(() => {
      // Force re-render to update time display
      setLastAlertTime(prev => prev);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive]);

  // Generate Google Maps HTML with satellite and street view
  const getGoogleMapHTML = (location, routeData, mapType) => {
    const userLat = location?.latitude || 0;
    const userLon = location?.longitude || 0;
    
    let routeCoordinates = '[]';
    let destLat = userLat;
    let destLon = userLon;
    let hasRoute = false;
    let nextTurnLat = userLat;
    let nextTurnLon = userLon;
    
    if (routeData && routeData.coordinates && routeData.coordinates.length > 0) {
      hasRoute = true;
      const coords = routeData.coordinates.map(c => `{lat: ${c.latitude}, lng: ${c.longitude}}`).join(',');
      routeCoordinates = `[${coords}]`;
      const lastCoord = routeData.coordinates[routeData.coordinates.length - 1];
      destLat = lastCoord.latitude;
      destLon = lastCoord.longitude;
      
      // Find next turn for street view
      if (routeData.steps && routeData.steps.length > 0) {
        const currentStep = routeData.steps[0];
        if (currentStep.maneuver && currentStep.maneuver.location) {
          nextTurnLon = currentStep.maneuver.location[0];
          nextTurnLat = currentStep.maneuver.location[1];
        }
      }
    }
    
    const isStreetView = mapType === 'streetview';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, system-ui; overflow: hidden; }
          #map { height: 100vh; width: 100vw; }
          #streetview { height: 100vh; width: 100vw; display: ${isStreetView ? 'block' : 'none'}; }
        </style>
      </head>
      <body>
        <div id="map" style="display: ${isStreetView ? 'none' : 'block'}"></div>
        <div id="streetview"></div>
        <script>
          let map;
          let panorama;
          let userMarker;
          let destMarker;
          let routeLine;
          
          function initMap() {
            const userPos = { lat: ${userLat}, lng: ${userLon} };
            const nextTurnPos = { lat: ${nextTurnLat}, lng: ${nextTurnLon} };
            
            if (${isStreetView}) {
              // Street View Mode
              panorama = new google.maps.StreetViewPanorama(
                document.getElementById('streetview'),
                {
                  position: userPos,
                  pov: {
                    heading: calculateHeading(userPos, nextTurnPos),
                    pitch: 0
                  },
                  disableDefaultUI: true,
                  linksControl: false,
                  panControl: false,
                  enableCloseButton: false,
                  fullscreenControl: false,
                  addressControl: false,
                  showRoadLabels: true,
                  motionTracking: false,
                  motionTrackingControl: false
                }
              );
            } else {
              // Map View Mode
              map = new google.maps.Map(document.getElementById("map"), {
                center: userPos,
                zoom: ${hasRoute ? '16' : '18'},
                mapTypeId: '${mapType}',
                disableDefaultUI: true,
                zoomControl: false,
                mapTypeControl: false,
                scaleControl: false,
                streetViewControl: false,
                rotateControl: false,
                fullscreenControl: false,
                gestureHandling: 'greedy',
                styles: ${mapType === 'roadmap' ? '[{featureType: "poi", stylers: [{visibility: "off"}]}]' : '[]'}
              });
              
              // User marker (blue dot with pulse)
              userMarker = new google.maps.Marker({
                position: userPos,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 4,
                },
                zIndex: 1000
              });
              
              const hasRoute = ${hasRoute};
              if (hasRoute) {
                const destPos = { lat: ${destLat}, lng: ${destLon} };
                const routePath = ${routeCoordinates};
                
                // Destination marker (red)
                destMarker = new google.maps.Marker({
                  position: destPos,
                  map: map,
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 14,
                    fillColor: '#EA4335',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 4,
                  },
                  zIndex: 999
                });
                
                // Route polyline
                routeLine = new google.maps.Polyline({
                  path: routePath,
                  geodesic: true,
                  strokeColor: '#4285F4',
                  strokeOpacity: 0.9,
                  strokeWeight: 7,
                  map: map,
                  zIndex: 500
                });
                
                // Fit bounds to show both markers
                const bounds = new google.maps.LatLngBounds();
                bounds.extend(userPos);
                bounds.extend(destPos);
                map.fitBounds(bounds, 60);
              }
            }
          }
          
          function calculateHeading(from, to) {
            const lat1 = from.lat * Math.PI / 180;
            const lat2 = to.lat * Math.PI / 180;
            const dLng = (to.lng - from.lng) * Math.PI / 180;
            
            const y = Math.sin(dLng) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
            const heading = Math.atan2(y, x) * 180 / Math.PI;
            
            return (heading + 360) % 360;
          }
          
          window.initMap = initMap;
        </script>
        <script src="https://maps.googleapis.com/maps/api/js?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&callback=initMap" async defer></script>
      </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView cameraRef={cameraRef} onCameraReady={() => setIsCameraReady(true)} />

      {/* Main touchable area - optimized for quick access */}
      <TouchableOpacity
        activeOpacity={1}
        style={styles.scanArea}
        onPress={analyzeEnvironment}
        disabled={isAnalyzing || isLive}
        accessible={true}
        accessibilityLabel="Instant environment check"
        accessibilityHint="Double tap to analyze surroundings"
        accessibilityRole="button"
      >
        {/* Compact status banner at top */}
        <View style={styles.statusContainer}>
          <View style={styles.statusBanner}>
            <Text 
              style={styles.statusText}
              accessibilityLiveRegion="polite"
              numberOfLines={2}
            >
              {isLive ? '🔴 LIVE' : status.toUpperCase()}
            </Text>
            {isAnalyzing && !isLive && (
              <ActivityIndicator 
                color="#00FF00" 
                size="small"
                style={styles.activityIndicator}
              />
            )}
          </View>

          {/* Show current detection in live mode */}
          {isLive && status !== 'Ready' && (
            <View style={styles.liveStatusCard}>
              <Text style={styles.liveStatusText}>{status}</Text>
              {lastAlertTime && (
                <Text style={styles.timestampText}>{getTimeSinceLastAlert()}</Text>
              )}
            </View>
          )}

          {/* Alert history (last 3 detections) */}
          {isLive && alertHistory.length > 0 && (
            <View style={styles.historyContainer}>
              {alertHistory.slice(0, 3).map((alert, index) => (
                <Text key={index} style={[styles.historyText, { opacity: 1 - (index * 0.3) }]}>
                  {index === 0 ? '→ ' : '  '}{alert}
                </Text>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Google Maps overlay with Live View AR */}
      {showMap && location && (
        <View style={styles.mapOverlay}>
          {mapType === 'liveview' ? (
            // Live View with Camera + AR overlay
            <View style={styles.liveViewContainer}>
              <CameraView 
                cameraRef={cameraRef} 
                onCameraReady={() => setIsCameraReady(true)}
                style={styles.liveViewCamera}
              />
              
              {/* AR Navigation Overlay */}
              <View style={styles.arOverlay}>
                {isNavigating && activeRouteData && (
                  <>
                    {/* Distance to destination */}
                    <View style={styles.arTopBar}>
                      <Text style={styles.arDistanceText}>
                        📍 {MapUtils.formatDistance(activeRouteData.distance)}
                      </Text>
                      <Text style={styles.arTimeText}>
                        {MapUtils.formatDuration(activeRouteData.duration)}
                      </Text>
                    </View>
                    
                    {/* Large Direction Arrow - with angle-based rules */}
                    {(() => {
                      const direction = getArrowDirection(arrowRotation);
                      return (
                        <View style={styles.arArrowContainer}>
                          <Text 
                            style={[
                              styles.arArrow,
                              { transform: [{ rotate: `${direction.rotation}deg` }] }
                            ]}
                          >
                            {direction.emoji}
                          </Text>
                          <View style={styles.arDirectionInfo}>
                            <Text style={[styles.arArrowLabel, { borderColor: direction.color }]}>
                              {direction.label}
                            </Text>
                            <View style={styles.arAngleIndicator}>
                              <View style={[styles.arAngleBar, { backgroundColor: direction.color }]} />
                              <Text style={styles.arBearingText}>
                                {Math.abs(arrowRotation).toFixed(0)}° {arrowRotation < 0 ? 'left' : arrowRotation > 0 ? 'right' : ''}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                    
                    {/* Current Instruction */}
                    {currentStepInstruction && (
                      <View style={styles.arInstructionBox}>
                        <Text style={styles.arInstructionText}>
                          {currentStepInstruction}
                        </Text>
                      </View>
                    )}
                    
                    {/* Groq Vision + Voice Status Indicator */}
                    {isLive && (
                      <View style={styles.arGroqIndicator}>
                        <Text style={styles.arGroqIcon}>👁️</Text>
                        <Text style={styles.arGroqText}>GROQ VISION ACTIVE</Text>
                      </View>
                    )}
                    
                    {/* Voice Navigation Indicator */}
                    <View style={styles.arVoiceIndicator}>
                      <Text style={styles.arVoiceIcon}>🔊</Text>
                      <Text style={styles.arVoiceText}>VOICE GUIDANCE ON</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          ) : (
            // Regular Map View
            <WebView
              source={{ html: getGoogleMapHTML(location, activeRouteData, mapType) }}
              style={styles.webview}
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />
          )}
          
          {/* Map controls overlay */}
          <View style={styles.mapControls}>
            <TouchableOpacity
              style={styles.mapControlButton}
              onPress={() => {
                if (mapType === 'satellite') setMapType('roadmap');
                else if (mapType === 'roadmap') setMapType('streetview');
                else if (mapType === 'streetview') setMapType('liveview');
                else setMapType('satellite');
              }}
              accessible={true}
              accessibilityLabel="Switch map view"
            >
              <Text style={styles.mapControlIcon}>
                {mapType === 'satellite' ? '🗺️' : 
                 mapType === 'roadmap' ? '👁️' : 
                 mapType === 'streetview' ? '📱' : '🛰️'}
              </Text>
              <Text style={styles.mapControlText}>
                {mapType === 'satellite' ? 'MAP' : 
                 mapType === 'roadmap' ? 'STREET' : 
                 mapType === 'streetview' ? 'LIVE' : 'SAT'}
              </Text>
            </TouchableOpacity>
            
            {isNavigating && mapType !== 'liveview' && (
              <>
                {currentStepInstruction && (
                  <View style={styles.instructionOverlay}>
                    <Text style={styles.instructionText}>{currentStepInstruction}</Text>
                  </View>
                )}
              </>
            )}
            
            {activeRouteData && mapType !== 'liveview' && (
              <View style={styles.routeInfoOverlay}>
                <Text style={styles.routeInfoText}>
                  📍 {MapUtils.formatDistance(activeRouteData.distance)} • {MapUtils.formatDuration(activeRouteData.duration)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Optimized control panel - larger buttons in 2x2 grid */}
      <View style={styles.controlPanel}>
        {/* Top row - 2 equal buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, showMap && styles.buttonActive]}
            onPress={() => setShowMap(!showMap)}
            accessible={true}
            accessibilityLabel={showMap ? 'Hide map' : 'Show map'}
            accessibilityRole="button"
            accessibilityState={{ selected: showMap }}
          >
            <Text style={styles.buttonIcon}>{showMap ? '📍' : '🗺️'}</Text>
            <Text style={styles.buttonLabel}>{showMap ? 'HIDE' : 'MAP'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              if (isChatting) await stopChatSession();
              setShowSearch(true);
            }}
            accessible={true}
            accessibilityLabel="Set destination"
            accessibilityRole="button"
          >
            <Text style={styles.buttonIcon}>🎯</Text>
            <Text style={styles.buttonLabel}>GOAL</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom row - 2 equal buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, isLive && styles.liveActive]}
            onPress={toggleLiveMode}
            accessible={true}
            accessibilityLabel={isLive ? "Stop monitoring" : "Start monitoring"}
            accessibilityRole="button"
            accessibilityState={{ selected: isLive }}
          >
            <Text style={styles.buttonIcon}>{isLive ? '⏹️' : '▶️'}</Text>
            <Text style={styles.buttonLabel}>{isLive ? 'STOP' : 'START'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, isChatting && styles.chatActive]}
            onPress={toggleChatSession}
            accessible={true}
            accessibilityLabel={isChatting ? (isListening ? 'Listening' : 'Stop chat') : 'Start chat'}
            accessibilityRole="button"
            accessibilityState={{ selected: isChatting }}
          >
            <Text style={styles.buttonIcon}>{isChatting ? (isListening ? '🎤' : '💬') : '💬'}</Text>
            <Text style={styles.buttonLabel}>
              {isChatting ? (isListening ? 'LISTEN' : 'STOP') : 'CHAT'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Streamlined modal */}
      <Modal visible={showSearch} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Destination</Text>
            
            <TextInput
              style={styles.textInput}
              placeholder="Where to?"
              placeholderTextColor="#666"
              value={destination}
              onChangeText={(text) => {
                console.log("📝 Text input changed:", text);
                setDestination(text);
                setIsConfirmingVoice(false);
              }}
              autoFocus
              accessible={true}
              accessibilityLabel="Destination input"
              returnKeyType="done"
              onSubmitEditing={() => {
                console.log("⏎ Submit pressed with:", destination);
                if (destination && destination.trim().length > 0) {
                  handleStartNavigation();
                }
              }}
            />
            
            {/* Debug display */}
            {destination && destination.trim().length > 0 && (
              <View style={styles.debugBanner}>
                <Text style={styles.debugText}>
                  Ready: "{destination}" ({destination.length} chars)
                </Text>
              </View>
            )}
            
            {isConfirmingVoice && (
              <View style={styles.confirmBanner}>
                <Text style={styles.confirmText}>📍 {destination}</Text>
              </View>
            )}

            {/* Stacked modal buttons for easy access */}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.voiceButton, isListening && styles.listeningButton]}
                onPress={isListening ? () => VoiceService.stopListening() : startVoiceSearch}
                accessible={true}
                accessibilityLabel={isListening ? 'Stop listening' : 'Voice input'}
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonIcon}>🎤</Text>
                <Text style={styles.modalButtonText}>
                  {isListening ? 'LISTENING...' : 'VOICE INPUT'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalButton, styles.goButton]} 
                onPress={() => {
                  console.log("🚀 START button pressed");
                  console.log("🚀 Current destination state:", destination);
                  console.log("🚀 Destination type:", typeof destination);
                  console.log("🚀 Destination length:", destination?.length);
                  handleStartNavigation();
                }}
                accessible={true}
                accessibilityLabel="Start navigation"
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonIcon}>✓</Text>
                <Text style={styles.modalButtonText}>START</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setShowSearch(false)}
                accessible={true}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={styles.modalButtonIcon}>✕</Text>
                <Text style={styles.modalButtonText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <VoiceWebView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scanArea: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    bottom: 200,
  },
  
  // Compact status at top
  statusContainer: {
    position: 'absolute',
    top: 10,
    left: 15,
    right: 15,
  },
  statusBanner: {
    backgroundColor: '#000000',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#00FF00',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  activityIndicator: {
    marginLeft: 8,
  },

  // Live mode status card
  liveStatusCard: {
    marginTop: 8,
    backgroundColor: '#001100',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00FF00',
  },
  liveStatusText: {
    color: '#00FF00',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  timestampText: {
    color: '#00AA00',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  // Alert history
  historyContainer: {
    marginTop: 8,
    backgroundColor: '#000000',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#003300',
  },
  historyText: {
    color: '#00AA00',
    fontSize: 12,
    marginVertical: 2,
  },

  // Map overlay
  mapOverlay: {
    position: 'absolute',
    top: 70,
    left: 15,
    right: 15,
    bottom: 220,
    backgroundColor: '#000',
    borderWidth: 3,
    borderColor: '#00FF00',
    borderRadius: 12,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  mapControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 10,
  },
  mapControlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00FF00',
    padding: 10,
    alignItems: 'center',
    minWidth: 60,
  },
  mapControlIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  mapControlText: {
    color: '#00FF00',
    fontSize: 11,
    fontWeight: 'bold',
  },
  routeInfoOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00FF00',
    padding: 12,
    marginTop: 8,
  },
  routeInfoText: {
    color: '#00FF00',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  instructionOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00FF00',
    padding: 14,
    marginTop: 8,
    maxWidth: 250,
  },
  instructionText: {
    color: '#00FF00',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 18,
  },
  
  // Live View AR Styles
  liveViewContainer: {
    flex: 1,
    position: 'relative',
  },
  liveViewCamera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  arOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arTopBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 20,
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00FF00',
  },
  arDistanceText: {
    color: '#00FF00',
    fontSize: 20,
    fontWeight: 'bold',
  },
  arTimeText: {
    color: '#00AA00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  arArrowContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  arArrow: {
    fontSize: 120,
    textShadowColor: 'rgba(0, 255, 0, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  arDirectionInfo: {
    alignItems: 'center',
    marginTop: 10,
  },
  arArrowLabel: {
    color: '#00FF00',
    fontSize: 24,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#00FF00',
    textShadowColor: 'rgba(0, 255, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  arBearingText: {
    color: '#00AA00',
    fontSize: 16,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00AA00',
  },
  arAngleIndicator: {
    marginTop: 8,
    alignItems: 'center',
  },
  arAngleBar: {
    height: 4,
    width: 80,
    borderRadius: 2,
    marginBottom: 6,
  },
  arInstructionBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 20,
    marginHorizontal: 20,
    borderWidth: 3,
    borderColor: '#00FF00',
    maxWidth: '85%',
  },
  arInstructionText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  arGroqIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF9900',
    flexDirection: 'row',
    gap: 10,
  },
  arGroqIcon: {
    fontSize: 20,
  },
  arGroqText: {
    color: '#FF9900',
    fontSize: 12,
    fontWeight: 'bold',
  },
  arVoiceIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00FF00',
    flexDirection: 'row',
    gap: 10,
  },
  arVoiceIcon: {
    fontSize: 20,
  },
  arVoiceText: {
    color: '#00FF00',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Optimized control panel - 2x2 grid
  controlPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    paddingTop: 15,
    paddingBottom: 30,
    paddingHorizontal: 15,
    borderTopWidth: 3,
    borderTopColor: '#00FF00',
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 10,
  },
  
  // Large, easy-to-find buttons
  actionButton: {
    flex: 1,
    height: 85,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#00FF00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButton: {
    borderWidth: 4,
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  buttonActive: {
    backgroundColor: '#003300',
    borderColor: '#00FF00',
  },
  liveActive: {
    backgroundColor: '#330000',
    borderColor: '#FF0000',
    shadowColor: '#FF0000',
  },
  chatActive: {
    backgroundColor: '#1a0033',
    borderColor: '#9933FF',
    shadowColor: '#9933FF',
  },
  buttonIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // Modal - centered and efficient
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#0a0a0a',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#00FF00',
    padding: 24,
  },
  modalTitle: {
    color: '#00FF00',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 2,
  },
  textInput: {
    backgroundColor: '#000000',
    color: '#FFFFFF',
    fontSize: 20,
    padding: 18,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#00FF00',
    marginBottom: 16,
  },
  confirmBanner: {
    backgroundColor: '#003300',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#00FF00',
    marginBottom: 16,
    alignItems: 'center',
  },
  confirmText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
  },
  debugBanner: {
    backgroundColor: '#1a1a00',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666600',
    marginBottom: 12,
  },
  debugText: {
    color: '#CCCC00',
    fontSize: 12,
    fontFamily: 'monospace',
  },

  // Modal buttons - stacked vertically for easy access
  modalButtonContainer: {
    gap: 12,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 12,
    borderWidth: 3,
    gap: 10,
  },
  voiceButton: {
    backgroundColor: '#1a0033',
    borderColor: '#9933FF',
  },
  listeningButton: {
    backgroundColor: '#330000',
    borderColor: '#FF0000',
  },
  goButton: {
    backgroundColor: '#003300',
    borderColor: '#00FF00',
  },
  cancelButton: {
    backgroundColor: '#1a1a1a',
    borderColor: '#666666',
  },
  modalButtonIcon: {
    fontSize: 24,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});