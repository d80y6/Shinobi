//
// Shinobi - WebRTC Client
// Copyright (C) 2020 Moe Alam, moeiscool
//
// Frontend mediasoup-client integration for ultra-low latency WebRTC streaming
//
(function() {
    'use strict';

    // Device cache per socket connection (each socket gets its own device)
    const deviceCache = new WeakMap();

    // Transport cache per socket connection
    const transportCache = new WeakMap();

    /**
     * Initialize the mediasoup Device with router capabilities
     * @param {Object} socket - Socket.io connection
     * @returns {Promise<Object>} mediasoup Device
     */
    async function initializeDevice(socket) {
        // Check if this socket already has a device
        let cached = deviceCache.get(socket);
        if (cached && cached.device && cached.loaded) {
            return cached.device;
        }

        // If device is currently loading for this socket, wait for it
        if (cached && cached.loading && cached.promise) {
            return cached.promise;
        }

        // Start loading the device for this socket
        if (!cached) {
            cached = { device: null, loaded: false, loading: false, promise: null };
            deviceCache.set(socket, cached);
        }
        cached.loading = true;

        cached.promise = new Promise((resolve, reject) => {
            // Check if mediasoup-client is available
            if (typeof mediasoupClient === 'undefined') {
                cached.loading = false;
                reject(new Error('mediasoup-client library not loaded'));
                return;
            }

            // Create new Device for this socket
            cached.device = new mediasoupClient.Device();

            // Get router capabilities from server
            socket.emit('webrtc:getRouterCapabilities', {}, async (response) => {
                if (response.error) {
                    cached.loading = false;
                    cached.device = null;
                    reject(new Error(response.error));
                    return;
                }

                try {
                    // Load device with router capabilities
                    await cached.device.load({
                        routerRtpCapabilities: response.rtpCapabilities
                    });

                    cached.loaded = true;
                    cached.loading = false;
                    console.log('Shinobi WebRTC: Device loaded successfully');
                    resolve(cached.device);
                } catch (err) {
                    cached.loading = false;
                    cached.device = null;
                    reject(err);
                }
            });
        });

        return cached.promise;
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

        // Ensure device is loaded and get it
        const device = await initializeDevice(socket);

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
            const device = await initializeDevice(socket);
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

                        // Stall detection and automatic recovery
                        let lastPlaybackTime = 0;
                        let lastDecodedFrames = 0;
                        let stallCount = 0;
                        let keyframeRequestInterval = null;
                        let stallCheckInterval = null;
                        let isRecovering = false;

                        // Request keyframe using dedicated endpoint
                        const requestKeyframe = () => {
                            if (!consumer.closed) {
                                socket.emit('webrtc:requestKeyframe', {
                                    consumerId: consumer.id,
                                    monitorId: monitorId
                                }, () => {});
                            }
                        };

                        // Periodic keyframe requests (every 2 seconds) for smoother playback
                        keyframeRequestInterval = setInterval(() => {
                            requestKeyframe();
                        }, 2000);

                        // Check for stalls every 300ms with more sophisticated detection
                        stallCheckInterval = setInterval(async () => {
                            if (isRecovering) return;

                            try {
                                // Try to get video playback quality stats
                                const stats = videoElement.getVideoPlaybackQuality?.() || {};
                                const currentDecodedFrames = stats.totalVideoFrames || 0;

                                // Check if frames are being decoded
                                const framesDecoded = currentDecodedFrames > lastDecodedFrames;
                                lastDecodedFrames = currentDecodedFrames;

                                // Check if playback time is advancing
                                const timeAdvancing = videoElement.currentTime !== lastPlaybackTime;
                                lastPlaybackTime = videoElement.currentTime;

                                // Stall conditions: video ready but nothing playing/decoding
                                if (videoElement.readyState >= 2 && !videoElement.paused) {
                                    if (!timeAdvancing && !framesDecoded) {
                                        stallCount++;
                                        if (stallCount >= 3) { // Stalled for ~1 second
                                            console.log('Shinobi WebRTC: Stall detected, requesting keyframe');
                                            isRecovering = true;
                                            requestKeyframe();

                                            // Also try resuming the consumer
                                            socket.emit('webrtc:resumeConsumer', { consumerId: consumer.id }, () => {
                                                isRecovering = false;
                                            });

                                            stallCount = 0;
                                        }
                                    } else {
                                        stallCount = 0;
                                    }
                                }
                            } catch (err) {
                                // Ignore stats errors
                            }
                        }, 300);

                        // BWE stats polling for network quality indicator
                        let bweStatsInterval = null;
                        // Use the video element's parent as the container
                        let qualityIndicatorContainer = videoElement.parentElement;

                        // Quality indicator OFF by default - user can enable via menu
                        // Start BWE stats polling if indicator is explicitly enabled
                        if (options.showQualityIndicator === true) {
                            bweStatsInterval = setInterval(async () => {
                                if (consumer.closed) {
                                    if (bweStatsInterval) clearInterval(bweStatsInterval);
                                    return;
                                }

                                const stats = await getBandwidthStats(socket, consumer.id);
                                if (stats && qualityIndicatorContainer) {
                                    updateNetworkQualityIndicator(qualityIndicatorContainer, stats);
                                }
                            }, 3000); // Poll every 3 seconds (less frequent than server-side BWE)
                        }

                        // Create wrapper object with close method
                        const consumerWrapper = {
                            consumer: consumer,
                            track: consumer.track,
                            stream: stream,
                            monitorId: monitorId,
                            close: () => {
                                try {
                                    // Clear stall detection intervals
                                    if (keyframeRequestInterval) clearInterval(keyframeRequestInterval);
                                    if (stallCheckInterval) clearInterval(stallCheckInterval);
                                    // Clear BWE stats interval
                                    if (bweStatsInterval) clearInterval(bweStatsInterval);
                                    // Remove quality indicator
                                    if (qualityIndicatorContainer) {
                                        removeNetworkQualityIndicator(qualityIndicatorContainer);
                                    }
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
                            },
                            // Expose method to manually get BWE stats
                            getBandwidthStats: async () => {
                                return getBandwidthStats(socket, consumer.id);
                            },
                            // Toggle quality indicator visibility
                            setQualityIndicatorVisible: (visible) => {
                                if (visible && !bweStatsInterval && qualityIndicatorContainer) {
                                    // Fetch immediately on enable
                                    (async () => {
                                        const stats = await getBandwidthStats(socket, consumer.id);
                                        if (stats && qualityIndicatorContainer) {
                                            updateNetworkQualityIndicator(qualityIndicatorContainer, stats);
                                        }
                                    })();
                                    // Then poll every 3 seconds
                                    bweStatsInterval = setInterval(async () => {
                                        if (consumer.closed) {
                                            if (bweStatsInterval) clearInterval(bweStatsInterval);
                                            return;
                                        }
                                        const stats = await getBandwidthStats(socket, consumer.id);
                                        if (stats) {
                                            updateNetworkQualityIndicator(qualityIndicatorContainer, stats);
                                        }
                                    }, 3000);
                                } else if (!visible) {
                                    if (bweStatsInterval) {
                                        clearInterval(bweStatsInterval);
                                        bweStatsInterval = null;
                                    }
                                    if (qualityIndicatorContainer) {
                                        removeNetworkQualityIndicator(qualityIndicatorContainer);
                                    }
                                }
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
     * Get BWE (Bandwidth Estimation) stats for a consumer
     * @param {Object} socket - Socket.io connection
     * @param {string} consumerId - Consumer ID
     * @returns {Promise<Object|null>} BWE stats or null
     */
    async function getBandwidthStats(socket, consumerId) {
        return new Promise((resolve) => {
            socket.emit('webrtc:getBandwidthStats', { consumerId }, (response) => {
                resolve(response.stats || null);
            });
        });
    }

    /**
     * Create/update network quality indicator element
     * @param {HTMLElement} container - Container element (usually the video wrapper)
     * @param {Object} stats - BWE stats from server
     * @returns {HTMLElement} The indicator element
     */
    function updateNetworkQualityIndicator(container, stats) {
        if (!container || !stats) return null;

        // Find or create indicator element
        let indicator = container.querySelector('.webrtc-quality-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'webrtc-quality-indicator';
            indicator.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: bold;
                z-index: 100;
                pointer-events: none;
                text-shadow: 0 0 2px rgba(0,0,0,0.5);
            `;
            container.style.position = 'relative';
            container.appendChild(indicator);
        }

        // Update indicator based on quality
        const qualityColors = {
            excellent: '#22c55e', // green
            good: '#eab308',      // yellow
            fair: '#f97316',      // orange
            poor: '#ef4444'       // red
        };

        const qualityLabels = {
            excellent: 'HD',
            good: 'SD',
            fair: 'LOW',
            poor: 'POOR'
        };

        const color = qualityColors[stats.quality] || qualityColors.poor;
        const label = qualityLabels[stats.quality] || 'N/A';
        const bitrateMbps = (stats.bitrate / 1000000).toFixed(1);

        indicator.style.backgroundColor = color;
        indicator.style.color = stats.quality === 'good' ? '#000' : '#fff';
        indicator.textContent = `${label} ${bitrateMbps}M`;
        indicator.title = `Quality: ${stats.quality}\nBitrate: ${Math.round(stats.bitrate/1000)} kbps\nScore: ${stats.score}/10\nLoss: ${(stats.fractionLost * 100).toFixed(1)}%`;

        return indicator;
    }

    /**
     * Remove network quality indicator
     * @param {HTMLElement} container - Container element
     */
    function removeNetworkQualityIndicator(container) {
        if (!container) return;
        const indicator = container.querySelector('.webrtc-quality-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    /**
     * Reset the device for a specific socket (useful after connection errors)
     * @param {Object} socket - Socket.io connection (optional, if not provided clears nothing)
     */
    function resetDevice(socket) {
        if (socket && deviceCache.has(socket)) {
            deviceCache.delete(socket);
        }
        if (socket && transportCache.has(socket)) {
            transportCache.delete(socket);
        }
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
     * @param {Object} socket - Socket.io connection
     * @returns {string|null}
     */
    function getHandlerName(socket) {
        const cached = socket ? deviceCache.get(socket) : null;
        if (cached && cached.device && cached.loaded) {
            return cached.device.handlerName;
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
        getBandwidthStats,
        updateNetworkQualityIndicator,
        removeNetworkQualityIndicator,
        resetDevice,
        isSupported,
        getHandlerName
    };

    console.log('Shinobi WebRTC: Client library loaded');
})();
