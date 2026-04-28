const fs = require('fs').promises;
const moment = require('moment');
const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const imageSaveEventLock = {};
// Matrix In Region Libs >
const SAT = require('sat')
const V = SAT.Vector;
const P = SAT.Polygon;
const B = SAT.Box;
// Matrix In Region Libs />
module.exports = (s,config,lang) => {
    const motionFrameSaveTimeouts = {}
    // Event Filters >
    const acceptableOperators = ['indexOf','!indexOf','===','!==','>=','>','<','<=']
    // Event Filters />
    const {
        splitForFFMPEG
    } = require('../ffmpeg/utils.js')(s,config,lang)
    const {
        moveCameraPtzToMatrix,
        moveToHomePositionTimeout,
    } = require('../control/ptz.js')(s,config,lang)
    const {
        getOnvifDevice,
        getPresets,
        goToPreset,
    } = require('../onvifDeviceManager/utils.js')(s,config,lang)
    const {
        cutVideoLength,
        reEncodeVideoAndBinOriginalAddToQueue
    } = require('../video/utils.js')(s,config,lang)
    const {
        getTracked,
        setLastTracked,
        trackObjectWithTimeout,
        getAllMatricesThatMoved,
    } = require('./tracking.js')(config)
    const {
        isEven,
        fetchTimeout,
        copyFile,
    } = require('../basic/utils.js')(process.cwd(),config)
    const glyphs = require('../../definitions/glyphs.js')

    /**
     * @typedef {Object} Matrix
     * @property {number} x - Left edge of the bounding box in pixels
     * @property {number} y - Top edge of the bounding box in pixels
     * @property {number} width - Width of the bounding box in pixels
     * @property {number} height - Height of the bounding box in pixels
     * @property {string} tag - Detected object label (e.g. 'person', 'car', 'face')
     * @property {number} confidence - Detection confidence score (0–1)
     * @property {number} [id] - Optional tracked object ID assigned by the tracking system
     */

    /**
     * @typedef {Object} Region
     * @property {Array<[string, string]>} points - Polygon vertices as [x, y] string pairs
     */

    /**
     * @typedef {Object} EventDetails
     * @property {string} reason - Trigger reason ('motion', 'object', or plugin name)
     * @property {string} name - Region or trigger name
     * @property {string} [plug] - Name of the plugin that generated the event
     * @property {Matrix[]} [matrices] - Detected objects with bounding boxes
     * @property {number} [confidence] - Overall event confidence score
     * @property {number} [time] - AI processing duration in milliseconds
     */

    /**
     * @typedef {Object} EventData
     * @property {string} ke - Group key
     * @property {string} id - Monitor ID
     * @property {string} [mid] - Alternate monitor ID field (some paths use mid instead of id)
     * @property {string} f - Event type identifier (e.g. 'trigger', 'frame')
     * @property {EventDetails} details - Detection details payload
     * @property {Buffer} [frame] - Raw JPEG frame buffer attached to the event
     * @property {boolean} [doObjectDetection] - Set to true when follow-up object detection is queued
     * @property {Date} [currentTime] - Populated by runEventExecutions with the event timestamp
     * @property {string} [currentTimestamp] - ISO-formatted event timestamp string
     * @property {string} [screenshotName] - Computed filename for the event snapshot
     * @property {Buffer|null} [screenshotBuffer] - Screenshot buffer (null until populated by an extender)
     */

    /**
     * @typedef {Object} MonitorDetails
     * @property {string} [detector] - Whether the detector is enabled ('1' | '0')
     * @property {string} [detector_trigger] - Whether event-based recording is triggered ('1' | '0')
     * @property {string} [detector_record_method] - Recording method ('sip' | 'hot' | 'del')
     * @property {string} [detector_timeout] - Recording timeout in minutes (string-encoded float)
     * @property {string} [detector_lock_timeout] - Motion lock debounce in ms (string-encoded float)
     * @property {string} [detector_save] - Whether to persist the event to the DB ('1' | '0')
     * @property {string} [detector_webhook] - Whether to fire a webhook on event ('1' | '0')
     * @property {string} [detector_webhook_url] - Webhook URL template (supports {{placeholders}})
     * @property {string} [detector_webhook_method] - HTTP method for webhook ('GET' | 'POST' etc.)
     * @property {string} [detector_webhook_timeout] - Webhook cooldown timeout in seconds
     * @property {string} [detector_command_enable] - Whether to run a shell command on event ('1' | '0')
     * @property {string} [detector_command] - Shell command template (supports {{placeholders}})
     * @property {string} [detector_command_timeout] - Command cooldown timeout in seconds
     * @property {string} [detector_ptz_follow] - Follow detected object with PTZ ('1' | '0')
     * @property {string} [detector_ptz_follow_target] - Which object tag to follow with PTZ
     * @property {string} [detector_obj_region] - Restrict detections to defined regions ('1' | '0')
     * @property {string} [detector_object_ignore_not_move] - Ignore stationary objects ('1' | '0')
     * @property {string} [detector_use_detect_object] - Enable secondary object detection plugin ('1' | '0')
     * @property {string} [detector_use_motion] - Use motion to trigger object detection ('1' | '0')
     * @property {string} [detector_obj_count] - Count detected objects per tag ('1' | '0')
     * @property {string} [detector_obj_count_in_region] - Only count objects inside region ('1' | '0')
     * @property {string} [detector_record_overlap] - Allow overlapping event recordings ('1' | '0')
     * @property {string} [detector_buffer_seconds_before] - Pre-event HLS buffer in seconds
     * @property {string} [detector_buffer_acodec] - Audio codec for event recordings ('no' | 'auto' | 'aac' | codec)
     * @property {string} [detector_motion_save_frame] - Save a snapshot on motion events ('1' | '0')
     * @property {string} [detector_send_video_length] - Max clip length in seconds for email/webhook sends
     * @property {string} [detector_delete_motionless_videos] - Delete recordings with no motion ('1' | '0')
     * @property {Object} [detector_filters] - Configured event filter rule definitions
     * @property {string} [use_detector_filters] - Whether event filters are active ('1' | '0')
     * @property {string} [use_detector_filters_object] - Apply filters only to object events ('1' | '0')
     * @property {string} [det_trigger_tags] - Comma-separated monitor tags to trigger on event
     * @property {string} [detectorEventPtz] - Move associated monitor PTZ on event ('1' | '0')
     * @property {Object} [triggerMonitorsPtzTargets] - Map of monitorId → ONVIF preset token
     * @property {string} [watchdog_reset] - Whether to reset recording watchdog on new events ('1' | '0')
     * @property {string} [event_record_aduration] - analyzeDuration passed to FFmpeg for event recordings
     * @property {string} [event_record_probesize] - probeSize passed to FFmpeg for event recordings
     * @property {string} [auto_compress_videos] - Auto-compress completed recordings to webm ('1' | '0')
     * @property {string} [detectors_selected] - Comma-separated plugin names or 'all'
     * @property {string} [is_onvif] - Whether this monitor has ONVIF support ('1' | '0')
     */

    /**
     * @typedef {Object} MonitorConfig
     * @property {string} ke - Group key
     * @property {string} mid - Monitor ID
     * @property {string} mode - Current monitor mode ('start' | 'record' | 'stop')
     * @property {string} name - Human-readable monitor name
     * @property {string} [tags] - Comma-separated tag labels
     * @property {MonitorDetails} details - Monitor settings object
     */

    /**
     * @typedef {Object} EventFilter
     * @property {boolean} halt - Abort all further event processing when true
     * @property {boolean} addToMotionCounter - Whether to increment the motion event counter
     * @property {boolean} useLock - Whether to enforce the motion lock debounce
     * @property {boolean} save - Whether to persist the event to the database
     * @property {boolean} webhook - Whether to fire the configured webhook
     * @property {boolean} command - Whether to execute the configured shell command
     * @property {boolean} record - Whether to trigger event-based recording
     * @property {boolean} forceRecord - Force recording regardless of other filter state
     * @property {boolean|number|string} indifference - Minimum confidence threshold override (false = disabled)
     * @property {boolean} countObjects - Whether to run per-tag object counting
     */

    /**
     * @typedef {Object} SaveImageOptions
     * @property {string} ke - Group key
     * @property {string} [mid] - Monitor ID (preferred)
     * @property {string} [id] - Monitor ID fallback
     * @property {Date} time - Timestamp of the event
     * @property {Matrix[]} matrices - Detected objects to associate with the saved frame
     */

    /**
     * Saves a JPEG frame from a detection event into the timelapse frame directory,
     * then creates a timelapse DB entry. Debounced per monitor with a 1-second lock.
     * @param {SaveImageOptions} options
     * @param {Buffer} frameBuffer - Raw JPEG image data
     * @returns {Promise<void>}
     */
    async function saveImageFromEvent(options,frameBuffer){
        const monitorId = options.mid || options.id
        const groupKey = options.ke
        //if(!frameBuffer || imageSaveEventLock[groupKey + monitorId])return;
        if(!frameBuffer || frameBuffer.length === 0 || imageSaveEventLock[groupKey + monitorId]) return;
        const eventTime = options.time
        const objectsFound = options.matrices
        const monitorConfig = Object.assign({id: monitorId},s.group[groupKey].rawMonitorConfigurations[monitorId])
        const timelapseRecordingDirectory = s.getTimelapseFrameDirectory(monitorConfig)
        const currentDate = s.formattedTime(eventTime,'YYYY-MM-DD')
        const filename = s.formattedTime(eventTime) + '.jpg'
        const location = timelapseRecordingDirectory + currentDate + '/'
        try{
            await fs.stat(location)
        }catch(err){
            await fs.mkdir(location)
        }
        await fs.writeFile(location + filename,frameBuffer)
        s.createTimelapseFrameAndInsert(monitorConfig,location,filename,eventTime,{
            objects: objectsFound
        })
        imageSaveEventLock[groupKey + monitorId] = setTimeout(function(){
            delete(imageSaveEventLock[groupKey + monitorId])
        },1000)
    }

    /**
     * Accumulates object detection counts per tag for a monitor.
     * Tracks unique object IDs and timestamps for each detected tag.
     * @param {EventData} event
     * @returns {Promise<Object.<string, {times: number[], count: Object.<string, number>, tag: string}>>}
     */
    const countObjects = async (event) => {
        const matrices = event.details.matrices
        const eventsCounted = s.group[event.ke].activeMonitors[event.id].eventsCounted || {}
        if(matrices){
            matrices.forEach((matrix)=>{
                const id = matrix.tag
                if(!eventsCounted[id])eventsCounted[id] = {times: [], count: {}, tag: matrix.tag}
                if(!isNaN(matrix.id))eventsCounted[id].count[matrix.id] = 1
                eventsCounted[id].times.push(new Date().getTime())
            })
        }
        return eventsCounted
    }

    /**
     * Replaces {{PLACEHOLDER}} tokens in a template string with values derived
     * from the event data. Supports: TIME, REGION_NAME, SNAP_PATH, MONITOR_ID,
     * MONITOR_NAME, GROUP_KEY, DETAILS, TAG, CONFIDENCE, REASON.
     * @param {EventData} eventData
     * @param {string} string - Template string containing {{PLACEHOLDER}} tokens
     * @param {Object} [addOps] - Additional properties to merge onto eventData before substitution
     * @returns {string} The string with all recognized placeholders replaced
     */
    const addEventDetailsToString = (eventData,string,addOps) => {
        //d = event data
        if(!addOps)addOps = {}
        var newString = string + ''
        var d = Object.assign(eventData,addOps)
        var detailString = s.stringJSON(d.details)
        var firstMatrix = d.details.matrices ? d.details.matrices[0] : null;
        var tag = firstMatrix ? firstMatrix.tag : '';
        newString = newString
          .replace(/{{TIME}}/g,d.currentTimestamp)
          .replace(/{{REGION_NAME}}/g,d.details.name)
          .replace(/{{SNAP_PATH}}/g,s.dir.streams+d.ke+'/'+d.id+'/s.jpg')
          .replace(/{{MONITOR_ID}}/g,d.id)
          .replace(/{{MONITOR_NAME}}/g,s.group[d.ke].rawMonitorConfigurations[d.id].name)
          .replace(/{{GROUP_KEY}}/g,d.ke)
          .replace(/{{DETAILS}}/g,detailString);
        if(firstMatrix && tag){
            newString = newString.replace(/{{TAG}}/g,tag)
        }
        if(d.details.confidence || firstMatrix){
            newString = newString
              .replace(/{{CONFIDENCE}}/g,d.details.confidence || firstMatrix.confidence)
        }
        if(d.details.reason && newString.includes("REASON")) {
            newString = newString
              .replace(/{{REASON}}/g, d.details.reason)
        }
        return newString
    }

    /**
     * Filters a list of detection matrices down to those that spatially overlap
     * at least one of the configured regions, using SAT polygon collision testing.
     * @param {Region[]} regions - Configured detection regions (polygon vertices)
     * @param {Matrix[]} matrices - Detected object bounding boxes to test
     * @returns {Matrix[]} Subset of matrices whose bounding boxes intersect a region
     */
    const isAtleastOneMatrixInRegion = function(regions,matrices){
        var regionPolys = []
        var matrixPoints = []
        regions.forEach(function(region,n){
            var polyPoints = []
            region.points.forEach(function(point){
                polyPoints.push(new V(parseInt(point[0]),parseInt(point[1])))
            })
            regionPolys[n] = new P(new V(0,0), polyPoints)
        })
        var collisions = []
        matrices.forEach(function(matrix){
            var matrixPoly = new B(new V(matrix.x, matrix.y), matrix.width, matrix.height).toPolygon()
            var foundInRegion = false
            regionPolys.forEach(function(region,n){
                if(!foundInRegion){
                    var response = new SAT.Response()
                    var collided = SAT.testPolygonPolygon(matrixPoly, region, response)
                    if(collided === true){
                        foundInRegion = true
                        collisions.push(matrix)
                    }
                }
            })
        })
        return collisions
    }

    /**
     * Returns the matrix with the largest width AND height from the list.
     * Returns null if no matrix has non-zero dimensions or the list is empty.
     * @param {Matrix[]} matrices
     * @returns {Matrix|null}
     */
    const getLargestMatrix = (matrices) => {
        var largestMatrix = {width: 0, height: 0}
        matrices.forEach((matrix) => {
            if(matrix.width > largestMatrix.width && matrix.height > largestMatrix.height)largestMatrix = matrix
        })
        return largestMatrix.x ? largestMatrix : null
    }

    /**
     * Appends the event to the monitor's in-memory motion event counter array.
     * @param {EventData} eventData
     * @returns {void}
     */
    const addToEventCounter = (eventData) => {
        const eventsCounted = s.group[eventData.ke].activeMonitors[eventData.id].detector_motion_count
        eventsCounted.push(eventData)
    }

    /**
     * Resets the motion event counter for a monitor to an empty array.
     * @param {string} groupKey
     * @param {string} monitorId
     * @returns {void}
     */
    const clearEventCounter = (groupKey,monitorId) => {
        s.group[groupKey].activeMonitors[monitorId].detector_motion_count = []
    }

    /**
     * Returns the number of motion events accumulated since the last reset.
     * @param {string} groupKey
     * @param {string} monitorId
     * @returns {number}
     */
    const getEventsCounted = (groupKey,monitorId) => {
        return s.group[groupKey].activeMonitors[monitorId].detector_motion_count.length
    }

    /**
     * Returns true when event details contain at least one detection matrix
     * and the reason is not raw motion (i.e. it is an object-detection result).
     * @param {EventDetails} eventDetails
     * @returns {boolean}
     */
    const hasMatrices = (eventDetails) => {
        return (eventDetails.matrices && eventDetails.matrices.length > 0) && eventDetails.reason !== 'motion'
    }

    /**
     * Performs a type-safe comparison between two values using the given operator.
     * Numeric operators coerce both operands via parseFloat.
     * @param {*} a - Left-hand operand
     * @param {'==='|'!=='|'>='|'>'|'<'|'<='} op - Comparison operator
     * @param {*} b - Right-hand operand
     * @returns {boolean}
     */
    const safeCompare = (a, op, b) => {
        switch(op){
            case '===': return a === b
            case '!==': return a !== b
            case '>=':  return parseFloat(a) >= parseFloat(b)
            case '>':   return parseFloat(a) > parseFloat(b)
            case '<':   return parseFloat(a) < parseFloat(b)
            case '<=':  return parseFloat(a) <= parseFloat(b)
            default: return false
        }
    }

    /**
     * Evaluates all configured event filter rules against the incoming event.
     * Mutates `filter` in place — setting flags like save, record, webhook, halt, etc.
     * Returns false if the event should be suppressed entirely, true otherwise.
     * @param {EventData} d - Incoming event (matrices may be pruned in place)
     * @param {MonitorDetails} monitorDetails
     * @param {EventFilter} filter - Filter state object; mutated by this function
     * @returns {boolean|undefined} false to halt the event, true to allow it, undefined on indifference failure
     */
    const checkEventFilters = (d,monitorDetails,filter) => {
        const eventDetails = d.details;
        if(
          monitorDetails.use_detector_filters === '1' &&
          ((monitorDetails.use_detector_filters_object === '1' && eventDetails.matrices && eventDetails.reason !== 'motion') ||
            monitorDetails.use_detector_filters_object !== '1')
        ){
            const parseValue = function(key,val){
                var newVal
                switch(val){
                    case'':
                        newVal = filter[key]
                        break;
                    case'0':
                        newVal = false
                        break;
                    case'1':
                        newVal = true
                        break;
                    default:
                        newVal = val
                        break;
                }
                return newVal
            }
            const filters = monitorDetails.detector_filters
            Object.keys(filters).forEach(function(key){
                var conditionChain = {}
                var dFilter = filters[key]
                if(dFilter.enabled === '0')return;
                var numberOfOpenAndCloseBrackets = 0
                dFilter.where.forEach(function(condition,place){
                    const hasOpenBracket = condition.openBracket === '1';
                    const hasCloseBracket = condition.closeBracket === '1';
                    conditionChain[place] = {
                        ok: false,
                        next: condition.p4,
                        matrixCount: 0,
                        openBracket: hasOpenBracket,
                        closeBracket: hasCloseBracket,
                    }
                    if(hasOpenBracket)++numberOfOpenAndCloseBrackets;
                    if(hasCloseBracket)++numberOfOpenAndCloseBrackets;
                    if(d.details.matrices)conditionChain[place].matrixCount = d.details.matrices.length
                    var modifyFilters = function(toCheck,matrixPosition){
                        var param = toCheck[condition.p1]
                        var pass = function(){
                            if(matrixPosition && dFilter.actions.halt === '1'){
                                delete(d.details.matrices[matrixPosition])
                            }else{
                                conditionChain[place].ok = true
                            }
                        }
                        switch(condition.p2){
                            case'indexOf':
                                if(param.indexOf(condition.p3) > -1){
                                    pass()
                                }
                                break;
                            case'!indexOf':
                                if(param.indexOf(condition.p3) === -1){
                                    pass()
                                }
                                break;
                            case'===':
                            case'!==':
                            case'>=':
                            case'>':
                            case'<':
                            case'<=':
                                if(safeCompare(param, condition.p2, condition.p3)){ pass() }
                                break;
                        }
                    }
                    switch(condition.p1){
                        case'tag':
                        case'x':
                        case'y':
                        case'height':
                        case'width':
                        case'confidence':
                            if(d.details.matrices){
                                d.details.matrices.forEach(function(matrix,position){
                                    modifyFilters(matrix,position)
                                })
                            }
                            break;
                        case'time':
                            var timeNow = new Date()
                            var timeCondition = new Date()
                            var doAtTime = condition.p3.split(':')
                            var atHour = parseInt(doAtTime[0]) - 1
                            var atHourNow = timeNow.getHours()
                            var atMinuteNow = timeNow.getMinutes()
                            var atSecondNow = timeNow.getSeconds()
                            if(atHour){
                                var atMinute = parseInt(doAtTime[1]) - 1 || timeNow.getMinutes()
                                var atSecond = parseInt(doAtTime[2]) - 1 || timeNow.getSeconds()
                                var nowAddedInSeconds = atHourNow * 60 * 60 + atMinuteNow * 60 + atSecondNow
                                var conditionAddedInSeconds = atHour * 60 * 60 + atMinute * 60 + atSecond
                                if(acceptableOperators.indexOf(condition.p2) > -1 && safeCompare(nowAddedInSeconds, condition.p2, conditionAddedInSeconds)){
                                    conditionChain[place].ok = true
                                }
                            }
                            break;
                        default:
                            modifyFilters(d.details)
                            break;
                    }
                })
                var conditionArray = Object.values(conditionChain)
                var validationString = []
                var allowBrackets = false;
                if (numberOfOpenAndCloseBrackets === 0 || isEven(numberOfOpenAndCloseBrackets)){
                    allowBrackets = true;
                }else{
                    s.userLog(d,{type:lang["Event Filter Error"],msg:lang.eventFilterErrorBrackets})
                }
                conditionArray.forEach(function(condition,number){
                    validationString.push(`${allowBrackets && condition.openBracket ? '(' : ''}${condition.ok}${allowBrackets && condition.closeBracket ? ')' : ''}`);
                    if(conditionArray.length-1 !== number){
                        validationString.push(condition.next)
                    }
                })
                if(eval(validationString.join(' '))){
                    if(dFilter.actions.halt !== '1'){
                        delete(dFilter.actions.halt)
                        Object.keys(dFilter.actions).forEach(function(key){
                            var value = dFilter.actions[key]
                            filter[key] = parseValue(key,value)
                        })
                        if(dFilter.actions.record === '1'){
                            filter.forceRecord = true
                        }
                    }else{
                        filter.halt = true
                    }
                }else{
                    if(dFilter.actions.haltOnFail === '1'){
                        filter.halt = true
                    }
                }
            })
            if ((d.details.matrices && d.details.matrices.length === 0 && d.details.reason !== 'motion') || filter.halt === true) {
                return false
            } else if (hasMatrices(d.details)) {
                var reviewedMatrix = []
                d.details.matrices.forEach(function(matrix){
                    if(matrix)reviewedMatrix.push(matrix)
                })
                d.details.matrices = reviewedMatrix
            }
        }
        // check modified indifference
        if(
          filter.indifference &&
          eventDetails.confidence < parseFloat(filter.indifference)
        ){
            // fails indifference check for modified indifference
            return
        }
        return true
    }

    /**
     * Checks whether the monitor's motion lock allows a new event to be processed.
     * If no lock is active, sets a new debounce timeout and returns true.
     * Returns false if the lock is already held.
     * @param {EventData} eventData
     * @param {MonitorDetails} monitorDetails
     * @returns {boolean} true if the event may proceed, false if suppressed by lock
     */
    const checkMotionLock = (eventData,monitorDetails) => {
        if(s.group[eventData.ke].activeMonitors[eventData.id].motion_lock){
            return false
        }
        var detector_lock_timeout
        if(!monitorDetails.detector_lock_timeout||monitorDetails.detector_lock_timeout===''){
            detector_lock_timeout = 2000
        }else{
            detector_lock_timeout = parseFloat(monitorDetails.detector_lock_timeout)
        }
        if(!s.group[eventData.ke].activeMonitors[eventData.id].detector_lock_timeout){
            s.group[eventData.ke].activeMonitors[eventData.id].detector_lock_timeout=setTimeout(function(){
                clearTimeout(s.group[eventData.ke].activeMonitors[eventData.id].detector_lock_timeout)
                delete(s.group[eventData.ke].activeMonitors[eventData.id].detector_lock_timeout)
            },detector_lock_timeout)
        }else{
            return false
        }
        return true
    }

    /**
     * Triggers event-based recordings on a set of linked monitors when their
     * detector_trigger flag is set and they are actively recording.
     * @param {MonitorConfig} monitorConfig - The source monitor that fired the event
     * @param {string[]} monitorIdsToTrigger - IDs of monitors to start recording on
     * @param {Date} eventTime - Time of the original event
     * @returns {void}
     */
    const runMultiEventBasedRecord = (monitorConfig, monitorIdsToTrigger, eventTime) => {
        monitorIdsToTrigger.forEach(function(monitorId){
            const groupKey = monitorConfig.ke
            const monitor = s.group[groupKey].rawMonitorConfigurations[monitorId]
            if(monitorId !== monitorConfig.mid && monitor){
                const monitorDetails = monitor.details
                if(
                  monitorDetails.detector_trigger === '1' &&
                  monitor.mode === 'start' &&
                  (monitorDetails.detector_record_method === 'sip' || monitorDetails.detector_record_method === 'hot')
                ){
                    const secondBefore = (parseInt(monitorDetails.detector_buffer_seconds_before) || 5) + 1
                    createEventBasedRecording(monitor,moment(eventTime).subtract(secondBefore,'seconds').format('YYYY-MM-DDTHH-mm-ss'))
                }
            }
        })
    }

    /**
     * Builds (or rebuilds) the tag → monitorId index for a group.
     * Stored at `s.group[groupKey].tagLegend` and used by findMonitorsAssociatedToTags.
     * @param {string} groupKey
     * @returns {void}
     */
    function bindTagLegendForMonitors(groupKey){
        const newTagLegend = {}
        const theGroup = s.group[groupKey]
        const monitorIds = Object.keys(theGroup.rawMonitorConfigurations || {})
        monitorIds.forEach((monitorId) => {
            const monitorConfig = theGroup.rawMonitorConfigurations[monitorId]
            const theTags = (monitorConfig.tags || '').split(',')
            theTags.forEach((tag) => {
                if(!tag)return;
                if(!newTagLegend[tag])newTagLegend[tag] = []
                if(newTagLegend[tag].indexOf(monitorId) === -1)newTagLegend[tag].push(monitorId)
            })
        })
        theGroup.tagLegend = newTagLegend
    }

    /**
     * Returns the unique set of monitor IDs that have been tagged with any of
     * the provided trigger tags. Requires bindTagLegendForMonitors to have run first.
     * @param {string} groupKey
     * @param {string[]} triggerTags - Tag labels to look up
     * @returns {string[]} Deduplicated list of matching monitor IDs
     */
    function findMonitorsAssociatedToTags(groupKey,triggerTags){
        const monitorsToTrigger = []
        const theGroup = s.group[groupKey]
        triggerTags.forEach((tag) => {
            const monitorIds = theGroup.tagLegend[tag]
            if(!monitorIds) return
            monitorIds.forEach((monitorId) => {
                if(monitorsToTrigger.indexOf(monitorId) === -1)monitorsToTrigger.push(monitorId)
            })
        })
        return monitorsToTrigger
    }

    /**
     * Executes all configured side-effects for a detector event: PTZ follow,
     * tag-linked monitor recordings, snapshot saving, DB insert, event-based
     * FFmpeg recording, webhook, shell command, PTZ presets, and plugin extenders.
     * @param {Date} eventTime
     * @param {MonitorConfig} monitorConfig
     * @param {EventDetails} eventDetails
     * @param {boolean} forceSave - Skip filter checks and force a DB save
     * @param {EventFilter} filter - Filter state produced by checkEventFilters
     * @param {EventData} d - Full event data (mutated: currentTime, currentTimestamp, screenshotName, screenshotBuffer)
     * @param {function(EventData, boolean=): Promise<void>} triggerEvent - Reference to triggerEvent for re-entrant use by extenders
     * @returns {Promise<void>}
     */
    const runEventExecutions = async (eventTime,monitorConfig,eventDetails,forceSave,filter,d, triggerEvent) => {
        const groupKey = monitorConfig.ke
        const monitorId = d.id || d.mid
        const monitorDetails = monitorConfig.details
        const detailString = JSON.stringify(eventDetails)
        const reason = eventDetails.reason
        const timeoutId = `${groupKey}${monitorId}`
        if(monitorDetails.detector_ptz_follow === '1'){
            moveCameraPtzToMatrix(d,monitorDetails.detector_ptz_follow_target)
        }
        if(monitorDetails.det_trigger_tags){
            const triggerTags = monitorDetails.det_trigger_tags.split(',')
            const monitorIds = findMonitorsAssociatedToTags(groupKey, triggerTags)
            runMultiEventBasedRecord(monitorConfig, monitorIds, eventTime)
        }
        //save this detection result in SQL, only coords. not image.
        if(d.frame){
            saveImageFromEvent({
                ke: groupKey,
                mid: monitorId,
                time: eventTime,
                matrices: eventDetails.matrices || [],
            },d.frame)
        }else if(
          !motionFrameSaveTimeouts[timeoutId] &&
          reason === 'motion' &&
          monitorDetails.detector_motion_save_frame === '1' &&
          (
            monitorDetails.detector_use_detect_object !== '1' ||
            (monitorDetails.detector_use_detect_object === '1' && monitorDetails.detector_use_motion !== '1')
          )
        ){
            motionFrameSaveTimeouts[timeoutId] = setTimeout(() => {
                delete(motionFrameSaveTimeouts[timeoutId])
            },60000);
            s.getRawSnapshotFromMonitor(monitorConfig,{
                secondsInward: parseInt(monitorConfig.details.detector_buffer_seconds_before) || 5
            }).then(({ screenShot, isStaticFile }) => {
                saveImageFromEvent({
                    ke: groupKey,
                    mid: monitorId,
                    time: eventTime,
                    matrices: eventDetails.matrices || [],
                }, screenShot)
            })
        }
        if(forceSave || (filter.save || monitorDetails.detector_save === '1')){
            s.knexQuery({
                action: "insert",
                table: "Events",
                insert: {
                    ke: groupKey,
                    mid: monitorId,
                    details: detailString,
                    time: s.formattedTime(eventTime),
                }
            })
        }
        var detector_timeout
        if(!monitorDetails.detector_timeout||monitorDetails.detector_timeout===''){
            detector_timeout = 10
        }else{
            detector_timeout = parseFloat(monitorDetails.detector_timeout)
        }
        if(
          (filter.forceRecord || (filter.record && monitorDetails.detector_trigger === '1')) &&
          monitorConfig.mode === 'start' &&
          (monitorDetails.detector_record_method === 'sip' || monitorDetails.detector_record_method === 'hot')
        ){
            const secondBefore = (parseInt(monitorDetails.detector_buffer_seconds_before) || 5) + 1
            createEventBasedRecording(d,moment(eventTime).subtract(secondBefore,'seconds').format('YYYY-MM-DDTHH-mm-ss'))
        }
        d.currentTime = eventTime
        d.currentTimestamp = s.timeObject(eventTime).format()
        d.screenshotName =  eventDetails.reason + '_'+(monitorConfig.name.replace(/[^\w\s]/gi,''))+'_'+d.id+'_'+d.ke+'_'+s.formattedTime(eventTime)
        d.screenshotBuffer = null

        if(filter.webhook && monitorDetails.detector_webhook === '1' && !s.group[d.ke].activeMonitors[d.id].detector_webhook){
            s.group[d.ke].activeMonitors[d.id].detector_webhook = s.createTimeout('detector_webhook',s.group[d.ke].activeMonitors[d.id],monitorDetails.detector_webhook_timeout,10)
            var detector_webhook_url = addEventDetailsToString(d,monitorDetails.detector_webhook_url)
            var webhookMethod = monitorDetails.detector_webhook_method
            if(!webhookMethod || webhookMethod === '')webhookMethod = 'GET'
            fetchTimeout(detector_webhook_url,10000,{
                method: webhookMethod
            }).catch((err) => {
                s.userLog(d,{type:lang["Event Webhook Error"],msg:{error:err,data:data}})
            })
        }

        if(
          filter.command || (
            monitorDetails.detector_command_enable === '1' &&
            !s.group[d.ke].activeMonitors[monitorId].detector_command
          )
        ){
            s.group[d.ke].activeMonitors[monitorId].detector_command = s.createTimeout('detector_command',s.group[d.ke].activeMonitors[monitorId],monitorDetails.detector_command_timeout,10)
            var detector_command = addEventDetailsToString(d,monitorDetails.detector_command)
            if(detector_command === '')return
            exec(detector_command,{detached: true},function(err){
                if(err){
                    s.userLog(d, {type:lang["Event Command Error"],msg:{error:err,cmd:detector_command}})
                    s.debugLog(d.ke, monitorId, detector_command, err)
                }
            })
        }

        moveAssociatedMonitorPtzTargets(groupKey, monitorId)

        for (var i = 0; i < s.onEventTriggerExtensions.length; i++) {
            const extender = s.onEventTriggerExtensions[i]
            await extender(d,filter,eventTime)
        }
    }

    /**
     * Copies a completed event-based recording clip to the file bin directory
     * and inserts a file bin DB entry for it.
     * @param {Object} options
     * @param {string} options.groupKey
     * @param {string} options.monitorId
     * @param {string} options.filename - Destination filename in the file bin
     * @param {string} options.filePath - Source path of the clip to copy
     * @param {Object} [options.details={}] - Additional metadata to store with the file bin entry
     * @returns {Promise<{ok: boolean, fileBinPath?: string, fileBinInsertQuery?: Object, err?: string}>}
     */
    const saveEventBaseRecordingClip = async function({
        groupKey,
        monitorId,
        filename,
        filePath,
        details = {}
    }){
        const response = { ok: true }
        try{
            const fileBinFilePath = s.getFileBinDirectory({ ke: groupKey, mid: monitorId }) + filename;
            const copyResponse = await copyFile(filePath,fileBinFilePath)
            const fileSize = (await fs.stat(fileBinFilePath)).size
            // s.file('delete',filePath)
            const fileBinInsertQuery = {
                ke: groupKey,
                mid: monitorId,
                name: filename,
                size: fileSize,
                details: JSON.stringify(details),
                status: 1,
                time: new Date(),
            }
            await s.insertFileBinEntry(fileBinInsertQuery)
            response.fileBinInsertQuery = fileBinInsertQuery
            response.fileBinPath = fileBinFilePath
        }catch(err){
            response.ok = false;
            console.log(err)
            response.err = err.toString();
        }
        return response;
    }

    /**
     * Waits for a running event-based recording process to exit, then optionally
     * trims the clip to the configured send length and saves it to the file bin.
     * @param {{ke: string, mid: string, fileTime?: string}} options
     * @param {boolean} [getNonCut] - When true, skips trimming and returns the raw recording path
     * @returns {Promise<{ok: boolean, filename?: string, filePath?: string, fileBinPath?: string, fileBinInsertQuery?: Object}>}
     */
    const getEventBasedRecordingUponCompletion = async function(options, getNonCut){
        const response = {ok: true}
        const groupKey = options.ke
        const monitorId = options.mid
        const activeMonitor = s.group[groupKey] && s.group[groupKey].activeMonitors[monitorId]
        if(!activeMonitor || !activeMonitor.eventBasedRecording){
            return response
        }
        const fileTime = options.fileTime || activeMonitor.eventBasedRecordingLastFileTime;
        if(activeMonitor.eventBasedRecording[fileTime] && activeMonitor.eventBasedRecording[fileTime].process){
            const eventBasedRecording = activeMonitor.eventBasedRecording[fileTime]
            const monitorConfig = s.group[groupKey].rawMonitorConfigurations[monitorId]
            const videoLength = parseInt(monitorConfig.details.detector_send_video_length) || 10
            const recordingDirectory = s.getVideoDirectory(monitorConfig)
            const filename = `${fileTime}.mp4`
            response.filename = filename
            response.filePath = `${recordingDirectory}${filename}`
            await new Promise((resolve) => {
                eventBasedRecording.process.once('exit', () => setTimeout(resolve, 1000))
            })
            if(!getNonCut && !isNaN(videoLength)){
                try{
                    const cutResponse = await cutVideoLength({ke: groupKey, mid: monitorId, filePath: response.filePath, cutLength: videoLength})
                    if(cutResponse.ok){
                        const { ok, fileBinPath, fileBinInsertQuery } = await saveEventBaseRecordingClip({
                            groupKey, monitorId, filename: cutResponse.filename, filePath: cutResponse.filePath,
                            details: { source: `${response.filePath}` }
                        })
                        response.filename = cutResponse.filename
                        response.filePath = cutResponse.filePath
                        if(ok){ response.fileBinPath = fileBinPath; response.fileBinInsertQuery = fileBinInsertQuery; }
                    }
                }catch(err){ s.debugLog('getEventBasedRecordingUponCompletion error', err) }
            }
            for(const extender of s.onEventBasedRecordingCompleteExtensions){
                await extender(response, monitorConfig)
            }
        }
        return response
    }

    /**
     * Waits for event-based recordings to complete on multiple monitors concurrently,
     * then resolves with a map or array of the resulting filenames/paths.
     * @param {string} groupKey
     * @param {string[]} monitorIds
     * @param {boolean} [withPath=false] - Include filePath in array-mode results
     * @param {boolean} [asObject=true] - Return a `{monitorId: filename}` map; when false returns an array
     * @param {boolean} [getNonCut] - Pass through to getEventBasedRecordingUponCompletion
     * @returns {Promise<Object.<string,string>|Array<{mid: string, filename: string, filePath?: string}>>}
     */
    const getEventBasedRecordingsUponCompletion = function(groupKey, monitorIds, withPath = false, asObject = true, getNonCut){
        return new Promise((resolve) => {
            const response = asObject ? {} : [];
            const total = monitorIds.length;
            let currentCount = 0;
            monitorIds.forEach((monitorId) => {
                getEventBasedRecordingUponCompletion({
                    ke: groupKey,
                    mid: monitorId
                }, getNonCut).then(({ filename, filePath }) => {
                    if(filename && filePath){
                        if(asObject){
                            response[monitorId] = filename;
                        }else{
                            const foundData = {
                                mid: monitorId,
                                filename,
                            }
                            if(withPath)foundData.filePath = filePath;
                            response.push(foundData)
                        }
                    }
                    ++currentCount;
                    if(currentCount === total){
                        resolve(response)
                    }
                });
            })
        })
    }

    /**
     * Starts an FFmpeg event-based recording for a monitor by reading from its
     * HLS detector stream. Manages process lifecycle: restart on premature exit,
     * watchdog timeout to stop recording, DB insert on completion, and optional
     * auto-compression. Idempotent for a given fileTime when overlap is disabled.
     * @param {EventData} d
     * @param {string} [fileTime] - Formatted timestamp used as the output filename stem; defaults to now
     * @returns {void}
     */
    const createEventBasedRecording = function(d,fileTime){
        if(!fileTime)fileTime = s.formattedTime()
        const logTitleText = lang["Traditional Recording"]
        const groupKey = d.ke
        const monitorId = d.mid || d.id
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const monitorConfig = s.group[groupKey].rawMonitorConfigurations[monitorId]
        const monitorDetails = monitorConfig.details
        const overlappingRecordings = monitorDetails.detector_record_overlap === '1'
        if(monitorDetails.detector !== '1'){
            return
        }
        if(!overlappingRecordings && activeMonitor.eventBasedRecordingLastFileTime)fileTime = activeMonitor.eventBasedRecordingLastFileTime;
        var detector_timeout;
        if(!monitorDetails.detector_timeout||monitorDetails.detector_timeout===''){
            detector_timeout = 10
        }else{
            detector_timeout = parseFloat(monitorDetails.detector_timeout)
        }
        const detectorTimeoutSeconds = detector_timeout * 1000 * 60;
        if(!activeMonitor.eventBasedRecording[fileTime])activeMonitor.eventBasedRecording[fileTime] = { started: new Date(), secondsRan: 0 };
        if((!overlappingRecordings && monitorDetails.watchdog_reset === '1') || !activeMonitor.eventBasedRecording[fileTime].timeout){
            activeMonitor.eventBasedRecording[fileTime].secondsRan = new Date() - activeMonitor.eventBasedRecording[fileTime].started
            if(activeMonitor.eventBasedRecording[fileTime].secondsRan < 15 * 1000 * 60){
                clearTimeout(activeMonitor.eventBasedRecording[fileTime].timeout)
                activeMonitor.eventBasedRecording[fileTime].timeout = setTimeout(function(){
                    activeMonitor.eventBasedRecording[fileTime].allowEnd = true
                    try{
                        activeMonitor.eventBasedRecording[fileTime].process.stdin.setEncoding('utf8')
                        activeMonitor.eventBasedRecording[fileTime].process.stdin.write('q')
                    }catch(err){
                        s.debugLog(err)
                    }
                    activeMonitor.eventBasedRecording[fileTime].process.kill('SIGINT')
                    delete(activeMonitor.eventBasedRecording[fileTime].timeout)
                }, detectorTimeoutSeconds)
            }
        }
        if(!activeMonitor.eventBasedRecording[fileTime].process){
            activeMonitor.eventBasedRecording[fileTime].allowEnd = false;
            activeMonitor.eventBasedRecordingLastFileTime = `${fileTime}`;
            const runRecord = function(){
                var ffmpegError = ''
                var error
                var filename = fileTime + '.mp4'
                let outputMap = `-map 0:0 `
                const analyzeDuration = parseInt(monitorDetails.event_record_aduration) || 1000
                const probeSize = parseInt(monitorDetails.event_record_probesize) || 32
                const audioCodec = monitorDetails.detector_buffer_acodec;
                const noAudio = audioCodec === 'no';
                const autoAudio = !audioCodec || audioCodec === 'auto';
                s.userLog(d,{
                    type: logTitleText,
                    msg: lang["Started"]
                })
                for (var i = 0; i < s.onEventBasedRecordingStartExtensions.length; i++) {
                    const extender = s.onEventBasedRecordingStartExtensions[i]
                    extender(monitorConfig,filename)
                }
                //-t 00:'+s.timeObject(new Date(detector_timeout * 1000 * 60)).format('mm:ss')+'
                if(
                  audioCodec &&
                  audioCodec !== 'no' &&
                  audioCodec !== 'auto' &&
                  audioCodec !== 'aac'
                ){
                    outputMap += `-map 0:1 `
                }
                if(config.noEventBasedRecordingMaps)outputMap = '';
                const secondsBefore = parseInt(monitorDetails.detector_buffer_seconds_before) || 5
                let LiveStartIndex = parseInt(secondsBefore / 2 + 1)
                const ffmpegCommand = `-threads 1 -loglevel warning -live_start_index -${LiveStartIndex} -analyzeduration ${analyzeDuration} -probesize ${probeSize} -re -i "${s.dir.streams+groupKey+'/'+monitorId}/detectorStream.m3u8" ${outputMap}-movflags faststart -fflags +genpts+igndts -c:v copy ${noAudio ? '-an' : autoAudio ? '' : `-c:a aac`} -strict -2 -strftime 1 -y "${s.getVideoDirectory(monitorConfig) + filename}"`
                s.debugLog(ffmpegCommand)
                activeMonitor.eventBasedRecording[fileTime].process = spawn(
                  config.ffmpegDir,
                  splitForFFMPEG(ffmpegCommand)
                )
                activeMonitor.eventBasedRecording[fileTime].process.stdout.on('data',function(data){
                    s.userLog(d,{
                        type: `${logTitleText} : STDOUT`,
                        msg: data.toString()
                    })
                })
                activeMonitor.eventBasedRecording[fileTime].process.stderr.on('data',function(data){
                    s.userLog(d,{
                        type: `${logTitleText} : STDERR`,
                        msg: data.toString()
                    })
                })
                activeMonitor.eventBasedRecording[fileTime].process.on('close',function(){
                    if(!activeMonitor.eventBasedRecording[fileTime].allowEnd){
                        s.userLog(d,{
                            type: `${logTitleText} : ${lang["Detector Recording Process Exited Prematurely. Restarting."]}`,
                            msg: ffmpegCommand
                        })
                        runRecord()
                        return
                    }
                    const secondBefore = (parseInt(monitorDetails.detector_buffer_seconds_before) || 5) + 1
                    s.insertCompletedVideo(monitorConfig,{
                        file : filename,
                        objects: overlappingRecordings && d.details && d.details.matrices instanceof Array ? d.details.matrices : undefined,
                        endTime: moment(new Date()).subtract(secondBefore,'seconds')._d,
                    },function(err,response){
                        const autoCompressionEnabled = !config.disableAutoCompressVideos && monitorDetails.auto_compress_videos === '1';
                        if(autoCompressionEnabled){
                            reEncodeVideoAndBinOriginalAddToQueue({
                                video: response.insertQuery,
                                targetExtension: 'webm',
                                doSlowly: false,
                                automated: true,
                            }).then((encodeResponse) => {
                                s.debugLog('Complete Automatic Compression',encodeResponse)
                            }).catch((err) => {
                                console.log(err)
                            })
                        }
                    });
                    s.userLog(d,{
                        type: logTitleText,
                        msg: lang["Detector Recording Complete"]
                    });
                    s.userLog(d,{
                        type: logTitleText,
                        msg: lang["Clear Recorder Process"]
                    });
                    const proc = activeMonitor.eventBasedRecording[fileTime].process
                    proc.removeAllListeners()
                    if(!overlappingRecordings)delete(activeMonitor.eventBasedRecordingLastFileTime)
                    clearTimeout(activeMonitor.eventBasedRecording[fileTime].timeout)
                    clearTimeout(activeMonitor.recordingChecker)
                    delete(activeMonitor.eventBasedRecording[fileTime])
                })
            }
            runRecord()
        }
    }

    /**
     * Terminates all active event-based recording processes for a monitor
     * by sending SIGTERM and marking them as allowed to end cleanly.
     * @param {{ke: string, id: string}} e - Object containing the group key and monitor ID
     * @returns {void}
     */
    const closeEventBasedRecording = function(e){
        const activeMonitor = s.group[e.ke].activeMonitors[e.id]
        const eventBasedRecordings = activeMonitor.eventBasedRecording;
        for(const fileTime in eventBasedRecordings){
            if(eventBasedRecordings[fileTime].process){
                clearTimeout(eventBasedRecordings[fileTime].timeout)
                eventBasedRecordings[fileTime].allowEnd = true
                eventBasedRecordings[fileTime].process.kill('SIGTERM')
            }
        }
        // var stackedProcesses = s.group[e.ke].activeMonitors[e.id].eventBasedRecording.stackable
        // Object.keys(stackedProcesses).forEach(function(key){
        //     var item = stackedProcesses[key]
        //     clearTimeout(item.timeout)
        //     item.allowEnd = true;
        //     item.process.kill('SIGTERM');
        // })
    }

    /**
     * Handles legacy (pre-filter) event actions: archiving or deleting a list of
     * videos, or executing a shell command. Also calls any registered before-filter extenders.
     * @param {'archive'|'delete'|'execute'} x - Action type
     * @param {{videos?: Object[], execute?: string}} d - Action payload
     * @returns {void}
     */
    const legacyFilterEvents = (x,d) => {
        switch(x){
            case'archive':
                d.videos.forEach(function(v,n){
                    s.video('archive',v)
                })
                break;
            case'delete':
                s.deleteListOfVideos(d.videos)
                break;
            case'execute':
                exec(d.execute,{detached: true})
                break;
        }
        s.onEventTriggerBeforeFilterExtensions.forEach(function(extender){
            extender(x,d)
        })
    }

    /**
     * Starts (or extends) a window during which frames from the monitor's secondary
     * detector output stream are forwarded to the configured detector plugin(s).
     * Used to feed object-detection frames after a motion event fires.
     * @param {string} groupKey
     * @param {string} monitorId
     * @param {number} [timeout=5000] - Duration in ms to keep forwarding frames
     * @returns {void}
     */
    const sendFramesFromSecondaryOutput = (groupKey,monitorId,timeout) => {
        const activeMonitor = s.group[groupKey].activeMonitors[monitorId]
        const theEmitter = activeMonitor.secondaryDetectorOutput
        if(!activeMonitor.sendingFromSecondaryDetectorOuput){
            const monitorConfig = s.group[groupKey].rawMonitorConfigurations[monitorId]
            const monitorDetails = monitorConfig.details;
            let chosenDetector = monitorDetails.detectors_selected;
            if(chosenDetector instanceof Array)chosenDetector = chosenDetector.join(',');
            let sendToDetector = (data) => {
                s.ocvTx({
                    f : 'frame',
                    mon : monitorDetails,
                    ke : groupKey,
                    id : monitorId,
                    time : s.formattedTime(),
                    frame : data
                })
            }
            if(chosenDetector && !(chosenDetector.includes('all'))){
                const pluginsGettingIt = chosenDetector.split(',').map(item => item.trim()).filter(item => !!item);
                sendToDetector = (data) => {
                    for(const pluginName of pluginsGettingIt){
                        s.sendToDetector(pluginName, {
                            f : 'frame',
                            mon : monitorDetails,
                            ke : groupKey,
                            id : monitorId,
                            time : s.formattedTime(),
                            frame : data
                        })
                    }
                }
            }
            s.debugLog('start sending object frames',groupKey,monitorId)
            theEmitter.on('data', activeMonitor.secondaryDetectorOuputContentWriter = sendToDetector)
        }
        clearTimeout(activeMonitor.sendingFromSecondaryDetectorOuput)
        activeMonitor.sendingFromSecondaryDetectorOuput = setTimeout(() => {
            theEmitter.removeListener('data',activeMonitor.secondaryDetectorOuputContentWriter)
            delete(activeMonitor.sendingFromSecondaryDetectorOuput)
        },timeout || 5000)
    }

    /**
     * Main entry point for detector events. Validates the monitor exists, runs
     * event filters, applies region/motion-tracking constraints to detection matrices,
     * decides whether to forward frames for secondary object detection, executes all
     * configured event actions via runEventExecutions, and notifies connected clients.
     * @param {EventData} d - Incoming detector event (mutated: doObjectDetection, details.matrices)
     * @param {boolean} [forceSave] - Force DB save regardless of filter configuration
     * @returns {Promise<void>}
     */
    const triggerEvent = async (d,forceSave) => {
        var didCountingAlready = false
        const groupKey = d.ke
        const monitorId = d.mid || d.id
        const filter = {
            halt : false,
            addToMotionCounter : true,
            useLock : true,
            save : false,
            webhook : false,
            command : false,
            record : true,
            forceRecord : false,
            indifference : false,
            countObjects : false
        }
        if(!s.group[d.ke] || !s.group[d.ke].activeMonitors[d.id]){
            return s.systemLog(lang['No Monitor Found, Ignoring Request'])
        }
        const monitorConfig = s.group[d.ke].rawMonitorConfigurations[d.id]
        if(!monitorConfig){
            return s.systemLog(lang['No Monitor Found, Ignoring Request'])
        }
        const activeMonitor = s.group[d.ke].activeMonitors[d.id]
        const monitorDetails = monitorConfig.details
        s.onEventTriggerBeforeFilterExtensions.forEach(function(extender){
            extender(d,filter)
        })
        const passedEventFilters = checkEventFilters(d,activeMonitor.details,filter)
        if(!passedEventFilters)return;
        const eventTime = new Date()
        if(
          filter.addToMotionCounter &&
          filter.record &&
          (
            monitorConfig.mode === 'record' ||
            monitorConfig.mode === 'start' &&
            (
              (
                monitorDetails.detector_record_method === 'sip' &&
                monitorDetails.detector_trigger === '1'
              ) ||
              (
                monitorDetails.detector_record_method === 'del' &&
                monitorDetails.detector_delete_motionless_videos === '1'
              )
            )
          )
        ){
            addToEventCounter(d)
        }
        const eventDetails = d.details
        if(
          (filter.countObjects || monitorDetails.detector_obj_count === '1') &&
          monitorDetails.detector_obj_count_in_region !== '1'
        ){
            didCountingAlready = true
            countObjects(d)
        }
        if(filter.useLock){
            const passedMotionLock = checkMotionLock(d,monitorDetails)
            if(!passedMotionLock)return
        }
        const thisHasMatrices = hasMatrices(eventDetails)
        if(thisHasMatrices){
            if(monitorDetails.detector_obj_region === '1'){
                var regions = s.group[monitorConfig.ke].activeMonitors[monitorConfig.mid].parsedObjects.cordsForObjectDetection
                var matricesInRegions = isAtleastOneMatrixInRegion(regions,eventDetails.matrices)
                eventDetails.matrices = matricesInRegions
                if(matricesInRegions.length === 0)return;
                if(filter.countObjects && monitorDetails.detector_obj_count === '1' && monitorDetails.detector_obj_count_in_region === '1' && !didCountingAlready){
                    countObjects(d)
                }
            }
            if(monitorDetails.detector_object_ignore_not_move === '1'){
                const trackerId = `${groupKey}${monitorId}`
                trackObjectWithTimeout(trackerId,eventDetails.matrices)
                const trackedObjects = getTracked(trackerId)
                const objectsThatMoved = getAllMatricesThatMoved(monitorConfig,trackedObjects)
                setLastTracked(trackerId, trackedObjects)
                if(objectsThatMoved.length === 0)return;
                eventDetails.matrices = objectsThatMoved
            }else if(activeMonitor.lineCounter){
                const trackerId = `${groupKey}${monitorId}`
                trackObjectWithTimeout(trackerId,eventDetails.matrices)
                const trackedObjects = getTracked(trackerId)
                setLastTracked(trackerId, trackedObjects)
                eventDetails.matrices = trackedObjects
            }
        }
        //
        d.doObjectDetection = (
          eventDetails.reason !== 'object' &&
          s.isAtleatOneDetectorPluginConnected &&
          monitorDetails.detector_use_detect_object === '1' &&
          monitorDetails.detector_use_motion === '1'
        );
        if(d.doObjectDetection === true){
            sendFramesFromSecondaryOutput(d.ke,d.id)
        }
        //
        if(
          monitorDetails.detector_use_motion === '0' ||
          d.doObjectDetection !== true
        ){
            runEventExecutions(eventTime,monitorConfig,eventDetails,forceSave,filter,d, triggerEvent)
        }
        //show client machines the event
        s.tx({
            f: 'detector_trigger',
            id: d.id,
            ke: d.ke,
            time: eventTime,
            details: eventDetails,
            doObjectDetection: d.doObjectDetection
        },`DETECTOR_${monitorConfig.ke}${monitorConfig.mid}`);
    }

    /**
     * Scales region polygon points from one canvas resolution to another.
     * Returns a new array of cloned region objects; the originals are not mutated.
     * @param {Region[]} regions
     * @param {{fromWidth: number, fromHeight: number, toWidth: number, toHeight: number}} options
     * @returns {Region[]}
     */
    function convertRegionPointsToNewDimensions(regions, options) {
        const { fromWidth, fromHeight, toWidth, toHeight } = options;

        // Compute the conversion factors for x and y coordinates
        const xFactor = toWidth / fromWidth;
        const yFactor = toHeight / fromHeight;

        // Clone the regions array and update the points for each region
        const newRegions = regions.map(region => {
            const { points } = region;

            // Clone the points array and update the coordinates
            const newPoints = points.map(([x, y]) => {
                const newX = Math.round(x * xFactor);
                const newY = Math.round(y * yFactor);
                return [newX.toString(), newY.toString()];
            });

            // Clone the region object and update the points
            return { ...region, points: newPoints };
        });

        return newRegions;
    }

    /**
     * Prepends a Unicode glyph icon to a tag label using the glyphs definition map.
     * Falls back to the default glyph when the tag has no specific icon.
     * @param {string} tag - Detected object label
     * @returns {string} Icon + space + tag (e.g. '🧍 person')
     */
    function getTagWithIcon(tag){
        var icon = glyphs[tag.toLowerCase()] || glyphs._default
        return `${icon} ${tag}`;
    }

    /**
     * Returns a deduplicated list of icon-prefixed tag strings derived from the
     * event's detection matrices. Falls back to the event reason when no matrices
     * are present, or to the motion label for raw motion events.
     * @param {EventData} d
     * @returns {string[]} e.g. ['🧍 person', '🚗 car']
     */
    function getObjectTagsFromMatrices(d){
        if(d.details.reason === 'motion'){
            return [getTagWithIcon(lang.Motion)]
        }else if(d.details.matrices){
            const matrices = d.details.matrices
            return [...new Set(matrices.map(matrix => getTagWithIcon(matrix.tag)))];
        }
        return [getTagWithIcon(d.details.reason)]
    }

    /**
     * Builds a human-readable notification string summarising what was detected
     * and on which monitor, e.g. "🧍 person, 🚗 car detected in Front Door".
     * @param {EventData} d
     * @returns {string}
     */
    function getObjectTagNotifyText(d){
        const monitorId = d.mid || d.id
        const monitorName = s.group[d.ke].rawMonitorConfigurations[monitorId].name
        const tags = getObjectTagsFromMatrices(d)
        return `${tags.join(', ')} ${lang.detected} in ${monitorName}`
    }

    /**
     * Returns the map of target monitor IDs → ONVIF preset tokens that should be
     * triggered when this monitor fires a detector event, or an empty object when
     * the detectorEventPtz feature is disabled.
     * @param {string} groupKey
     * @param {string} monitorId
     * @returns {Object.<string, string>} Map of monitorId → preset token
     */
    function getAssociatedMonitorPtzTargets(groupKey, monitorId){
        const monitorDetails = s.group[groupKey].rawMonitorConfigurations[monitorId].details;
        const detectorEventPtz = monitorDetails.detectorEventPtz === '1';
        if(detectorEventPtz){
            const triggerMonitorsPtzTargets = monitorDetails.triggerMonitorsPtzTargets || {}
            return triggerMonitorsPtzTargets;
        }else{
            return {}
        }
    }

    /**
     * Moves all ONVIF-enabled monitors associated with the triggering monitor
     * to their configured preset positions, then schedules a return-to-home timeout.
     * @param {string} groupKey
     * @param {string} monitorId
     * @returns {Promise<{ok: boolean, responseFromDevices: Object.<string, *>}>}
     */
    async function moveAssociatedMonitorPtzTargets(groupKey, monitorId){
        const response = { ok: true, responseFromDevices: {} };
        const triggerMonitorsPtzTargets = getAssociatedMonitorPtzTargets(groupKey, monitorId);
        for(const targetMonitorId in triggerMonitorsPtzTargets){
            const presetToken = triggerMonitorsPtzTargets[targetMonitorId]
            const onvifEnabled = s.group[groupKey].rawMonitorConfigurations[targetMonitorId].details.is_onvif === '1';
            if(onvifEnabled){
                var onvifDevice = await getOnvifDevice(groupKey, targetMonitorId);
                response.responseFromDevices[targetMonitorId] = await goToPreset(onvifDevice, presetToken);
                moveToHomePositionTimeout({ id: targetMonitorId, ke: groupKey }, 30000)
            }
        }
        return response
    }
    return {
        getAssociatedMonitorPtzTargets,
        moveAssociatedMonitorPtzTargets,
        getObjectTagNotifyText,
        getObjectTagsFromMatrices,
        countObjects: countObjects,
        isAtleastOneMatrixInRegion,
        convertRegionPointsToNewDimensions,
        getLargestMatrix: getLargestMatrix,
        addToEventCounter: addToEventCounter,
        clearEventCounter: clearEventCounter,
        getEventsCounted: getEventsCounted,
        hasMatrices: hasMatrices,
        checkEventFilters: checkEventFilters,
        checkMotionLock: checkMotionLock,
        bindTagLegendForMonitors,
        runMultiEventBasedRecord,
        runEventExecutions: runEventExecutions,
        createEventBasedRecording: createEventBasedRecording,
        closeEventBasedRecording: closeEventBasedRecording,
        legacyFilterEvents: legacyFilterEvents,
        triggerEvent: triggerEvent,
        addEventDetailsToString: addEventDetailsToString,
        getEventBasedRecordingUponCompletion: getEventBasedRecordingUponCompletion,
        getEventBasedRecordingsUponCompletion,
    }
}
