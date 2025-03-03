$(document).ready(function(){
    PNotify.prototype.options.styling = "fontawesome";
    var alarmContainer = $('#alarm-container')
    var alarmLiveStream = $('#alarm-live-stream')
    var alarmLiveStreamPtz = $('#alarm-live-stream-ptz')
    var alarmFileBinVideo = $('#alarm-fileBin-video')
    var alarmTitle = $('#alarm-title')
    var alarmInfo = $('#alarm-info')
    function getApiPrefix(innerPart){
        return `${urlPrefix}${authKey}${innerPart ? `/${innerPart}/${groupKey}` : ''}`
    }
    function getFileBinHref(file){
        var href = getApiPrefix('fileBin') + '/' + file.mid + '/' + file.name
        return href
    }
    function getAlarms(options = {}){
        return new Promise((resolve,reject) => {
            const { start, startOperator } = options;
            $.getJSON(`${getApiPrefix(`alarms`)}${monitorId}`,options,function({ alarms }){
                if(startOperator === '='){
                    options.end = alarms[0].end;
                    options.limit = '1';
                }else{
                    options.noLimit = '1';
                }
                // $.getJSON(`${getApiPrefix(`fileBin`)}${monitorId}`,options,function({ files }){
                    $.getJSON(`${getApiPrefix(`events`)}${monitorId}`,options,function(eventData){
                        var theEvents = eventData.events || eventData;
                        // alarms = applyDataListToVideos(alarms,files,'files')
                        alarms = applyDataListToVideos(videos,theEvents,'events')
                        resolve({ alarms })
                    })
                // })
            })
        })
    }
    function updateAlarm(form){
        return new Promise((resolve,reject) => {
            options.start = typeof options.start === 'date' ? formattedTimeForFilename(options.start,false) : options.start
            $.post(`${getApiPrefix(`alarms`)}${monitorId}/${}`,form,function(response){
                resolve(response)
            })
        })
    }
    // function getMonitor(monitorId){
    //     return new Promise((resolve,reject) => {
    //         $.getJSON(`${getApiPrefix(`alarms`)}${monitorId}`,options,function(monitors){
    //             resolve(monitors[0])
    //         })
    //     })
    // }
    async function getAlarm(startTime){
        const alarm = await getAlarms({ startDate: startTime, startOperator: '=' })[0];
        return alarm;
    }
    function drawLiveStream(monitorId, drawEl){
        var embedHost = getQueryString().host || `/`;
        var isSelected = selectedMonitors[monitorId]
        if(isSelected)return;
        var numberOfSelected = Object.keys(selectedMonitors)
        if(numberOfSelected > 3 && !featureIsActivated(true)){
            return
        }
        selectedMonitors[monitorId] = Object.assign({}, loadedMonitors[monitorId]);
        drawEl.html(`<div class="alarm-live-video p-0 m-0" live-stream="${monitorId}"><iframe src="${getApiPrefix('embed')}/${monitorId}/fullscreen%7Cjquery%7Crelative?host=${embedHost}"></iframe></div>`)
    }
    function drawAlarmInfo(alarm){
        alarmTitle.text(formattedTime(alarm.time, true))
        alarmInfo.html(`<div class="notes">${alarm.notes}</div>`)
    }
    function drawFileBinVideo(alarm){
        const file = alarm.fileBinName;
        if(file){
            const href = getFileBinHref({ mid: monitorId, name: alarm.fileBinName });
            alarmFileBinVideo.html(`<video class="video_video" style="width:100%" autoplay controls preload loop src="${href}"></video>`)
        }else{
            alarmFileBinVideo.text(lang['No Snippet Found'])
        }
    }
    async function displayAlarm(startTime){
        // const monitor = await getMonitor(monitorId);
        const associatedPtzMonitors = (monitor.details.triggerMonitorsPtzTargets || [])[0]
        const alarm = await getAlarm(startTime);
        drawFileBinVideo(alarm);
        drawAlarmInfo(alarm);
        drawLiveStream(monitorId, alarmLiveStream);
        if(associatedPtzMonitors)drawLiveStream(monitorId, alarmLiveStreamPtz)
    }
    async function initPopup(){
        const { time } = getQueryString();
        if(time){
            await displayAlarm(time);
        }else{
            alarmTitle.html(lang['No Data'])
        }
    }
    initPopup()
});
