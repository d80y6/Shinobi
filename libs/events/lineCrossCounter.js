const LineCrossCounter = require('./libs/lineCrossCounter.js');
module.exports = (s,config,lang) => {
    function setupLineCounter(monitorId, groupKey){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const monitorConfig = s.group[groupKey].rawMonitorConfigurations[monitorId]
        const monitorDetails = monitorConfig.details;
        const lineCounterEnabled = monitorDetails.detectorLineCounter === '1';
        if(lineCounterEnabled){
            if(!activeMonitor.lineCounter){
                const lineCounterSettings = monitorDetails.detectorLineCounterSettings;
                const downName = lineCounterSettings.downName || 'Down';
                const upName = lineCounterSettings.upName || 'Up';
                const resetDaily = lineCounterSettings.resetDaily;
                const lineCounterTags = monitorDetails.detectorLineCounterTags.split(',');
                const imageWidth = parseInt(monitorDetails.detector_scale_x_object) || 1280
                const imageHeight = parseInt(monitorDetails.detector_scale_y_object) || 720
                if(lineCounterTags.length === 0)lineCounterTags.push('person');
                // console.log('lineCounterSettings.lines',lineCounterSettings.lines)
                const counter = new LineCrossCounter(imageWidth, imageHeight, lineCounterSettings.lines, lineCounterTags);
                counter.name = {
                    down: downName,
                    up: upName,
                };
                if(resetDaily){
                    counter.enableDailyReset()
                }
                activeMonitor.lineCounter = counter;
            }
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
    async function saveEventCount(monitorId, groupKey, changedCount, frameResult, eventTime){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const lineCounter = activeMonitor.lineCounter;
        const byTag = changedCount.byTag;
        for(tag in byTag){
            const tagCounts = byTag[tag]
            for(direction in tagCounts){
                const newCount = tagCounts[direction];
                if(newCount > 0){
                    // console.log(JSON.stringify(frameResult,null,3))
                    // console.log(JSON.stringify(byTag,null,3))
                    const theCount = frameResult.byTag[tag][direction];
                    // console.log({
                    //     action: "insert",
                    //     table: "Events Counts",
                    //     insert: {
                    //         ke: groupKey,
                    //         mid: monitorId,
                    //         tag: tag,
                    //         name: lineCounter.name[direction],
                    //         count: theCount,
                    //         time: eventTime,
                    //         end: eventTime,
                    //         details: '{}'
                    //     }
                    // })
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
    async function processDetectionWithLineCounter(monitorId, groupKey, matrices = [], eventTime){
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        if(activeMonitor.lineCounter && matrices.length > 0){
            const { frameResult, changedCount } = activeMonitor.lineCounter.processDetections(matrices);
            await saveEventCount(monitorId, groupKey, changedCount, frameResult, eventTime)
            // console.log(frameResult)
        }
    }
    s.onMonitorStart(function(monitorConfig){
        setupLineCounter(monitorConfig.mid, monitorConfig.ke)
    })
    s.onMonitorSave(function(monitorConfig){
        destroyLineCounter(monitorConfig.mid, monitorConfig.ke)
    })
    s.onEventTrigger(function(d,filter,eventTime){
        const monitorId = d.mid || d.id;
        const groupKey = d.ke;
        const eventDetails = d.details;
        if(eventDetails.reason !== 'motion'){
            processDetectionWithLineCounter(monitorId, groupKey, eventDetails.matrices, eventTime)
        }
    })
}
