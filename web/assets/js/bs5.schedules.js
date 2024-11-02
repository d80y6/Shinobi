$(document).ready(function(){
    var loadedMonitorStates = {}
    var loadedSchedules = {}
    var schedulerWindow = $('#tab-schedules')
    var scheduleSelector = $('#schedulesSelector')
    var schedulerForm = schedulerWindow.find('form')
    var selectedStates = schedulerWindow.find('[name="monitorStates"]')
    var selectedDays = schedulerWindow.find('[name="days"]')
    var startTimeField = schedulerWindow.find('[name="start"]')
    var endTimeField = schedulerWindow.find('[name="end"]')
    function checkForScheduleConflict(aSchedule, bSchedule) {
        const conflictedDays = [];
        function timeToMinutes(time) {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        }
        aSchedule.details.days.forEach(day => {
            if (bSchedule.details.days.includes(day)) {
                const aStart = timeToMinutes(aSchedule.start);
                const aEnd = timeToMinutes(aSchedule.end);
                const bStart = timeToMinutes(bSchedule.start);
                const bEnd = timeToMinutes(bSchedule.end);
                if ((aStart < bEnd && aEnd > bStart) || (bStart < aEnd && bEnd > aStart)) {
                    conflictedDays.push({
                        day: day,
                        aScheduleTime: `${aSchedule.start} - ${aSchedule.end}`,
                        bScheduleTime: `${bSchedule.start} - ${bSchedule.end}`
                    });
                }
            }
        });
        return conflictedDays;
    }
    function findScheduleConflict(aSchedule){
        const conflictedWith = []
        for(name in loadedSchedules){
            var bSchedule = loadedSchedules[name];
            if(aSchedule.name !== bSchedule.name){
                var conflicts = checkForScheduleConflict(aSchedule, bSchedule)
                if(conflicts.length > 0)conflictedWith.push({ name, conflicts })
            }
        }
        return {
            ok: conflictedWith.length === 0,
            conflicts: conflictedWith
        }
    }
    var loadSchedules = function(callback){
        $.getJSON(getApiPrefix() + '/schedule/' + $user.ke,function(d){
            var html = ''
            $.each(d.schedules,function(n,v){
                loadedSchedules[v.name] = v
                html += createOptionHtml({
                    value: v.name,
                    label: v.name
                })
            })
            scheduleSelector.find('optgroup').html(html)
            if(callback)callback()
        })
    }
    var loadMonitorStates = function(){
        $.getJSON(getApiPrefix() + '/monitorStates/' + $user.ke,function(d){
            var html = ''
            $.each(d.presets,function(n,v){
                loadedMonitorStates[v.name] = v
                html += createOptionHtml({
                    value: v.name,
                    label: v.name
                })
            })
            selectedStates.html(html)
        })
    }
    function getScheduleForm(){
        var form = schedulerForm.serializeObject()
        var monitors = []
        var failedToParseAJson = false
        if(form.name === ''){
            return new PNotify({title:lang['Invalid Data'],text:lang['Name cannot be empty.'],type:'error'})
        }
        if(form.start === ''){
            return new PNotify({title:lang['Invalid Data'],text:lang['Start Time cannot be empty.'],type:'error'})
        }
        if(form.monitorStates instanceof Array === false){
            form.monitorStates = [form.monitorStates]
        }
        if(!form.days || form.days === ''){
            form.days = null
        }else if(form.days instanceof Array === false){
            form.days = [form.days]
        }
        const data = {
            name: form.name,
            start: form.start,
            end: form.end,
            enabled: form.enabled,
            details: {
                monitorStates: form.monitorStates,
                days: form.days,
                timezone: form.timezone,
            }
        }
        return data
    }
    addOnTabOpen('schedules',function(loadedTab){
        loadMonitorStates()
        loadSchedules()
    })
    addOnTabReopen('schedules',function(loadedTab){
        loadMonitorStates()
        loadSchedules()
    })
    schedulerWindow.on('click','.delete',function(e){
        $.confirm.create({
            title: lang['Delete Schedule'],
            body: lang.deleteScheduleText,
            clickOptions: {
                title: 'Delete',
                class: 'btn-danger'
            },
            clickCallback: function(){
                var form = schedulerForm.serializeObject()
                $.post(getApiPrefix() + '/schedule/' + $user.ke + '/' + form.name + '/delete',function(d){
                    console.log(d)
                    if(d.ok === true){
                        delete(loadedSchedules[form.name])
                        loadSchedules()
                        new PNotify({title:lang.Success,text:d.msg,type:'success'})
                    }
                })
            }
        })
    })
    scheduleSelector.change(function(e){
        var selected = $(this).val()
        var loaded = loadedSchedules[selected]
        var namespace = schedulerWindow.find('[name="name"]')
        var deleteButton = schedulerWindow.find('.delete')
        var tzEl = schedulerWindow.find('[name="timezone"]')
        var startField = schedulerWindow.find('[name="start"]')
        var endField = schedulerWindow.find('[name="end"]')
        selectedStates.find('option').prop('selected',false)
        selectedDays.find('option').prop('selected',false)
        if(loaded){
            namespace.val(loaded.name)
            var html = ''
            $.each(loaded,function(n,v){
                schedulerForm.find('[name="' + n + '"]').val(v)
            })
            $.each(loaded.details.monitorStates,function(n,v){
                selectedStates.find('option[value="' + v + '"]').prop('selected',true)
            })
            $.each(loaded.details.days,function(n,v){
                selectedDays.find('option[value="' + v + '"]').prop('selected',true)
            })
            tzEl.val(loaded.details.timezone || '0')
            deleteButton.show()
        }else{
            tzEl.val('0')
            namespace.val('')
            startField.val('')
            endField.val('')
            deleteButton.hide()
        }
    })
    schedulerForm.submit(function(e){
        e.preventDefault()
        var el = $(this)
        var data = getScheduleForm()
        const { ok: isNotConflicted, conflicts } = findScheduleConflict(data);
        if(isNotConflicted){
            $.post(getApiPrefix() + '/schedule/' + $user.ke + '/' + data.name + '/insert',{data:data},function(d){
                debugLog(d)
                if(d.ok === true){
                    loadSchedules(function(){
                        scheduleSelector.val(data.name)//.change();
                    })
                    new PNotify({title:lang.Success,text:d.msg,type:'success'})
                }
            })
        }else{
            new PNotify({
                title: lang['Conflicting Schedules'],
                text: `${lang.conflictingSchedulesText} <br><br> ${lang.conflictingSchedulesTextExample}`,
                type: 'danger'
            });
        }
        return false;
    })
    startTimeField.change(function(){
        var data = getScheduleForm()
        const { ok: isNotConflicted, conflicts } = findScheduleConflict(data);
        if(!isNotConflicted){
            new PNotify({
                title: lang['Conflicting Schedules'],
                text: `${lang.conflictingSchedulesText} <br><br> ${lang.conflictingSchedulesTextExample} <br><br> ${lang['Conflicted With']}`,
                type: 'danger',
                sticky: true,
            });
        }
    })
})
