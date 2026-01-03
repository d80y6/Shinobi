$(document).ready(function(e){
    var theEnclosure = $('#tab-crossfeed')
    var theCanvas = $('#crossfeed-canvas')
    var canvasData = GridStack.init({}, '#crossfeed-canvas');
    var embedHost = getQueryString().host || `/`;
    var currentMainMonitor = null;
    var lastMainMonitor = null;
    var onScreenLockTimeout = null;
    var crossfeedWindowResizeTimeout = null;
    var openCrossFeedOnEvent = false;
    var legend = {
        "1": 12,
        "2": 6,
        "3": 4,
        // "4": 3,
        // "6": 2,
    }
    function getTriggerMonitors(targetMonitorId){
        var foundMonitors = []
        var mainMonitor = loadedMonitors[targetMonitorId];
        var monitorTriggerTags = (mainMonitor && mainMonitor.details.det_trigger_tags ? mainMonitor.details.det_trigger_tags : '').split(',')
        $.each(getLoadedMonitors(),function(monitorId,monitor){
            $.each(monitorTriggerTags,function(n,tag){
                console.log(monitor.name, tag, monitor.tags.includes(tag))
                if(monitor.tags.includes(tag) && monitor.mid !== targetMonitorId)foundMonitors.push(monitor)
            })
        })
        return foundMonitors
    }
    function addStreamBlock({
        monitorId,
        x, y, width, height,
        mainMonitor
    }){
        var isSmallMobile = isMobile || window.innerWidth <= 812;
        var html = `<div class="stream-item ${mainMonitor ? 'main-monitor' : ''}" id="crossfeed-${monitorId}">
            <iframe src="${getApiPrefix('embed')}/${monitorId}/fullscreen%7Cjquery%7Crelative?host=${embedHost}"></iframe>
        </div>`
        canvasData.addWidget({
            x,
            y,
            h: isSmallMobile ? 1 :  height,
            w: isSmallMobile ? 4 :  width,
            content: html
        })
    }
    function addMonitorAndAssociated(monitorId){
        if(onScreenLockTimeout || currentMainMonitor === monitorId)return;
        setOnScreenLock()
        currentMainMonitor = `${monitorId}`
        lastMainMonitor = `${monitorId}`
        const monitors = getTriggerMonitors(monitorId)
        let mainWidth = 8
        let mainHeight = 8
        if(monitors.length === 0){
            mainWidth = 12
            mainHeight = 12
        }
        addStreamBlock({ monitorId, x: 0, y: 0, width: mainWidth, height: mainHeight, mainMonitor: true })
        for(monitor of monitors){
            addStreamBlock({ monitorId: monitor.mid, x: mainWidth, y: 0, width: 4, height: 4})
        }
        onWindowResizeTimeout()
        canvasData.compact()
    }
    function closeMonitors(removeFromMemory){
        clearTimeout(onScreenLockTimeout)
        theCanvas.find('iframe').attr('src','about:blank')
        const theElements = theCanvas.find('.grid-stack-item')
        theElements.each(function(n,theElement){
            canvasData.removeWidget(theElement, true)
        })
        currentMainMonitor = null;
    }
    function reopenLastMonitor(){
        if(lastMainMonitor){
            addMonitorAndAssociated(lastMainMonitor)
        }
    }
    function setOnScreenLock(){
        clearTimeout(onScreenLockTimeout)
        onScreenLockTimeout = setTimeout(function(){
            delete(onScreenLockTimeout)
        },5000)
    }
    function onPageInit(){
        if(dashboardOptions().switches){
            openCrossFeedOnEvent = dashboardOptions().switches.openCrossFeedOnEvent == 1
        }else{
            openCrossFeedOnEvent = true
        }
    }
    function onWindowResize(){
        const windowHeight = $(window).height();
        theCanvas.css('height',`${windowHeight}px!important`)
        theEnclosure.css('height',`${windowHeight}px!important`)
        const availableHeight = windowHeight;
        const numRows = 3
        const cellHeight = Math.floor(availableHeight / numRows / legend[numRows]);
        canvasData.cellHeight(cellHeight);
        return cellHeight;
    }
    function onWindowResizeTimeout(forceResume, callback = () => {}){
        clearTimeout(crossfeedWindowResizeTimeout)
        crossfeedWindowResizeTimeout = setTimeout(function(){
            onWindowResize()
            callback()
        },500)
    }
    onWebSocketEvent((data) => {
        switch(data.f){
            case'detector_trigger':
                if(openCrossFeedOnEvent){
                    openTab('crossfeed',{})
                    addMonitorAndAssociated(data.id)
                }
            break;
        }
    })
    onDashboardReady(function(){
        onPageInit()
    })
    addOnTabReopen('crossfeed', function () {
        reopenLastMonitor()
    })
    addOnTabAway('crossfeed', function () {
        closeMonitors()
    })
    dashboardSwitchCallbacks.openCrossFeedOnEvent = function(toggleState){
        // audio_alert
        if(toggleState !== 1){
            openCrossFeedOnEvent = false
        }else{
            openCrossFeedOnEvent = true
        }
    }
})
