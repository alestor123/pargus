import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import CameraView from './src/components/CameraView';
import AudioService from './src/services/AudioService';
import GroqService from './src/services/GroqService';
import LocationService from './src/services/LocationService';
import MapComponent from './src/components/MapComponent';
import NavigationService from './src/services/NavigationService';
import { MapUtils } from './src/utils/MapUtils';
import { Alert, TextInput, Modal } from 'react-native';
import VoiceService from './src/services/VoiceService';
import ChatService from './src/services/ChatService';
import VoiceWebView from './src/components/VoiceWebView';

export default function App() {
  const [status, setStatus] = useState('Initializing...');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const cameraRef = useRef(null);
  const liveLoopRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [destination, setDestination] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeRouteData, setActiveRouteData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isConfirmingVoice, setIsConfirmingVoice] = useState(false);

  // Handle incoming live alerts from WebSocket
  const handleLiveAlert = async (guidance) => {
    try {
      let finalGuidance = '';
      let direction = 'CENTER';
      let distance = 1.0;
      let priority = 'NORMAL';

      let cleanGuidance = guidance.trim();
      if (cleanGuidance.includes('```')) {
        cleanGuidance = cleanGuidance.replace(/```json\n?|\n?```/g, '').trim();
      }

      const spatialData = JSON.parse(cleanGuidance);
      direction = spatialData.direction || 'CENTER';
      finalGuidance = spatialData.object || '';
      distance = parseFloat(spatialData.distance) || 1.0;
      priority = spatialData.priority || 'NORMAL';

      if (finalGuidance) {
        const isUrgent = priority === 'URGENT';
        await AudioService.playSpatialCue(direction, distance, isUrgent);

        // Small delay to let the directional ping settle before speaking
        setTimeout(async () => {
          await AudioService.speak(finalGuidance);
          setStatus(`${priority}: ${finalGuidance} (${distance}m ${direction})`);
        }, 300);
      }
    } catch (e) {
      if (guidance.length < 50) {
        await AudioService.speak(guidance);
        setStatus(`AI: ${guidance}`);
      }
    }
  };

  const analyzeEnvironment = async () => {
    if (!cameraRef.current || !isCameraReady || isAnalyzing) return;

    try {
      setIsAnalyzing(true);

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: isLive ? 0.05 : 0.1,
        shutterSound: false,
        skipProcessing: isLive
      });

      const guidance = await GroqService.analyzeImage(photo.base64);

      handleLiveAlert(guidance);
    } catch (error) {
      console.error("ANALYSIS_ERROR:", error);
      console.error("ERROR_STACK:", error.stack);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleLiveMode = () => {
    const nextLive = !isLive;
    setIsLive(nextLive);

    if (nextLive) {
      AudioService.speak('Navia Safety Monitoring active via Groq.');
    } else {
      AudioService.speak('Navia deactivated.');
      setStatus('Ready');
    }
  };

  useEffect(() => {
    (async () => {
      const hasPermission = await LocationService.requestPermissions();
      if (hasPermission) {
        const coords = await LocationService.getCurrentLocation();
        setLocation(coords);
        LocationService.watchLocation((newCoords) => {
          setLocation(newCoords);
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (location && isNavigating) {
      const instruction = NavigationService.updateProgress(location);
      if (instruction) {
        AudioService.speak(instruction);
        setStatus(`NAV: ${instruction}`);
      }
    }
  }, [location, isNavigating]);

  const handleStartNavigation = async () => {
    if (!destination) return;
    setShowSearch(false);
    setIsConfirmingVoice(false);
    AudioService.speak(`Searching for ${destination}`);

    const target = await MapUtils.geocode(destination);
    if (target && location) {
      const route = await MapUtils.getDirections(location, target);
      if (route) {
        NavigationService.startRoute(route);
        setActiveRouteData(route);
        setIsNavigating(true);
        AudioService.speak(`Route found. ${NavigationService.getInstructionForStep(0)}`);
      } else {
        AudioService.speak("Could not find a walking route to that location.");
      }
    } else {
      AudioService.speak("Destination not found.");
    }
  };

  const startChatSession = async () => {
    setIsChatting(true);
    AudioService.speak("Waking up Navia.");

    await VoiceService.startListening(
      async (result) => {
        setIsListening(false);
        setStatus(`Navia Thinking...`);

        const response = await ChatService.getChatResponse(result, location);
        AudioService.speak(response);
        setStatus(`Navia: ${response}`);
        setIsChatting(false);
      },
      (error) => {
        setIsListening(false);
        setIsChatting(false);
        if (error === 'INITIALIZING') {
          AudioService.speak("Voice assistant is still connecting. Please wait a few seconds.");
        } else {
          AudioService.speak("I missed that. Please try again.");
        }
      },
      () => {
        setIsListening(true);
        AudioService.speak("How can I help?");
      }
    );
  };

  const startVoiceSearch = async () => {
    AudioService.speak("Connecting to Google Voice.");

    await VoiceService.startListening(
      (result) => {
        setDestination(result);
        setIsListening(false);
        setIsConfirmingVoice(true);
        AudioService.speak(`I heard ${result}. Is this correct? You can tap GO to confirm or say it again.`);
      },
      (error) => {
        setIsListening(false);
        if (error === 'INITIALIZING') {
          AudioService.speak("Voice search is initializing. Please try again in a moment.");
        } else {
          AudioService.speak("Sorry, I didn't catch that.");
        }
      },
      () => {
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
      // Note: "desired destination" can be replaced with a search term or specific lat,long
      // For walking mode specifically: mode=w
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

      // Reliable 500ms delay for Groq
      if (isActive && isLive) {
        liveLoopRef.current = setTimeout(runLiveLoop, 500);
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <CameraView cameraRef={cameraRef} onCameraReady={() => setIsCameraReady(true)} />

      <TouchableOpacity
        activeOpacity={1}
        style={styles.scanArea}
        onPress={analyzeEnvironment}
        disabled={isAnalyzing || isLive}
      >
        {/* Status banner */}
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>
            {isLive ? '🔴 LIVE (NAVIA SAFETY)' : `NAVIA: ${status}`}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.smallButton, showMap && styles.buttonActive]}
          onPress={() => setShowMap(!showMap)}
          accessibilityLabel="Toggle Map View"
        >
          <Text style={styles.buttonText}>{showMap ? 'HIDE MAP' : 'SHOW MAP'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.liveToggleButton, isLive && styles.liveActive]}
          onPress={toggleLiveMode}
          accessibilityLabel={isLive ? "Stop Navia Safety Monitoring" : "Start Navia Continuous Safety Monitoring"}
          accessibilityRole="button"
          accessibilityHint="Toggles between continuous safety alerts and standby mode."
        >
          <Text style={styles.buttonText}>
            {isLive ? 'STOP NAVIA' : 'START NAVIA'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.smallButton}
          onPress={() => setShowSearch(true)}
          accessibilityLabel="Set Destination"
        >
          <Text style={styles.buttonText}>GOAL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.smallButton, isChatting && styles.buttonActive]}
          onPress={startChatSession}
          accessibilityLabel="Chat with Navia Assistant"
          disabled={isListening}
        >
          <Text style={styles.buttonText}>{isListening && isChatting ? '...' : 'CHAT'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showSearch} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.searchBox}>
            <Text style={styles.modalTitle}>Where to?</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter destination..."
              placeholderTextColor="#666"
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                setIsConfirmingVoice(false);
              }}
              autoFocus
            />
            {isConfirmingVoice && (
              <Text style={[styles.instructionText, { color: '#00FF00', marginBottom: 10, textAlign: 'center' }]}>
                Confirming: {destination}?
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, isListening && { backgroundColor: '#c00' }]}
                onPress={isListening ? () => VoiceService.stopListening() : startVoiceSearch}
              >
                <Text style={styles.modalButtonText}>
                  {isListening ? 'LISTENING...' : '🎤 GOOGLE VOICE'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowSearch(false)}>
                <Text style={styles.modalButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#007AFF' }]} onPress={handleStartNavigation}>
                <Text style={styles.modalButtonText}>GO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <VoiceWebView />

      {showMap && location && (
        <View style={styles.mapContainer}>
          <MapComponent location={location} routeData={activeRouteData} />
        </View>
      )}

      {/* Accessible instructions */}
      <View style={styles.instructions} accessibilityLabel="Instructions: Navia Safety is active. Top area for immediate surroundings check, bottom button for continuous monitoring.">
        <Text style={styles.instructionText}>
          {isLive ? 'Navia is Watching...' : 'Tap top for quick check'}
        </Text>
        {isAnalyzing && !isLive && <ActivityIndicator color="#fff" style={{ marginTop: 10 }} />}
      </View>
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 120,
  },
  statusBanner: {
    marginTop: 50,
    marginHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff',
  },
  statusText: {
    color: '#0f0',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  liveToggleButton: {
    flex: 2,
    height: 80,
    backgroundColor: '#333',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    marginHorizontal: 5,
  },
  smallButton: {
    flex: 1,
    height: 80,
    backgroundColor: '#333',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    marginHorizontal: 5,
  },
  buttonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  liveActive: {
    backgroundColor: '#c00',
    borderColor: '#f00',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 10,
    right: 10,
    flexDirection: 'row',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mapContainer: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    bottom: 130,
    backgroundColor: '#000',
  },
  instructions: {
    position: 'absolute',
    bottom: 140,
    width: '100%',
    alignItems: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  searchBox: {
    width: '100%',
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#333',
    color: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#444',
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
