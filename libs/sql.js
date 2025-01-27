const fs = require('fs');
const configs = [
    require('./config/database/sqlite.js'),
    require('./config/database/sqlite3.js'),
    require('./config/database/mysql2.js'),
]

module.exports = function(s,config){
    //sql/database connection with knex
    s.databaseOptions = {
      client: config.databaseType,
      connection: config.db,
    }

    configs.forEach(config => {
        if(config.shouldApply(s.databaseOptions)) {
            config?.apply(s.databaseOptions)
            config?.install(s.databaseOptions)
        }
    })

    const {
        knexQuery,
        knexQueryPromise,
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
