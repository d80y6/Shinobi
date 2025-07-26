# Adding a Permission to Core
#### Permissions, Sub-Accounts and API Keys

## Edit these files
- languages/en_CA.json (Edit other language files too or English will be used)
- definitions/apiKeys.js
- libs/user/apiKeys.js
- definitions/permissionSets.js
- definitions/subAccountManager.js
- libs/monitor.js
- web/assets/js/bs5.dashboard-base.js

*For Central :*

- pageLayouts/apiKeys.js
- pageLayouts/permissionSets.js
- pageLayouts/subAccountManager.js


## Examples of what to add
#### Account level (Not Monitor specific)

> Assuming default is off.

- languages/en_CA.json

```
"Can Hear Audio": "Can Hear Audio",
```

- definitions/apiKeys.js
- pageLayouts/apiKeys.js (Central)

```
{
    name: lang['Can Hear Audio'],
    value: 'hear_audio',
},
```

- libs/user/apiKeys.js

```
{ name: lang['Can Hear Audio'], value: 'hear_audio' },
```

- definitions/permissionSets.js
- pageLayouts/permissionSets.js

```
{
   "name": "detail=hear_audio",
   "field": lang['Can Hear Audio'],
   "default": "1",
   "fieldType": "select",
   "possible": yesNoPossibility
},
```

- definitions/subAccountManager.js
- pageLayouts/subAccountManager.js

```
{
   "name": "detail=hear_audio",
   "field": lang['Can Hear Audio'],
   "default": "1",
   "fieldType": "select",
   "possible": yesNoPossibility
},
```

- libs/monitor.js

In `s.checkPermission` edit `response.apiKeyPermissions` and `response.userPermissions`

```
'hear_audio',
```

- web/assets/js/bs5.dashboard-base.js

In `checkPermissionForUser` edit `response.userPermissions`

```
'hear_audio',
```

- An example of using it in a Web Endpoint (Core only)

```
const {
    isRestricted,
    isRestrictedApiKey,
    apiKeyPermissions,
    userPermissions,
} = s.checkPermission(user)
if(
    isRestricted && userPermissions.hear_audio_disallowed ||
    isRestrictedApiKey && apiKeyPermissions.hear_audio_disallowed
){
    s.closeJsonResponse(res,{ ok: false, msg: lang['Not Authorized'] });
    return
}
```
