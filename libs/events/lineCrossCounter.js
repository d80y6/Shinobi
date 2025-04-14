const LineCrossCounter = require('./lineCrossCounter.js');
module.exports = (s,config,lang) => {
    function setupLineCounter(monitorId, groupKey){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const monitorConfig = s.group[groupKey].rawMonitorConfigurations[monitorId]
        const monitorDetails = monitorConfig.details;
        const lineCounterEnabled = monitorDetails.detectorLineCounter === '1';
        if(lineCounterEnabled && !activeMonitor.lineCounter){
            const lineCounterSettings = monitorDetails.detectorLineCounterSettings;
            const downName = lineCounterSettings.downName || 'Down';
            const upName = lineCounterSettings.upName || 'Up';
            const resetDaily = lineCounterSettings.resetDaily;
            const lineCounterTags = monitorDetails.detectorLineCounterTags.split(',');
            const imageWidth = parseInt(monitorDetails.detector_scale_x_object) || 1280
            const imageHeight = parseInt(monitorDetails.detector_scale_y_object) || 720
            if(lineCounterTags.length === 0)lineCounterTags.push('person');
            const counter = new LineCrossCounter(imageWidth, imageHeight, lineCounterSettings.lines, lineCounterTags);
            counter.name = {
                down: downName,
                up: upName,
            };
            if(resetDaily){
                counter.enableDailyReset()
            }
            activeMonitor.lineCounter = counter;
        }else{
            delete(activeMonitor.lineCounter)
        }
    }
    function destroyLineCounter(monitorId, groupKey){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        delete(activeMonitor.lineCounter)
    }
    function resetLineCounter(monitorId, groupKey){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        activeMonitor.lineCounter.resetCounters()
    }
    async function saveEventCount(monitorId, groupKey, changedCount, eventTime){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const lineCounter = activeMonitor.lineCounter;
        for(tag in changedCount){
            const tagCounts = changedCount[tag]
            for(direction in tagCounts){
                const theCount = tagCounts[direction];
                if(theCount > 0){
                    const insertResponse = await s.knexQueryPromise({
                        action: "insert",
                        table: "Events Counts",
                        insert: {
                            ke: groupKey,
                            mid: monitorId,
                            tag: tag,
                            name: lineCounter.name[direction],
                            count: theCount,
                            time: eventTime,
                            end: eventTime,
                            details: '{}'
                        }
                    })
                }
            }
        }
    }
    async function processDetectionWithLineCounter(monitorId, groupKey, matrices = []){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        if(activeMonitor.lineCounter && matrices.length > 0){
            const { frameResult, changedCount } = activeMonitor.lineCounter.processDetections(matrices);
            await saveEventCount(monitorId, groupKey, changedCount, eventTime)
        }
    }
    s.onMonitorStart(function(monitorConfig){
        setupLineCounter(monitorConfig.mid, monitorConfig.ke)
    })
    s.onEventTrigger(function(d,filter,eventTime){
        const monitorId = d.mid || d.id;
        const groupKey = d.ke;
        const eventDetails = d.details;
        if(eventDetails.reason !=== 'motion'){
            processDetectionWithLineCounter(monitorId, groupKey, eventDetails.matrices)
        }
    })
}
