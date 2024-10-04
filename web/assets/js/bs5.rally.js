$(document).ready(function(e){
    //api window
    var foundMonitors = {}
    var theWindow = $('#tab-rally')
    var theWindowForm = $('#rallyForm')
    var tableEl = $('#rallyCameras')
    function getMonitors(connectionInfo, asis){
        return new Promise((resolve) => {
            $.post(`${getApiPrefix('rally')}/getMonitors`,{
                connectionInfo,
                asis: '1'
            },function(data){
                resolve(data)
            })
        })
    }
    function saveMonitor(monitor){
        return new Promise((resolve) => {
            $.post(`${getApiPrefix('configureMonitor')}/${monitor.mid}`,{
                data: JSON.stringify(monitor)
            },function(data){
                resolve(data)
            })
        })
    }
    async function saveMonitors(monitors){
        for(monitor of monitors){
            await saveMonitor(monitor)
        }
    }
    function drawTable(monitors){
        var html = ''
        foundMonitors = {}
        for(monitor of monitors){
            var monitorKey = `${monitor.ke}${monitor.mid}`
            foundMonitors[monitorKey] = monitor;
            html += `
            <tr monitor="${monitorKey}">
                <td>${monitor.name}</td>
                <td>${monitor.mid}</td>
                <td>${monitor.host}</td>
                <td><a class="add-monitor btn btn-sm btn-success" href="#">${lang.Add}</a></td>
            </tr>`
        }
        tableEl.html(html);
    }
    theWindowForm.submit(async function(e){
        e.preventDefault();
        const connectionInfo = theWindowForm.serializeObject()
        const monitors = await getMonitors(connectionInfo)
        drawTable(monitors)
        return false;
    })
    theWindow.on('click','.add-monitor',function(e){
        e.preventDefault();
        var el = $(this).parents('[monitor]')
        var monitorKey = el.attr('monitor')
        var monitor = foundMonitors[monitorKey]
        saveMonitor(monitor)
    })
    theWindow.on('click','.add-all',function(e){
        var monitors = Object.values(foundMonitors)
        saveMonitors(monitors)
    })
    // addOnTabOpen('rally', function () {
    // })
    // addOnTabReopen('rally', function () {
    // })
})
