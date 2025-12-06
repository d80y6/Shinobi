//
// Shinobi - WebRTC Client
// Copyright (C) 2020 Moe Alam, moeiscool
//
// Frontend mediasoup-client integration for ultra-low latency WebRTC streaming
//
(function() {
    'use strict';

    // mediasoup-client Device instance (shared across connections)
    let device = null;
    let deviceLoaded = false;
    let deviceLoading = false;
    let deviceLoadPromise = null;

    // Transport cache per socket connection
    const transportCache = new WeakMap();

    /**
     * Initialize the mediasoup Device with router capabilities
     * @param {Object} socket - Socket.io connection
     * @returns {Promise<Object>} mediasoup Device
     */
    async function initializeDevice(socket) {
        // If device is already loaded, return it
        if (device && deviceLoaded) {
            return device;
        }

        // If device is currently loading, wait for it
        if (deviceLoading && deviceLoadPromise) {
            return deviceLoadPromise;
        }

        // Start loading the device
        deviceLoading = true;

        deviceLoadPromise = new Promise((resolve, reject) => {
            // Check if mediasoup-client is available
            if (typeof mediasoupClient === 'undefined') {
                deviceLoading = false;
                reject(new Error('mediasoup-client library not loaded'));
                return;
            }

            // Create new Device
            device = new mediasoupClient.Device();

            // Get router capabilities from server
            socket.emit('webrtc:getRouterCapabilities', {}, async (response) => {
                if (response.error) {
                    deviceLoading = false;
                    device = null;
                    reject(new Error(response.error));
                    return;
                }

                try {
                    // Load device with router capabilities
                    await device.load({
                        routerRtpCapabilities: response.rtpCapabilities
                    });

                    deviceLoaded = true;
                    deviceLoading = false;
                    console.log('Shinobi WebRTC: Device loaded successfully');
                    resolve(device);
                } catch (err) {
                    deviceLoading = false;
                    device = null;
                    reject(err);
                }
            });
        });

        return deviceLoadPromise;
    }

    /**
     * Create a receiving transport for video consumption
     * @param {Object} socket - Socket.io connection
     * @returns {Promise<Object>} mediasoup RecvTransport
     */
    async function createRecvTransport(socket) {
        // Check transport cache
        let cached = transportCache.get(socket);
        if (cached && cached.recvTransport) {
            return cached.recvTransport;
        }

        // Ensure device is loaded
        await initializeDevice(socket);

        return new Promise((resolve, reject) => {
            socket.emit('webrtc:createTransport', {}, async (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }

                try {
                    const recvTransport = device.createRecvTransport({
                        id: response.id,
                        iceParameters: response.iceParameters,
                        iceCandidates: response.iceCandidates,
                        dtlsParameters: response.dtlsParameters,
                        sctpParameters: response.sctpParameters
                    });

                    // Handle transport connect event
                    recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                        socket.emit('webrtc:connectTransport', {
                            transportId: recvTransport.id,
                            dtlsParameters: dtlsParameters
                        }, (connectResponse) => {
                            if (connectResponse.error) {
                                errback(new Error(connectResponse.error));
                            } else {
                                callback();
                            }
                        });
                    });

                    // Handle connection state changes
                    recvTransport.on('connectionstatechange', (state) => {
                        console.log(`Shinobi WebRTC: Transport state: ${state}`);
                        if (state === 'failed' || state === 'closed') {
                            // Clear cache on failure
                            if (transportCache.has(socket)) {
                                transportCache.delete(socket);
                            }
                        }
                    });

                    // Cache the transport
                    if (!transportCache.has(socket)) {
                        transportCache.set(socket, {});
                    }
                    transportCache.get(socket).recvTransport = recvTransport;

                    console.log('Shinobi WebRTC: Receive transport created');
                    resolve(recvTransport);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    /**
     * Consume a monitor's WebRTC stream
     * @param {Object} socket - Socket.io connection
     * @param {string} monitorId - Monitor ID to consume
     * @param {HTMLVideoElement} videoElement - Video element to attach stream to
     * @param {Object} options - Optional configuration
     * @returns {Promise<Object>} Consumer object with close() method
     */
    async function consumeMonitor(socket, monitorId, videoElement, options = {}) {
        try {
            // Ensure device is loaded and transport exists
            await initializeDevice(socket);
            const transport = await createRecvTransport(socket);

            return new Promise((resolve, reject) => {
                console.log('Shinobi WebRTC: Sending consume request for monitor:', monitorId);
                socket.emit('webrtc:consume', {
                    monitorId: monitorId,
                    transportId: transport.id,
                    rtpCapabilities: device.rtpCapabilities
                }, async (response) => {
                    console.log('Shinobi WebRTC: Consume response received:', response);
                    if (response.error) {
                        console.error('Shinobi WebRTC: Consume error from server:', response.error);
                        reject(new Error(response.error));
                        return;
                    }

                    try {
                        // Create the consumer
                        console.log('Shinobi WebRTC: Creating consumer with params:', {
                            id: response.id,
                            producerId: response.producerId,
                            kind: response.kind
                        });
                        const consumer = await transport.consume({
                            id: response.id,
                            producerId: response.producerId,
                            kind: response.kind,
                            rtpParameters: response.rtpParameters
                        });
                        console.log('Shinobi WebRTC: Consumer created, track:', consumer.track);
                        console.log('Shinobi WebRTC: Track readyState:', consumer.track.readyState);
                        console.log('Shinobi WebRTC: Track muted:', consumer.track.muted);

                        // Create MediaStream and attach to video element
                        const stream = new MediaStream([consumer.track]);
                        console.log('Shinobi WebRTC: MediaStream created, tracks:', stream.getTracks().length);
                        console.log('Shinobi WebRTC: Video element before attach:', videoElement);
                        videoElement.srcObject = stream;
                        console.log('Shinobi WebRTC: Video element srcObject set');

                        // Listen for track unmute (when RTP data arrives)
                        consumer.track.onunmute = () => {
                            console.log('Shinobi WebRTC: Track unmuted - receiving data!');
                        };

                        // Listen for video element events
                        videoElement.onloadedmetadata = () => {
                            console.log('Shinobi WebRTC: Video metadata loaded, dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                        };
                        videoElement.onloadeddata = () => {
                            console.log('Shinobi WebRTC: Video data loaded');
                        };
                        videoElement.onplaying = () => {
                            console.log('Shinobi WebRTC: Video is playing');
                        };
                        videoElement.onerror = (e) => {
                            console.error('Shinobi WebRTC: Video element error:', e);
                        };

                        // Set video element attributes for optimal playback
                        videoElement.autoplay = true;
                        videoElement.muted = options.muted !== false; // Muted by default for autoplay
                        videoElement.playsInline = true;

                        // Resume consumer on server side
                        console.log('Shinobi WebRTC: Resuming consumer on server...');
                        socket.emit('webrtc:resumeConsumer', {
                            consumerId: consumer.id
                        }, (resumeResponse) => {
                            console.log('Shinobi WebRTC: Resume response:', resumeResponse);
                            if (resumeResponse.error) {
                                console.error('Shinobi WebRTC: Failed to resume consumer:', resumeResponse.error);
                            }

                            // Attempt to play
                            console.log('Shinobi WebRTC: Attempting to play video...');
                            videoElement.play().then(() => {
                                console.log('Shinobi WebRTC: Video playing!');
                            }).catch(err => {
                                console.warn('Shinobi WebRTC: Autoplay blocked:', err.message);
                            });
                        });

                        // Handle consumer events
                        consumer.on('transportclose', () => {
                            console.log('Shinobi WebRTC: Consumer transport closed');
                        });

                        consumer.on('trackended', () => {
                            console.log('Shinobi WebRTC: Consumer track ended');
                        });

                        // Create wrapper object with close method
                        const consumerWrapper = {
                            consumer: consumer,
                            track: consumer.track,
                            stream: stream,
                            monitorId: monitorId,
                            close: () => {
                                try {
                                    consumer.close();
                                    socket.emit('webrtc:closeConsumer', {
                                        consumerId: consumer.id
                                    });
                                    if (videoElement.srcObject === stream) {
                                        videoElement.srcObject = null;
                                    }
                                } catch (err) {
                                    console.warn('Shinobi WebRTC: Error closing consumer:', err.message);
                                }
                            },
                            pause: async () => {
                                return new Promise((res, rej) => {
                                    socket.emit('webrtc:pauseConsumer', {
                                        consumerId: consumer.id
                                    }, (pauseResponse) => {
                                        if (pauseResponse.error) {
                                            rej(new Error(pauseResponse.error));
                                        } else {
                                            res();
                                        }
                                    });
                                });
                            },
                            resume: async () => {
                                return new Promise((res, rej) => {
                                    socket.emit('webrtc:resumeConsumer', {
                                        consumerId: consumer.id
                                    }, (resumeResponse) => {
                                        if (resumeResponse.error) {
                                            rej(new Error(resumeResponse.error));
                                        } else {
                                            videoElement.play().catch(() => {});
                                            res();
                                        }
                                    });
                                });
                            }
                        };

                        console.log(`Shinobi WebRTC: Consuming monitor ${monitorId}`);
                        resolve(consumerWrapper);
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        } catch (err) {
            throw new Error(`Failed to consume monitor: ${err.message}`);
        }
    }

    /**
     * Get list of available WebRTC producers
     * @param {Object} socket - Socket.io connection
     * @returns {Promise<Array>} Array of producer info objects
     */
    async function getProducers(socket) {
        return new Promise((resolve, reject) => {
            socket.emit('webrtc:getProducers', {}, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.producers || []);
                }
            });
        });
    }

    /**
     * Get WebRTC statistics
     * @param {Object} socket - Socket.io connection
     * @returns {Promise<Object>} Statistics object
     */
    async function getStats(socket) {
        return new Promise((resolve, reject) => {
            socket.emit('webrtc:getStats', {}, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.stats || {});
                }
            });
        });
    }

    /**
     * Reset the device (useful after connection errors)
     */
    function resetDevice() {
        device = null;
        deviceLoaded = false;
        deviceLoading = false;
        deviceLoadPromise = null;
        console.log('Shinobi WebRTC: Device reset');
    }

    /**
     * Check if WebRTC is supported in this browser
     * Note: navigator.mediaDevices is only needed for capturing local media,
     * not for receiving/consuming streams, so we don't check for it here.
     * @returns {boolean}
     */
    function isSupported() {
        return typeof mediasoupClient !== 'undefined' &&
               typeof RTCPeerConnection !== 'undefined';
    }

    /**
     * Get device handler name
     * @returns {string|null}
     */
    function getHandlerName() {
        if (device && device.loaded) {
            return device.handlerName;
        }
        return null;
    }

    // Export to window for use in livePlayer and other modules
    window.ShinobiWebRTC = {
        initializeDevice,
        createRecvTransport,
        consumeMonitor,
        getProducers,
        getStats,
        resetDevice,
        isSupported,
        getHandlerName
    };

    console.log('Shinobi WebRTC: Client library loaded');
})();
