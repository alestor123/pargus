import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MapTemplate } from '../utils/MapTemplate';

const MapComponent = ({ location, routeData }) => {
    if (!location) return null;

    const html = MapTemplate.getHTML(location, routeData);

    return (
        <View style={styles.container}>
            <WebView
                originWhitelist={['*']}
                source={{ html }}
                style={styles.map}
                startInLoadingState={true}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        borderRadius: 15,
        overflow: 'hidden',
        marginHorizontal: 10,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#333',
    },
    map: {
        flex: 1,
    },
});

export default MapComponent;
