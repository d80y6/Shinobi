$(document).ready(function(){
    PNotify.prototype.options.styling = "fontawesome";
    var alarmContainer = $('#alarm-container')
    var alarmLiveStream = $('#alarm-live-stream')
    var alarmLiveStreamPtz = $('#alarm-live-stream-ptz')
    var alarmFileBinVideo = $('#alarm-fileBin-video')
    var alarmTitle = $('#alarm-title')
    var alarmName = $('#alarm-name')
    var alarmNotes = $('#alarm-notes')
    var alarmStatus = $('#alarm-status')
    var alarmFileBinVideos = $('#alarm-fileBin-videos')
    var alarmTime = getQueryString().time;
    var websocketPath = checkCorrectPathEnding(urlPrefix.replace(location.origin, '')) + 'socket.io'
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
            $.getJSON(`${getApiPrefix(`alarms`)}/${monitorId}`,options,function({ alarms }){
                if(startOperator === '='){
                    options.end = alarms[0].end;
                    options.limit = '1';
                }else{
                    options.noLimit = '1';
                }
                options.startDate = start
                // $.getJSON(`${getApiPrefix(`fileBin`)}${monitorId}`,options,function({ files }){
                    $.getJSON(`${getApiPrefix(`events`)}/${monitorId}`,options,function(eventData){
                        var theEvents = eventData.events || eventData;
                        // alarms = applyDataListToVideos(alarms,files,'files')
                        alarms = applyDataListToVideos(alarms,theEvents,'events')
                        resolve({ alarms })
                    })
                // })
            })
        })
    }
    function updateAlarm(form){
        return new Promise((resolve,reject) => {
            form.time = formattedTimeForFilename(convertTZ(alarmTime, serverTimezone),null,'YYYY-MM-DDTHH:mm:ss')
            $.post(`${getApiPrefix(`alarms`)}/${form.mid}`,form,function(response){
                resolve(response)
            })
        })
    }
    function getMonitor(monitorId){
        return new Promise((resolve,reject) => {
            $.getJSON(`${getApiPrefix(`monitor`)}/${monitorId}`,function(monitors){
                resolve(monitors[0])
            })
        })
    }
    async function getAlarm(startTime){
        const time = formattedTimeForFilename(convertTZ(startTime, serverTimezone),null,'YYYY-MM-DDTHH:mm:ss')
        const alarm = (await getAlarms({ start: time, startOperator: '=' })).alarms[0];
        return alarm;
    }
    function drawLiveStream(monitorId, drawEl){
        var embedHost = getQueryString().host || `/`;
        drawEl.html(`<div class="alarm-live-video p-0 m-0" live-stream="${monitorId}"><iframe src="${getApiPrefix('embed')}/${monitorId}/fullscreen%7Cjquery%7Crelative?host=${embedHost}"></iframe></div>`)
    }
    function drawAlarmInfo(alarm){
        const time = formattedTime(alarm.time, true)
        alarmTitle.text(`${alarm.name ? `${alarm.name || ''} : ` : ''}${time}`)
        alarmName.val(alarm.name)
        alarmNotes.val(alarm.notes)
        alarmStatus.val(alarm.status)
    }
    async function drawAlarmFileBinVideoLinks(alarm){
        const fileBinVideos = alarm.fileBinVideos || {};
        let html = ''
        for(monitorId in fileBinVideos){
            const gottenMonitor = await getMonitor(monitorId)
            const fileBinName = fileBinVideos[monitorId]
            html += `<li><a data-mid="${monitorId}" data-filename="${fileBinName}" class="btn preview-video">${gottenMonitor.name}</a></li>`
        }
        alarmFileBinVideos.html(html)
    }
    function drawFileBinVideo(alarm, triggerVideoMonitorId, fileBinName){
        const monitorId = alarm.mid;
        const chosenMonitorId = triggerVideoMonitorId || monitorId;
        const triggerVideo = fileBinName || alarm.fileBinVideos[chosenMonitorId];
        if(triggerVideo){
            const href = getFileBinHref({ mid: chosenMonitorId, name: triggerVideo });
            alarmFileBinVideo.html(`<video class="video_video" style="width:100%" autoplay controls preload loop src="${href}"></video>`)
        }
    }
    async function displayAlarm(startTime){
        const associatedPtzMonitorId = getAssociatedMonitorPtzTargets(true)[0]
        const alarm = await getAlarm(startTime);
        drawAlarmInfo(alarm);
        drawLiveStream(monitorId, alarmLiveStream);
        drawAlarmFileBinVideoLinks(alarm);
        if(associatedPtzMonitorId)drawLiveStream(associatedPtzMonitorId, alarmLiveStreamPtz)
        if(alarm.fileBinVideos[associatedPtzMonitorId]){
            drawFileBinVideo(alarm, associatedPtzMonitorId);
        }else{
            drawFileBinVideo(alarm, monitorId);
        }
    }
    function getAssociatedMonitorPtzTargets(monitorIdsOnly){
        const monitorDetails = monitor.details;
        const detectorEventPtz = monitorDetails.detectorEventPtz === '1';
        if(detectorEventPtz){
            const triggerMonitorsPtzTargets = monitorDetails.triggerMonitorsPtzTargets || {}
            return monitorIdsOnly ? Object.keys(triggerMonitorsPtzTargets) : triggerMonitorsPtzTargets;
        }else{
            return monitorIdsOnly ? [] : {}
        }
    }
    async function initPopup(){
        if(alarmTime){
            await displayAlarm(alarmTime);
        }else{
            alarmTitle.html(lang['No Data'])
        }
    }
    alarmContainer.on('click','.preview-video',function(){
        const el = $(this);
        const monitorId = el.attr('data-mid')
        const fileBinName = el.attr('data-filename')
        drawFileBinVideo({ mid: monitorId }, monitorId, fileBinName)
    })
    alarmName.change(function(){
        const el = $(this);
        const value = el.val();
        updateAlarm({
            mid: monitorId,
            time: alarmTime,
            name: value
        })
    })
    alarmNotes.change(function(){
        const el = $(this);
        const value = el.val();
        updateAlarm({
            mid: monitorId,
            time: alarmTime,
            notes: value
        })
    })
    alarmStatus.change(function(){
        const el = $(this);
        const value = el.val();
        updateAlarm({
            mid: monitorId,
            time: alarmTime,
            status: value
        })
    })
    onWebSocketEvent((data) => {
        switch(data.f){
            case'alarm_created':
                console.log('Alarm Created', data)
            break;
            case'alarm_updated':
                const time = data.time
                const thisTime = formattedTimeForFilename(convertTZ(alarmTime, serverTimezone),null,'YYYY-MM-DDTHH-mm-ss')
                if(data.fileBinVideos && thisTime === time){
                    const associatedPtzMonitorId = getAssociatedMonitorPtzTargets(true)[0]
                    drawFileBinVideo(data, associatedPtzMonitorId || data.mid)
                    drawAlarmFileBinVideoLinks(data)
                }
            break;
            case'alarm_deleted':
                console.log('Alarm Deleted', data)
            break;
        }
    })
    createWebsocket(location.origin,{
        path: websocketPath
    });
    initPopup()
});
