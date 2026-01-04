import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

class AudioService {
    constructor() {
        this.pingUrl = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'; // High-pitched ping
        this.configureAudio();
    }

    async configureAudio() {
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false
            });
        } catch (e) {
            console.error("AUDIO_CONFIG_ERROR:", e);
        }
    }

    async playSpatialCue(direction, distance = 1.0, isUrgent = false) {
        try {
            // Distance-based adjustments:
            // Volume: Closer (0.5m) = 1.0, Far (5.0m) = 0.1
            // Urgent: Add a volume floor of 0.8 to ensure it's heard
            let volume = Math.max(0.1, Math.min(1.0, 1.1 - (distance / 5)));
            if (isUrgent) volume = Math.max(0.8, volume);

            const { sound } = await Audio.Sound.createAsync(
                { uri: this.pingUrl },
                {
                    shouldPlay: true,
                    volume: volume,
                    pan: direction === 'LEFT' ? -1.0 : direction === 'RIGHT' ? 1.0 : 0.0,
                    rate: isUrgent ? 1.5 : 1.0 // Faster playback for urgent pings
                }
            );

            // Wait for sound to finish or timeout
            return new Promise((resolve) => {
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) {
                        sound.unloadAsync();
                        resolve();
                    }
                });
                // Safety timeout
                setTimeout(() => {
                    sound.unloadAsync();
                    resolve();
                }, 800);
            });
        } catch (error) {
            console.error("SPATIAL_SOUND_ERROR:", error);
        }
    }
    async speak(text) {
        // Clean text: remove brackets, semicolons, and other punctuation that TTS might pronounce
        const cleanText = text.replace(/[\[\];:,]/g, '').trim();

        // INTERRUPT: Always stop previous speech to ensure fresh real-time updates
        Speech.stop();

        return new Promise((resolve) => {
            let hasResolved = false;
            const safeResolve = () => {
                if (!hasResolved) {
                    hasResolved = true;
                    resolve();
                }
            };

            Speech.speak(cleanText, {
                language: 'en',
                pitch: 1.0,
                rate: 1.0,
                onDone: safeResolve,
                onError: safeResolve,
                onStopped: safeResolve
            });

            // Safety timeout: If TTS hangs, resolve anyway after 3s so we don't block
            setTimeout(safeResolve, 3000);
        });
    }

    stop() {
        Speech.stop();
    }
}

export default new AudioService();
