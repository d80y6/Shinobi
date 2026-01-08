class LiveStreamController {
    constructor({
        blockIdPrefix = 'monitor_live_',
        blockClass = 'monitor-item',
        streamBlockClass = 'stream-block',
        mainCanvas,
        // tabName = 'liveGrid'
    }){
        this.blockIdPrefix = blockIdPrefix
        this.blockClass = blockClass
        this.streamBlockClass = streamBlockClass
        this.mainCanvas = mainCanvas
        this.loadedLiveGrids = {};
        this.liveGridElements = {};
        this.liveGridPlayingNow = {};
        this.runningJpegStreams = {};
        this.liveGridOpenCount = 0;
    }
    createElementCache(monitor){
        var monitorId = monitor.mid
        var theBlock = this.mainCanvas.find(`#${this.blockIdPrefix}${monitorId}`);
        var streamElement = theBlock.find('.stream-element')
        this.liveGridElements[monitorId] = {
            monitorItem: theBlock,
            streamElement: streamElement,
            // eventObjects: theBlock.find('.stream-objects'),
            // motionMeter: theBlock.find('.indifference .progress-bar'),
            // motionMeterText: theBlock.find('.indifference .progress-bar span'),
            width: streamElement.width(),
            height: streamElement.height(),
            // miniVideoList: theBlock.find('.videos-mini'),
        }
        this.loadedLiveGrids[monitorId] = {}
    }
    buildStreamElementHtml(streamType){
        var html = ''
        if(window.jpegModeOn === true){
            html = '<img class="stream-element">';
        }else{
            switch(streamType){
                case'hls':case'flv':case'mp4':
                  html = `<video class="stream-element" playsinline autoplay muted></video>`;
                break;
                case'mjpeg':
                  html = '<iframe class="stream-element"></iframe>';
                break;
                case'jpeg':
                  html = '<img class="stream-element">';
                break;
                default://base64//h265
                  html = '<canvas class="stream-element"></canvas>';
                break;
            }
        }
        return html
    }
    resetMonitorCanvas(monitor,initiateAfter,subStreamChannel){
        var monitorId = monitor.mid
        var details = monitor.details
        var streamType = subStreamChannel ? details.substream ? details.substream.output.stream_type : 'hls' : details.stream_type
        if(!this.liveGridElements[monitorId])return;
        var streamBlock = this.liveGridElements[monitorId].monitorItem.find(`.${this.streamBlockClass}`)
        this.closeLiveGridPlayer(monitorId,false)
        this.liveGridElements[monitorId].streamElement.remove()
        streamBlock.append(this.buildStreamElementHtml(streamType))
        if(initiateAfter)this.initiateLiveGridPlayer(monitor,subStreamChannel)
        this.resetLiveGridDimensionsInMemory(monitorId)
    }
    buildStreamBlock({
        monitor,
        customHtml,
    }){
        var monitorId = monitor.mid
        var monitorDetails = safeJsonParse(monitor.details)
        var monitorLiveId = `${this.blockIdPrefix}${monitor.mid}`
        var subStreamChannel = monitor.subStreamChannel
        var streamType = subStreamChannel ? monitorDetails.substream ? monitorDetails.substream.output.stream_type : 'hls' : monitorDetails.stream_type
        var streamElement = this.buildStreamElementHtml(streamType)
        var html = ''
        if(customHtml){
            html = customHtml.replace(`$STREAM_ELEMENT`, streamElement)
        }else{
            var html = `<div
                id="${monitorLiveId}"
                data-ke="${monitor.ke}"
                data-mid="${monitor.mid}"
                data-mode="${monitor.mode}"
                class="${this.blockClass}">
                ${streamElement}
            </div>`
        }
        return html
    }
    initiateLiveGridPlayer(monitor){
        var monitorId = monitor.mid
        var details = monitor.details
        var groupKey = monitor.ke
        var monitorId = monitor.mid
        var livePlayerBlocks = this.liveGridElements[monitorId]
        var monitorItem = livePlayerBlocks.monitorItem
        var loadedPlayer = this.loadedLiveGrids[monitorId]
        var loadedElements = this.liveGridElements[monitorId]
        var websocketPath = checkCorrectPathEnding(location.pathname) + 'socket.io'
        var containerElement = loadedElements.monitorItem
        var subStreamChannel = monitor.subStreamChannel
        var streamType = subStreamChannel ? details.substream ? details.substream.output.stream_type : 'hls' : details.stream_type
        // var isInView = this.isScrolledIntoView(monitorItem[0])
        // if(!isInView){
        //     return;
        // }
        this.liveGridPlayingNow[monitorId] = true
        switch(streamType){
            // case'jpeg':
            //     startJpegStream(monitorId)
            // break;
            case'b64':
                if(loadedPlayer.Base64 && loadedPlayer.Base64.connected){
                    loadedPlayer.Base64.disconnect()
                }
                loadedPlayer.Base64 = io(location.origin,{ path: websocketPath, query: websocketQuery, transports: ['websocket'], forceNew: false})
                var ws = loadedPlayer.Base64
                var buffer
                ws.on('diconnect',function(){
                    console.log('Base64 Stream Disconnected')
                })
                ws.on('connect',function(){
                    ws.emit('Base64',{
                        auth: $user.auth_token,
                        uid: $user.uid,
                        ke: monitor.ke,
                        id: monitor.mid,
                        channel: subStreamChannel
                    })
                    if(!loadedPlayer.ctx || loadedPlayer.ctx.length === 0){
                        loadedPlayer.ctx = containerElement.find('canvas');
                    }
                    var ctx = loadedPlayer.ctx[0]
                    var ctx2d = ctx.getContext("2d")
                    loadedPlayer.image = new Image()
                    var image = loadedPlayer.image
                    image.onload = function() {
                        loadedPlayer.imageLoading = false
                        var x = 0
                        var y = 0
                        ctx.getContext("2d").drawImage(image,x,y,ctx.width,ctx.height)
                        URL.revokeObjectURL(loadedPlayer.imageUrl)
                    }
                    ws.on('data',function(imageData){
                        try{
                            if(loadedPlayer.imageLoading === true)return console.log('drop');
                            loadedPlayer.imageLoading = true
                            var arrayBufferView = new Uint8Array(imageData);
                            var blob = new Blob( [ arrayBufferView ], { type: "image/jpeg" } );
                            loadedPlayer.imageUrl = URL.createObjectURL( blob );
                            loadedPlayer.image.src = loadedPlayer.imageUrl
                            loadedPlayer.last_frame = 'data:image/jpeg;base64,'+base64ArrayBuffer(imageData)
                        }catch(er){
                            debugLog('base64 frame')
                        }
                        // $.ccio.init('signal',d);
                    })
                })
            break;
            case'mp4':
                var stream = containerElement.find('.stream-element');
                var onPoseidonError = function(){
                    // setTimeout(function(){
                    //     mainSocket.f({f:'monitor',ff:'watch_on',id:monitorId})
                    // },2000)
                }
                if(!loadedPlayer.PoseidonErrorCount)loadedPlayer.PoseidonErrorCount = 0
                if(loadedPlayer.PoseidonErrorCount >= 5)return
                if(subStreamChannel ? details.substream.output.stream_flv_type === 'ws' : monitor.details.stream_flv_type === 'ws'){
                    if(loadedPlayer.Poseidon){
                        loadedPlayer.Poseidon.stop()
                        revokeVideoPlayerUrl(monitorId)
                    }
                    const poseidonOptions = {
                        video: stream[0],
                        auth_token: $user.auth_token,
                        ke: monitor.ke,
                        uid: $user.uid,
                        id: monitor.mid,
                        url: location.origin,
                        path: websocketPath,
                        query: websocketQuery,
                        onError : onPoseidonError,
                        channel : subStreamChannel
                    }
                    try{
                        loadedPlayer.Poseidon = new Poseidon(poseidonOptions)
                        loadedPlayer.Poseidon.start();
                    }catch(err){
                        // onPoseidonError()
                        console.log('onTryPoseidonError',err,poseidonOptions)
                    }
                }else{
                    stream.attr('src',getApiPrefix(`mp4`)+'/'+monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '')+'/s.mp4?time=' + (new Date()).getTime())
                    stream[0].onerror = function(err){
                        console.error(err)
                    }
                }
            break;
            case'flv':
                if (flvjs.isSupported()) {
                    if(loadedPlayer.flv){
                        loadedPlayer.flv.destroy()
                        revokeVideoPlayerUrl(monitorId)
                    }
                    var options = {};
                    if(monitor.details.stream_flv_type==='ws'){
                        if(monitor.details.stream_flv_maxLatency&&monitor.details.stream_flv_maxLatency!==''){
                            monitor.details.stream_flv_maxLatency = parseInt(monitor.details.stream_flv_maxLatency)
                        }else{
                            monitor.details.stream_flv_maxLatency = 20000;
                        }
                        options = {
                            type: 'flv',
                            isLive: true,
                            auth_token: $user.auth_token,
                            ke: monitor.ke,
                            uid: $user.uid,
                            id: monitor.mid,
                            maxLatency: monitor.details.stream_flv_maxLatency,
                            hasAudio:false,
                            url: location.origin,
                            path: websocketPath,
                            channel : subStreamChannel,
                            query: websocketQuery
                        }
                    }else{
                        options = {
                            type: 'flv',
                            isLive: true,
                            url: getApiPrefix(`flv`)+'/'+monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '')+'/s.flv'
                        }
                    }
                    loadedPlayer.flv = flvjs.createPlayer(options);
                    loadedPlayer.flv.attachMediaElement(containerElement.find('.stream-element')[0]);
                    loadedPlayer.flv.on('error',function(err){
                        console.log(err)
                    });
                    loadedPlayer.flv.load();
                    loadedPlayer.flv.play();
                }else{
                    new PNotify({title:'Stream cannot be started',text:'FLV.js is not supported on this browser. Try another stream type.',type:'error'});
                }
            break;
            case'hls':
                function createSteamNow(){
                    clearTimeout(loadedPlayer.m3uCheck)
                    var url = getApiPrefix(`hls`) + '/' + monitor.mid + (subStreamChannel ? `/${subStreamChannel}` : '') + '/s.m3u8'
                    $.get(url,function(m3u){
                        if(m3u == 'File Not Found'){
                            loadedPlayer.m3uCheck = setTimeout(function(){
                                createSteamNow()
                            },2000)
                        }else{
                            var video = containerElement.find('.stream-element')[0]
                            if (isAppleDevice) {
                                video.src = url;
                                video.addEventListener('loadedmetadata', function() {
                                  setTimeout(function(){
                                    video.play();
                                  },3000)
                                }, false);
                            }else{
                                var hlsOptions = safeJsonParse(dashboardOptions().hlsOptions) || {}
                                if(hlsOptions instanceof String){
                                    hlsOptions = {}
                                    new PNotify({
                                        title: lang['Invalid JSON'],
                                        text: lang.hlsOptionsInvalid,
                                        type: `warning`,
                                    })
                                }
                                if(loadedPlayer.hls){
                                    loadedPlayer.hls.destroy()
                                    revokeVideoPlayerUrl(monitorId)
                                }
                                loadedPlayer.hls = new Hls(hlsOptions)
                                loadedPlayer.hls.loadSource(url)
                                loadedPlayer.hls.attachMedia(video)
                                loadedPlayer.hls.on(Hls.Events.MANIFEST_PARSED,function() {
                                    if (video.paused) {
                                        video.play();
                                    }
                                });
                            }
                        }
                    })
                }
                createSteamNow()
            break;
            case'mjpeg':
                var liveStreamElement = containerElement.find('.stream-element')
                var setSource = function(){
                    liveStreamElement.attr('src',getApiPrefix(`mjpeg`)+'/'+monitorId + (subStreamChannel ? `/${subStreamChannel}` : ''))
                    liveStreamElement.unbind('ready')
                    liveStreamElement.ready(function(){
                        setTimeout(function(){
                            liveStreamElement.contents().find("body").append('<style>img{width:100%;height:100%}</style>')
                        },1000)
                    })
                }
                setSource()
                liveStreamElement.on('error',function(err){
                    setTimeout(function(){
                        setSource()
                    },4000)
                })
            break;
        }
        //initiate signal check
        if(streamType !== 'useSubstream'){
            var signalCheckInterval = (isNaN(monitor.details.signal_check) ? 10 : parseFloat(monitor.details.signal_check)) * 1000 * 60
            if(signalCheckInterval > 0){
                clearInterval(loadedPlayer.signal)
                loadedPlayer.signal = setInterval(function(){
                    signalCheckLiveStream({
                        mid: monitorId,
                        checkSpeed: 3000,
                    })
                },signalCheckInterval);
            }
        }
    }
    revokeVideoPlayerUrl(monitorId){
        try{
            URL.revokeObjectURL(this.liveGridElements[monitorId].streamElement[0].src)
        }catch(err){
            debugLog(err)
        }
    }
    closeLiveGridPlayer(monitorId,killElement,killAction = function(){}){
        try{
            var loadedPlayer = this.loadedLiveGrids[monitorId]
            if(loadedPlayer){
                if(loadedPlayer.hls){loadedPlayer.hls.destroy()}
                clearTimeout(loadedPlayer.m3uCheck)
                if(loadedPlayer.Poseidon){loadedPlayer.Poseidon.stop()}
                if(loadedPlayer.Base64){loadedPlayer.Base64.disconnect()}
                if(loadedPlayer.dash){loadedPlayer.dash.reset()}
                // if(loadedPlayer.jpegInterval){
                //     stopJpegStream(monitorId)
                // }
                clearInterval(loadedPlayer.signal)
            }
            if(this.liveGridElements[monitorId]){
                this.revokeVideoPlayerUrl(monitorId)
                if(killElement){
                    var livePlayerElement = this.liveGridElements[monitorId]
                    killAction(livePlayerElement)
                    // this.setLiveGridOpenCount(-1)
                    delete(this.loadedLiveGrids[monitorId])
                    delete(this.liveGridElements[monitorId])
                }
            }
        }catch(err){
            console.log(err)
        }
    }
    pauseMonitorItem(monitor){
        var monitorId = monitor.mid
        this.liveGridPlayingNow[monitorId] = false
        this.closeLiveGridPlayer(monitorId,false)
    }
    resumeMonitorItem(monitor){
        var monitorId = monitor.mid
        this.liveGridPlayingNow[monitorId] = true
        this.resetMonitorCanvas(monitor,true,monitor.subStreamChannel)
    }
    setLiveGridOpenCount(addOrRemove){
        this.liveGridOpenCount += addOrRemove
    }
    resetLiveGridDimensionsInMemory(monitorId){
        var theRef = this.liveGridElements[monitorId]
        theRef.width = theRef.streamElement.width()
        theRef.height = theRef.streamElement.height()
    }
    isScrolledIntoView(elem){
        var el = $(elem)
        var theWindow = $(window)
        var docViewTop = theWindow.scrollTop();
        var docViewBottom = docViewTop + theWindow.height();
        var elemTop = el.offset().top;
        var elemBottom = elemTop + el.height();
        return (
            elemTop >= docViewTop && elemTop <= docViewBottom ||
            elemBottom >= docViewTop && elemBottom <= docViewBottom
        );
    }
    // pauseAllLiveGridPlayers(unpause){
    //     this.mainCanvas.find(`.${blockClass}`).each(function(n,el){
    //         var monitorId = $(el).attr('data-mid')
    //         if(!unpause){
    //             this.pauseMonitorItem(monitorId)
    //         }else{
    //             this.resumeMonitorItem(monitorId)
    //         }
    //     })
    // }
    // setPauseStatusForMonitorItems(forceResume){
    //     this.mainCanvas.find(`.${blockClass}`).each(function(n,el){
    //         var monitorId = $(el).attr('data-mid')
    //         var isVisible = this.isScrolledIntoView(el)
    //         if(isVisible){
    //             if(forceResume || !liveGridPlayingNow[monitorId])this.resumeMonitorItem(monitorId);
    //         }else{
    //             this.pauseMonitorItem(monitorId)
    //         }
    //     })
    // }
    // setPauseScrollTimeout(forceResume){
    //     clearTimeout(liveGridPauseScrollTimeout)
    //     if(tabTree.name === tabName){
    //         liveGridPauseScrollTimeout = setTimeout(function(){
    //             this.setPauseStatusForMonitorItems(forceResume)
    //         },200)
    //     }
    // }
}
