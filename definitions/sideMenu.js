module.exports = function(s,config,lang,Theme,mainBackgroundColor,textWhiteOnBgDark){
    return {
        "section": "SideMenu",
        showMonitors: true,
        "blocks": {
            "Container1": {
               // "id": "sidebarMenu",
               "class": `col-md-3 col-lg-2 d-md-block ${mainBackgroundColor} sidebar collapse`,
               "links": [
                   {
                       icon: 'home',
                       label: lang.Home,
                       pageOpen: 'initial',
                   },
                   {
                       icon: 'th',
                       label: lang['Live Grid'] + ` &nbsp;
                       <span class="badge bg-light text-dark rounded-pill align-text-bottom liveGridOpenCount">0</span>`,
                       pageOpen: 'liveGrid',
                       addUl: true,
                       ulItems: [
                           {
                               label: lang['Open All Monitors'],
                               class: 'open-all-monitors cursor-pointer',
                               color: 'orange',
                           },
                           {
                               label: lang['Close All Monitors'],
                               class: 'close-all-monitors cursor-pointer',
                               color: 'red',
                           },
                           {
                               label: lang['Remember Positions'],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="monitorOrder" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang['Mute Audio'],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="monitorMuteAudio" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang['Cycle Monitors'],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="cycleLiveGrid" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang['JPEG Mode'],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="jpegMode" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang['Stream in Background'],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="backgroundStream" ui-change-target=".dot" on-class="dot-grey" off-class="dot-green"',
                               color: 'grey',
                           },
                           {
                               label: lang[`Original Aspect Ratio`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="dontMonStretch" ui-change-target=".dot" on-class="dot-grey" off-class="dot-green"',
                               color: 'grey',
                           },
                           {
                               label: lang[`Hide Detection on Stream`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="dontShowDetection" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang[`Alert on Event`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="alertOnEvent" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                           {
                               label: lang[`Popout on Event`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="popOnEvent" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                       ]
                   },
                   {
                       icon: 'video-camera',
                       label: `${lang.Monitors} &nbsp;
                       <span class="badge bg-light text-dark rounded-pill align-text-bottom cameraCount"><i class="fa fa-spinner fa-pulse"></i></span>`,
                       pageOpen: 'monitorsList',
                   },
                   {
                       icon: 'barcode',
                       label: `${lang['Timeline']}`,
                       pageOpen: 'timeline',
                       addUl: true,
                   },
                   {
                       icon: 'map-marker',
                       label: `${lang['Monitor Map']}`,
                       pageOpen: 'monitorMap',
                   },
                   {
                       icon: 'film',
                       label: `${lang['Videos']}`,
                       pageOpen: 'videosTableView',
                       addUl: true,
                       ulItems: [
                           {
                               label: lang[`Save Compressed Video on Completion`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="saveCompressedVideo" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                       ]
                   },
                   {
                       icon: 'calendar',
                       label: `${lang['Calendar']}`,
                       pageOpen: 'calendarView',
                   },
                   {
                       icon: 'fast-forward',
                       label: `${lang['Time-lapse']}`,
                       pageOpen: 'timelapseViewer',
                       addUl: true,
                       ulItems: [
                           {
                               label: lang[`Save Built Video on Completion`],
                               class: 'cursor-pointer',
                               attributes: 'dam-vms-switch="timelapseSaveBuiltVideo" ui-change-target=".dot" on-class="dot-green" off-class="dot-grey"',
                               color: 'grey',
                           },
                       ]
                   },
                   {
                       icon: 'file-o',
                       label: `${lang['FileBin']}`,
                       pageOpen: 'fileBinView',
                   },
                   {
                       divider: true,
                   },
                   {
                       icon: 'wrench',
                       label: `${lang['Monitor Settings']}`,
                       pageOpen: 'monitorSettings',
                       addUl: true,
                       eval: `!$user.details.sub || $user.details.monitor_create !== 0`,
                   },
                   {
                       icon: 'grav',
                       label: `${lang['Region Editor']}`,
                       pageOpen: 'regionEditor',
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'link',
                       label: `${lang['Chain Manager']}`,
                       pageOpen: 'chainManager',
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'filter',
                       label: `${lang['Event Filters']}`,
                       pageOpen: 'eventFilters',
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'align-right',
                       label: `${lang['Monitor States']}`,
                       pageOpen: 'monitorStates',
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'clock-o',
                       label: `${lang['Schedules']}`,
                       pageOpen: 'schedules',
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'exclamation-triangle',
                       label: `${lang['Logs']}`,
                       pageOpen: 'logViewer',
                       eval: `!$user.details.sub || $user.details.view_logs !== 0`,
                   },
                   {
                       divider: true,
                   },
                   {
                       icon: 'gears',
                       label: `${lang['Account Settings']}`,
                       pageOpen: 'accountSettings',
                       eval: `!$user.details.sub || $user.details.user_change !== 0`,
                       addUl: true,
                   },
                   {
                       icon: 'group',
                       label: `${lang.subAccountManager}`,
                       pageOpen: 'subAccountManager',
                       addUl: true,
                       eval: `!$user.details.sub`,
                   },
                   {
                       icon: 'key',
                       label: `${lang['API Keys']}`,
                       pageOpen: 'apiKeys',
                   },
                   {
                       divider: true,
                   },
                   {
                       icon: 'search',
                       label: `${lang['ONVIF Scanner']}`,
                       pageOpen: 'onvifScanner',
                       addUl:true,
                       eval: `!$user.details.sub || $user.details.monitor_create !== 0`,
                   },
                   {
                       icon: 'opera',
                       label: `${lang['ONVIF Device Manager']}`,
                       pageOpen: 'onvifDeviceManager',
                       eval: `!$user.details.sub || $user.details.monitor_create !== 0`,
                   },
                   {
                       icon: 'eyedropper',
                       label: `${lang['FFprobe']}`,
                       pageOpen: 'cameraProbe',
                   },
                   {
                       icon: 'compass',
                       label: `${lang['DAM VMSHub']}`,
                       pageOpen: 'configFinder',
                       addUl: true,
                       eval: `!$user.details.sub || $user.details.monitor_create !== 0`,
                   },
                   {
                       divider: true,
                   },
                   {
                       icon: 'info-circle',
                       label: `${lang['Help']}`,
                       pageOpen: 'helpWindow',
                   },
                   // {
                   //     icon: 'exclamation-circle',
                   //     label: `${lang['Events']}`,
                   //     pageOpen: 'eventListWithPics',
                   // },
                   {
                       icon: 'sign-out',
                       label: `${lang['Logout']}`,
                       class: 'logout',
                   },
               ]
           },
           "SideMenuBeforeList": {
              "name": "SideMenuBeforeList",
              "color": "grey",
              "noHeader": true,
              "noDefaultSectionClasses": true,
              "section-class": "px-3",
              "info": [
                  {
                      isFormGroupGroup: true,
                      "noHeader": true,
                      "noDefaultSectionClasses": true,
                      "section-class": "card btn-default text-white px-3 py-2 mb-3 border-0",
                      info: [
                          {
                               "fieldType": "div",
                               "id": `clock`,
                               "style": `cursor:pointer`,
                               "attribute": `data-target="#time-hours"`,
                               "divContent": `<div id="time-date"></div>
                                                 <ul>
                                                     <li id="time-hours"></li>
                                                     <li class="point">:</li>
                                                     <li id="time-min"></li>
                                                     <li class="point">:</li>
                                                     <li id="time-sec"></li>
                                                 </ul>
                                                 `
                          },
                      ]
                  },
                  {
                      "id": "indicator-bars",
                      isFormGroupGroup: true,
                      "noHeader": true,
                      "noDefaultSectionClasses": true,
                      "section-class": "card text-white bg-gradient-blue px-3 py-2 mb-3 border-0",
                      info: [
                          {
                              "fieldType": "indicatorBar",
                              "icon": "square",
                              "name": "cpu",
                              "label": `<span class="os_cpuCount"><i class="fa fa-spinner fa-pulse"></i></span> ${lang.CPU}<span class="os_cpuCount_trailer"></span> : <span class="os_platform" style="text-transform:capitalize"><i class="fa fa-spinner fa-pulse"></i></span>`,
                          },
                          {
                              "fieldType": "indicatorBar",
                              "icon": "microchip",
                              "name": "ram",
                              "label": `<span class="os_totalmem used"><i class="fa fa-spinner fa-pulse"></i></span> ${lang.MB} ${lang.RAM}`,
                          },
                          {
                              id: 'disk-indicator-bars',
                              isFormGroupGroup: true,
                              "noHeader": true,
                              "noDefaultSectionClasses": true,
                              "section-class": "disk-indicator-bars",
                              info: [
                                  {
                                      "fieldType": "indicatorBar",
                                      "icon": "hdd-o",
                                      "name": "disk",
                                      "bars": 3,
                                      "color0": "info",
                                      "title0": lang["Video Share"],
                                      "color1": "danger",
                                      "title1": lang["Timelapse Frames Share"],
                                      "color2": "warning",
                                      "title2": lang["FileBin Share"],
                                      "label": `<span class="diskUsed" style="text-transform:capitalize">${lang.Primary}</span> : <span class="value"></span>`,
                                  },
                              ]
                          },
                          {
                              "fieldType": "indicatorBar",
                              "percent": 0,
                              "color": 'warning',
                              "indicatorPercentClass": 'activeCameraCount',
                              "icon": "video-camera",
                              "name": "activeCameraCount",
                              "label": lang['Active Monitors'],
                          },
                      ]
                  }
              ]
           },
           "SideMenuAfterList": {
              "name": "SideMenuAfterList",
              "noHeader": true,
              "noDefaultSectionClasses": true,
              "info": []
           }
        }
    }
}
