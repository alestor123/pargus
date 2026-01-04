import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, StatusBar, TouchableOpacity, ActivityIndicator, Linking, Dimensions } from 'react-native';
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
  const [destination, setDestination] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeRouteData, setActiveRouteData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [isConfirmingVoice, setIsConfirmingVoice] = useState(false);

  // Handle incoming live alerts from Groq (Now simple text)
  const handleLiveAlert = async (guidance) => {
    try {
      if (guidance && guidance.trim().length > 0) {
        await AudioService.speak(guidance);
        setStatus(guidance.toUpperCase());
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
      AudioService.speak('Navia Safety Monitoring active via Groq.');
    } else {
      AudioService.speak('Navia deactivated.');
      setStatus('Ready');
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
        LocationService.watchLocation((newCoords) => {
          setLocation(newCoords);
        });
      }

      if (!voicePerm) {
        Alert.alert("Permission Required", "Microphone access is needed for voice commands.");
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

  const handleStartNavigation = async (targetOverride = null) => {
    const targetDest = targetOverride || destination;
    if (!targetDest) return;

    // Stop chat if running, as navigation takes over audio
    if (chatActiveRef.current) await stopChatSession();

    setShowSearch(false);
    setIsConfirmingVoice(false);
    AudioService.speak(`Searching for ${targetDest}`);

    const target = await MapUtils.geocode(targetDest);
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

  const stopChatSession = async () => {
    chatActiveRef.current = false;
    setIsChatting(false);
    setIsListening(false);
    await VoiceService.stopListening();
    AudioService.stop();
    // AudioService.speak("Chat ended."); // Optional confirmation
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
        </View>
      </TouchableOpacity>

      {/* Map overlay - only when visible */}
      {showMap && location && (
        <View style={styles.mapOverlay}>
          <MapComponent location={location} routeData={activeRouteData} />
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
                setDestination(text);
                setIsConfirmingVoice(false);
              }}
              autoFocus
              accessible={true}
              accessibilityLabel="Destination input"
            />
            
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
                onPress={handleStartNavigation}
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