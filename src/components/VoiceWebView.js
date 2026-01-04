import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import VoiceService from '../services/VoiceService';

/**
 * This component handles Google Speech-to-Text via a Hidden WebView.
 * Note: There is NO Google Popup in this mode because it's running via a browser engine.
 */
const VoiceWebView = () => {
    const webViewRef = useRef(null);
    const [debugText, setDebugText] = React.useState('INITIALIZING...');

    useEffect(() => {
        const interval = setInterval(() => {
            VoiceService.registerBridge((command) => {
                if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(`if(window.executeCommand) executeCommand("${command}")`);
                }
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #000; color: #00FF00; font-family: monospace; font-size: 11px; margin: 0; padding: 2px; display: flex; align-items: center; justify-content: center; height: 100%; border-top: 2px solid #00FF00; box-sizing: border-box; }
                #status { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 100%; }
            </style>
        </head>
        <body onclick="document.getElementById('status').innerText = 'READY (TAP OK)'; send('READY')">
            <div id="status">TAP HERE FOR VOICE PERMISSION</div>
            <script>
                const send = (type, data) => {
                    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type, data })); } catch(e) {}
                };
                
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                
                if (!SpeechRecognition) {
                    document.getElementById('status').innerText = 'ENGINE_MISSING';
                    send('ERROR', 'WebSpeech not supported on this device');
                } else {
                    const recognition = new SpeechRecognition();
                    recognition.continuous = false;
                    recognition.interimResults = false;
                    recognition.lang = 'en-US';

                    recognition.onstart = () => {
                        document.getElementById('status').innerText = 'GOOGLE LISTENING...';
                        send('STATUS', 'STARTING');
                    };

                    recognition.onresult = (event) => {
                        const result = event.results[0][0].transcript;
                        document.getElementById('status').innerText = 'HEARD: ' + result;
                        send('RESULT', result);
                    };

                    recognition.onerror = (event) => {
                        document.getElementById('status').innerText = 'ERR: ' + event.error;
                        send('ERROR', event.error);
                    };

                    recognition.onend = () => {
                        document.getElementById('status').innerText = 'READY';
                        send('END');
                    };

                    window.executeCommand = (command) => {
                        if (command === 'START') {
                            try { 
                                recognition.start(); 
                            } catch (e) { 
                                recognition.stop();
                                setTimeout(() => recognition.start(), 200);
                            }
                        } else if (command === 'STOP') {
                            recognition.stop();
                        }
                    };

                    // Initial ready signal
                    document.getElementById('status').innerText = 'READY (GOOGLE)';
                    send('READY');
                }
            </script>
        </body>
        </html>
    `;

    const onMessage = (event) => {
        try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'STATUS' || message.type === 'READY') {
                setDebugText(message.type === 'READY' ? 'READY' : message.data);
            } else if (message.type === 'RESULT') {
                setDebugText('HEARD: ' + message.data);
            } else if (message.type === 'ERROR') {
                setDebugText('ERR: ' + message.data);
            }
            VoiceService.handleBridgeMessage(message);
        } catch (e) { }
    };

    return (
        <View style={styles.debugView}>
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                // Base URL is critical for Secure Context on Android
                source={{ html: htmlContent, baseUrl: 'https://www.google.com' }}
                onMessage={onMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mediaPlaybackRequiresUserAction={false}
                allowFileAccess={true}
                mixedContentMode="always"
                allowsInlineMediaPlayback={true}
                // Important for Google services detection
                userAgent="Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.119 Mobile Safari/537.36"
                style={{ backgroundColor: 'transparent' }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    debugView: {
        width: '100%',
        height: 40,
        position: 'absolute',
        bottom: 0,
        backgroundColor: '#000',
        zIndex: 9999,
    }
});

export default VoiceWebView;
