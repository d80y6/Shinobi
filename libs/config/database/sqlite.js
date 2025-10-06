var {isClient, defaultConfig, npmCheckAndInstall} = require('../utils')

module.exports = {

    shouldApply: isClient('sqlite'),

    apply: function (databaseOptions) {
        databaseOptions.client = 'sqlite3'
        databaseOptions.useNullAsDefault = true
    },

    install: npmCheckAndInstall('sqlite3')
}