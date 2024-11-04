var fs = require('fs');
module.exports = function(s,config){
    //sql/database connection with knex
    s.databaseOptions = {
      client: config.databaseType,
      connection: config.db,
      pool: { min: 0, max: 10, propagateCreateError: true }
    }
    if(s.databaseOptions.client.indexOf('sqlite')>-1){
        s.databaseOptions.client = 'sqlite3'
        s.databaseOptions.useNullAsDefault = true
        try{
            require('sqlite3')
        }catch(err){
            console.log('Installing SQlite3 Module...')
            require('child_process').execSync('npm install sqlite3 --unsafe-perm')
        }
    }
    if(s.databaseOptions.client === 'sqlite3' && s.databaseOptions.connection.filename === undefined){
        s.databaseOptions.connection.filename = s.mainDirectory+"/shinobi.sqlite"
    }
    const {
        knexQuery,
        knexQueryPromise,
        knexError,
        cleanSqlWhereObject,
        processSimpleWhereCondition,
        processWhereCondition,
        mergeQueryValues,
        getDatabaseRows,
        sqlQuery,
        connectDatabase,
        sqlQueryBetweenTimesWithPermissions,
    } = require('./database/utils.js')(s,config)
    s.onBeforeDatabaseLoadExtensions.forEach(function(extender){
        extender(config)
    })
    s.knexQuery = knexQuery
    s.knexQueryPromise = knexQueryPromise
    s.getDatabaseRows = getDatabaseRows
    s.sqlQuery = sqlQuery
    s.connectDatabase = connectDatabase
    s.sqlQueryBetweenTimesWithPermissions = sqlQueryBetweenTimesWithPermissions
    require('./database/preQueries.js')(s,config)
}
