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
    loadMounts()
})
