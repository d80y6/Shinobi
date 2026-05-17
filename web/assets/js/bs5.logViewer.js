$(document).ready(function(e){
    var theWindow = $('#tab-logViewer')
    var logTypeSelector = $('#log_monitors')
    var dateSelector = $('#logs_daterange')
    var savedLogRows = $('#saved-logs-rows')
    var theForm = theWindow.find('form')
    var logViewerDataInMemory = {}
    //log viewer
    loadDateRangePicker(dateSelector,{
        onChange: function(start, end, label) {
            drawLogRows()
        }
    })
    addOnTabOpen('logViewer',function(){
        logTypeSelector.find('optgroup option').remove()
        var html = ''
        $.each(loadedMonitors,function(n,v){
            html += createOptionHtml({
                value: v.mid,
                label: v.name,
            })
        })
        logTypeSelector.find('optgroup').html(html)
        drawLogRows()
    })
    function drawLogRows(){
        var html = ''
        var selectedLogType = logTypeSelector.val()
        selectedLogType = selectedLogType === 'all' ? '' : selectedLogType
        var dateRange = getSelectedTime(dateSelector)
        var apiEndpoint = getApiPrefix(`logs`) + '/' + selectedLogType + '?start=' + formattedTimeForFilename(dateRange.startDate) + '&end=' + formattedTimeForFilename(dateRange.endDate)
        $.getJSON(apiEndpoint,function(rows){
            logViewerDataInMemory = {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                url: apiEndpoint,
                query: selectedLogType,
                rows: rows,
            }
            if(rows.length === 0){
                html = '<tr class="text-center"><td>'+lang.NoLogsFoundForDateRange+'</td></tr>'
            }else{
                $.each(rows,function(n,v){
                    html += buildLogRow(v)
                })
            }
            savedLogRows.html(html)
        })
    }
    logTypeSelector.change(drawLogRows)
    theForm.submit(function(e){
        e.preventDefault()
        drawLogRows()
        return false
    })
    theWindow.find('[download]').click(function(e){
        e.preventDefault()
        if(!logViewerDataInMemory.rows){
            console.log('No Logs Found for Download')
            return
        }
        downloadJSON(logViewerDataInMemory,'DAM VMS_Logs_'+(new Date())+'.json')
        return false;
    })
})
