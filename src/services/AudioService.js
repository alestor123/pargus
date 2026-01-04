import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

class AudioService {
    constructor() {
        this.pingUrl = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'; // High-pitched ping
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

        return new Promise((resolve) => {
            Speech.speak(cleanText, {
                language: 'en',
                pitch: 1.0,
                rate: 1.0,
                onDone: () => resolve(),
                onError: () => resolve(), // Resolve on error too to prevent hung loops
            });
        });
    }

    stop() {
        Speech.stop();
    }
}

export default new AudioService();
