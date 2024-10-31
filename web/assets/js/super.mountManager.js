$(document).ready(function(){
    const loadedMounts = {}
    const theEnclosure = $('#superMountManager')
    const theSearch = $('#mountManagerListSearch')
    const theTable = $('#mountManagerListTable')
    const newMountForm = $('#mountManagerNewMount')
    function getMountId(theMount){
        return `${theMount.mountPoint.split('/').join('_')}`
    }
    function drawMountsTable(data){
        var html = ''
        $.each(data,function(n,theMount){
            html += `
            <tr row-mounted="${getMountId(theMount)}">
                <td class="align-middle">
                    <a class="btn btn-info btn-sm cursor-pointer delete" title="${lang.Delete}"><i class="fa fa-trash-o"></i></a>
                </td>
                <td class="align-middle">
                    <div>${theMount.device}</div>
                    <div><small>${theMount.mountPoint}</small></div>
                </td>
                <td class="align-middle">
                    ${theMount.type}
                </td>
                <td class="align-middle">
                    ${theMount.options}
                </td>
            </tr>`
        })
        downloadListElement.html(html)
    }
    function filterMountsTable(theSearch = '') {
        var searchQuery = theSearch.trim().toLowerCase();
        if(searchQuery === ''){
            theTable.find(`[row-mounted]`).show()
            return;
        }
        var rows = Object.values(loadedMounts);
        var filtered = []
        rows.forEach((row) => {
            var searchInString = JSON.stringify(row).toLowerCase();
            var theElement = theTable.find(`[row-mounted="${getMountId(row)}"]`)
            if(searchInString.indexOf(searchQuery) > -1){
                theElement.show()
            }else{
                theElement.hide()
            }
        })
        return filtered
    }
    function loadMounts(callback) {
        return new Promise((resolve,reject) => {
            $.getJSON(superApiPrefix + $user.sessionKey + '/mountManager/list',function(data){
                $.each(data,function(n,theMount){
                    loadedMounts[getMountId(theMount)] = theMount;
                })
                drawMountsTable(data)
                resolve(data)
            })
        })
    }
    function addMount(form) {
        return new Promise((resolve,reject) => {
            // const { sourceTarget, localPath, mountType, options } = form;
            $.post(superApiPrefix + $user.sessionKey + '/mountManager/mount', form,function(data){
                resolve(data)
            })
        })
    }
    function removeMount(localPath) {
        return new Promise((resolve,reject) => {
            $.post(superApiPrefix + $user.sessionKey + '/mountManager/removeMount',{
                localPath
            },function(data){
                resolve(data)
            })
        })
    }
    newMountForm.submit(async function(e){
        e.preventDefault();
        const form = newMountForm.serializeObject();
        const response = await addMount(form);
        const notify = {
            title: lang['Mount Added'],
            type: 'success'
        }
        if(!response.ok){
            notify.title = lang['Failed to Add Mount']
            notify.text = response.error
            notify.type = 'danger'
        }
        new PNotify(notify)
        return false;
    });
    theTable.on('click','.delete', async function(e){
        const el = $(this).parents('[row-mounted]')
        const mountId = el.attr('row-mounted');
        const theMount = loadedMounts[mountId]
        const localPath = theMount.mountPoint
        const response = await removeMount(localPath);
        if(response.ok){
            el.remove()
        }else{
            new PNotify({
                title: lang['Failed to Remove Mount'],
                text: lang['See System Logs'],
                type: 'danger'
            })
        }
    })
    loadMounts()
})
