const {isClient} = require('../utils')

module.exports = {

    shouldApply: isClient('mysql2'),

    apply: function (databaseOptions) {
        databaseOptions.pool = { min: 0, max: 2 }
    },

}