import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { CameraView as ExpoCamera, useCameraPermissions } from 'expo-camera';

export default function CameraView({ cameraRef, onCameraReady }) {
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [permission]);

    if (!permission || !permission.granted) {
        // Camera permissions are still loading or not granted yet.
        return <View style={styles.container} />;
    }

    return (
        <View style={styles.container}>
            <ExpoCamera
                style={styles.camera}
                facing="back"
                ref={cameraRef}
                onCameraReady={onCameraReady}
            />
            <View style={styles.overlay} pointerEvents="none">
                {/* Overlay elements if needed */}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
        flexDirection: 'row',
    },
});
