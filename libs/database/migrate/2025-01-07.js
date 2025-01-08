module.exports = async function(s,config){
    s.debugLog('Updating database to 2023-03-11')
    const {
        currentTimestamp,
        createTable,
        isMySQL,
    } = require('../utils.js')(s,config)
    await createTable('Pipelines',[
        isMySQL ? {name: 'utf8', type: 'charset'} : null,
        isMySQL ? {name: 'utf8_general_ci', type: 'collate'} : null,
        {name: 'ke', length: 50, type: 'string'},
        {name: 'name', length: 50, type: 'string'},
        {name: 'conditions', type: 'text'},
        {name: 'actions', type: 'text'},
        {name: 'created', type: 'timestamp', defaultTo: currentTimestamp()},
        {name: 'updated', type: 'timestamp'},
    ]);
}
