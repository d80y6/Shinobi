module.exports = {
    "env": {
        "node": true,
        "es2021": true,
        "jquery": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
        "no-unused-vars": "warn",
        "no-undef": "warn",
        "no-constant-condition": "warn"
    }
};
