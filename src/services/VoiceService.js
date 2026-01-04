import { Audio } from 'expo-av';

class VoiceService {
    constructor() {
        this.isListening = false;
        this.onResultCallback = null;
        this.onErrorCallback = null;
        this.onStartCallback = null;
        this.bridgeExecutor = null;
    }

    async requestPermissions() {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            return status === 'granted';
        } catch (e) {
            console.error("PERMISSION_ERROR:", e);
            return false;
        }
    }

    /**
     * Registered by VoiceWebView component to allow service to talk to it
     */
    registerBridge(executor) {
        this.bridgeExecutor = executor;
    }

    /**
     * Called by VoiceWebView when it gets a result from the browser engine
     */
    handleBridgeMessage(message) {
        console.log("VOICE_BRIDGE_RECV:", message.type);
        switch (message.type) {
            case 'READY':
                console.log("Voice Bridge is ready.");
                break;
            case 'STATUS':
                if (message.data === 'STARTING') {
                    this.isListening = true;
                    if (this.onStartCallback) this.onStartCallback();
                }
                break;
            case 'RESULT':
                if (this.onResultCallback) this.onResultCallback(message.data);
                this.isListening = false;
                break;
            case 'ERROR':
                console.error("WEB_VOICE_ERROR:", message.data);
                if (this.onErrorCallback) this.onErrorCallback(message.data);
                this.isListening = false;
                break;
            case 'END':
                this.isListening = false;
                break;
        }
    }

    async startListening(onResult, onError, onStart) {
        if (this.isListening) return;

        if (!this.bridgeExecutor) {
            console.warn("BRIDGE_NOT_READY");
            if (onError) onError("INITIALIZING");
            return;
        }

        try {
            this.onResultCallback = onResult;
            this.onErrorCallback = onError;
            this.onStartCallback = onStart;
            // Ensure clean state before calling bridge
            this.isListening = false;
            this.bridgeExecutor('START');
        } catch (e) {
            console.error("VOICE_START_ERROR:", e);
            this.isListening = false;
            if (onError) onError(e.message || "START_FAILED");
        }
    }

    async stopListening() {
        if (this.bridgeExecutor) {
            this.bridgeExecutor('STOP');
        }
        this.isListening = false;
    }

    async destroy() {
        // No-op for web-based bridge
    }
}

export default new VoiceService();
