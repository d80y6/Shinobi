//
// Shinobi - WebRTC Signaling Handlers
// Copyright (C) 2020 Moe Alam, moeiscool
//
// Socket.io signaling for WebRTC streaming with mediasoup
//

module.exports = (s, config, lang, io) => {
    if (!config.webrtc?.enabled) return;

    s.debugLog('WebRTC Signaling', 'Initializing signaling handlers');

    /**
     * Check if user can view a specific monitor's stream
     * @param {Object} user - User object
     * @param {string} monitorId - Monitor ID
     * @returns {boolean}
     */
    const canViewMonitor = (user, monitorId) => {
        if (!user) return false;
        // Sub-accounts with limited monitor access
        if (user.details?.sub && user.details?.allmonitors !== '1') {
            const monitors = user.details.monitors || [];
            return monitors.includes(monitorId);
        }
        return true;
    };

    // Register WebRTC signaling handlers on socket connections
    s.onWebSocketConnectionExtensions.push((cn, validatedAndBind, createStreamEmitter) => {

        /**
         * Get router RTP capabilities
         * Client needs this to initialize their mediasoup Device
         */
        cn.on('webrtc:getRouterCapabilities', async (data, callback) => {
            try {
                if (!cn.ke) {
                    if (typeof callback === 'function') callback({ error: 'Not authenticated' });
                    return;
                }

                const router = await s.getOrCreateRouter(cn.ke);
                if (typeof callback === 'function') callback({
                    rtpCapabilities: router.rtpCapabilities
                });
                s.debugLog('WebRTC Signaling', `Router capabilities sent to ${cn.id}`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `getRouterCapabilities error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Create a WebRTC transport for receiving streams
         * Client will use this to receive video from producers
         */
        cn.on('webrtc:createTransport', async (data, callback) => {
            try {
                if (!cn.ke) {
                    if (typeof callback === 'function') callback({ error: 'Not authenticated' });
                    return;
                }

                const transport = await s.createWebRtcTransport(cn.ke);

                // Track transports for this connection for cleanup
                if (!cn.webrtcTransports) cn.webrtcTransports = [];
                cn.webrtcTransports.push(transport.id);

                if (typeof callback === 'function') callback({
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters,
                    sctpParameters: transport.sctpParameters
                });

                s.debugLog('WebRTC Signaling', `Transport ${transport.id} created for ${cn.id}`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `createTransport error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Connect transport (complete DTLS handshake)
         * Called after client receives transport params and generates DTLS fingerprint
         */
        cn.on('webrtc:connectTransport', async (data, callback) => {
            try {
                const { transportId, dtlsParameters } = data;

                if (!transportId || !dtlsParameters) {
                    if (typeof callback === 'function') callback({ error: 'Missing transportId or dtlsParameters' });
                    return;
                }

                const transport = s.webrtc.transports.get(transportId);
                if (!transport) {
                    if (typeof callback === 'function') callback({ error: 'Transport not found' });
                    return;
                }

                await transport.connect({ dtlsParameters });
                if (typeof callback === 'function') callback({ success: true });

                s.debugLog('WebRTC Signaling', `Transport ${transportId} connected`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `connectTransport error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Get list of available WebRTC producers (monitors with WebRTC enabled)
         */
        cn.on('webrtc:getProducers', async (data, callback) => {
            try {
                if (!cn.ke) {
                    if (typeof callback === 'function') callback({ error: 'Not authenticated' });
                    return;
                }

                const user = s.group[cn.ke]?.users?.[cn.auth];
                const producers = [];

                // Iterate through active monitors in group
                const activeMonitors = s.group[cn.ke]?.activeMonitors || {};
                for (const [monitorId, monitor] of Object.entries(activeMonitors)) {
                    if (s.hasWebrtcProducer(cn.ke, monitorId)) {
                        if (canViewMonitor(user, monitorId)) {
                            const info = s.getWebrtcProducerInfo(cn.ke, monitorId);
                            if (info) {
                                producers.push({
                                    monitorId,
                                    ...info
                                });
                            }
                        }
                    }
                }

                if (typeof callback === 'function') callback({ producers });
                s.debugLog('WebRTC Signaling', `Producer list sent to ${cn.id}: ${producers.length} producers`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `getProducers error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Consume a specific monitor's stream
         * Creates a consumer that receives video from the producer
         */
        cn.on('webrtc:consume', async (data, callback) => {
            try {
                if (!cn.ke) {
                    if (typeof callback === 'function') callback({ error: 'Not authenticated' });
                    return;
                }

                const { monitorId, transportId, rtpCapabilities } = data;

                if (!monitorId || !transportId || !rtpCapabilities) {
                    if (typeof callback === 'function') callback({ error: 'Missing required parameters' });
                    return;
                }

                // Check permissions
                const user = s.group[cn.ke]?.users?.[cn.auth];
                if (!canViewMonitor(user, monitorId)) {
                    if (typeof callback === 'function') callback({ error: 'Not authorized to view this monitor' });
                    return;
                }

                // Get the transport
                const transport = s.webrtc.transports.get(transportId);
                if (!transport) {
                    if (typeof callback === 'function') callback({ error: 'Transport not found' });
                    return;
                }

                // Check if producer exists
                if (!s.hasWebrtcProducer(cn.ke, monitorId)) {
                    if (typeof callback === 'function') callback({ error: 'No WebRTC stream available for this monitor' });
                    return;
                }

                // Create consumer
                const consumer = await s.createWebrtcConsumer(
                    cn.ke,
                    monitorId,
                    transport,
                    rtpCapabilities
                );

                // Track consumers for this connection for cleanup
                if (!cn.webrtcConsumers) cn.webrtcConsumers = [];
                cn.webrtcConsumers.push(consumer.id);

                if (typeof callback === 'function') callback({
                    id: consumer.id,
                    producerId: consumer.producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                    type: consumer.type,
                    producerPaused: consumer.producerPaused
                });

                s.debugLog('WebRTC Signaling', `Consumer ${consumer.id} created for monitor ${monitorId}`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `consume error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Resume a paused consumer
         * Called after client has set up their video element
         */
        cn.on('webrtc:resumeConsumer', async (data, callback) => {
            try {
                const { consumerId } = data;

                if (!consumerId) {
                    if (typeof callback === 'function') callback({ error: 'Missing consumerId' });
                    return;
                }

                const consumer = s.webrtc.consumers.get(consumerId);
                if (!consumer) {
                    if (typeof callback === 'function') callback({ error: 'Consumer not found' });
                    return;
                }

                await consumer.resume();

                // Request keyframe from producer to help consumer start decoding immediately
                try {
                    await consumer.requestKeyFrame();
                } catch (kfErr) {
                    // Keyframe request may fail if producer isn't ready yet
                }

                if (typeof callback === 'function') callback({ success: true });

                s.debugLog('WebRTC Signaling', `Consumer ${consumerId} resumed`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `resumeConsumer error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Pause a consumer
         * Stops receiving video without closing the consumer
         */
        cn.on('webrtc:pauseConsumer', async (data, callback) => {
            try {
                const { consumerId } = data;

                if (!consumerId) {
                    if (typeof callback === 'function') callback({ error: 'Missing consumerId' });
                    return;
                }

                const consumer = s.webrtc.consumers.get(consumerId);
                if (!consumer) {
                    if (typeof callback === 'function') callback({ error: 'Consumer not found' });
                    return;
                }

                await consumer.pause();
                if (typeof callback === 'function') callback({ success: true });

                s.debugLog('WebRTC Signaling', `Consumer ${consumerId} paused`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `pauseConsumer error: ${error.message}`);
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Close a specific consumer
         */
        cn.on('webrtc:closeConsumer', async (data, callback) => {
            try {
                const { consumerId } = data;

                if (!consumerId) {
                    if (callback) callback({ error: 'Missing consumerId' });
                    return;
                }

                const consumer = s.webrtc.consumers.get(consumerId);
                if (consumer) {
                    consumer.close();
                    s.webrtc.consumers.delete(consumerId);

                    // Remove from connection tracking
                    if (cn.webrtcConsumers) {
                        const idx = cn.webrtcConsumers.indexOf(consumerId);
                        if (idx !== -1) cn.webrtcConsumers.splice(idx, 1);
                    }
                }

                if (callback) callback({ success: true });
                s.debugLog('WebRTC Signaling', `Consumer ${consumerId} closed`);
            } catch (error) {
                s.debugLog('WebRTC Signaling', `closeConsumer error: ${error.message}`);
                if (callback) callback({ error: error.message });
            }
        });

        /**
         * Get WebRTC statistics
         */
        cn.on('webrtc:getStats', async (data, callback) => {
            try {
                if (!cn.ke) {
                    if (typeof callback === 'function') callback({ error: 'Not authenticated' });
                    return;
                }

                const stats = s.getWebrtcStats();
                if (typeof callback === 'function') callback({ stats });
            } catch (error) {
                if (typeof callback === 'function') callback({ error: error.message });
            }
        });

        /**
         * Cleanup on disconnect
         * Close all transports and consumers for this connection
         */
        cn.on('disconnect', () => {
            // Close all transports (which also closes consumers)
            if (cn.webrtcTransports) {
                cn.webrtcTransports.forEach(transportId => {
                    const transport = s.webrtc.transports.get(transportId);
                    if (transport) {
                        try {
                            transport.close();
                        } catch (err) {
                            // Transport may already be closed
                        }
                        s.webrtc.transports.delete(transportId);
                    }
                });
                cn.webrtcTransports = [];
            }

            // Clean up consumer tracking
            if (cn.webrtcConsumers) {
                cn.webrtcConsumers.forEach(consumerId => {
                    s.webrtc.consumers.delete(consumerId);
                });
                cn.webrtcConsumers = [];
            }

            s.debugLog('WebRTC Signaling', `Connection ${cn.id} disconnected, resources cleaned up`);
        });
    });

    s.debugLog('WebRTC Signaling', 'Signaling handlers initialized');
};
