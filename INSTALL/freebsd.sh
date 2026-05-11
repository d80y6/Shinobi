#!/bin/tcsh
echo "========================================================="
echo "==== DAM VMS : The Open Source CCTV and NVR Solution ===="
echo "========================================================="
echo "This script should run as root inside your jail from the root"
echo "of the cloned git repository."
echo "To answer yes type the letter (y) in lowercase and press ENTER."
echo "Default is no (N). Skip any components you already have or don't need."
echo "============="
echo "DAM VMS - Do you want to Install Node.js?"
echo "(y)es or (N)o"
set nodejsinstall = $<
if ( $nodejsinstall == "y" ) then
	pkg install -y node npm
endif
echo "============="
echo "DAM VMS - Do you want to Install FFMPEG?"
echo "(y)es or (N)o"
set ffmpeginstall = $<
if ( $ffmpeginstall == "y" ) then
	pkg install -y ffmpeg libav x264 x265
endif
echo "============="
echo "DAM VMS - Database Installation"
echo "WARNING - This requires an existing and running mariadb service."
echo "(y)es or (N)o"
set mysqlagreeData = $<
if ( $mysqlagreeData == "y" ) then
    echo "What is your SQL Username?"
    set sqluser = $<
    echo "What is your SQL Password?"
    set sqlpass = $<
    echo "What is your SQL Host?"
    set sqlhost = $<
    echo "Installing mariadb client..."
    pkg install -y mariadb102-client
    echo "Installing database schema..."
    mysql -h $sqlhost -u $sqluser -p$sqlpass -e "source sql/user.sql" || true
    echo "DAM VMS - Use the /super endpoint to create your super user."
endif
echo "============="
echo "DAM VMS - Install NPM Libraries"
npm i npm -g
npm install --unsafe-perm
# sudo npm audit fix --force
echo "============="
echo "DAM VMS - Install PM2"
npm install pm2@latest -g
if (! -e "./conf.json" ) then
    cp conf.sample.json conf.json
endif
if (! -e "./super.json" ) then
    echo "Default Superuser : admin@dam-vms.video"
    echo "Default Password  : admin"
    cp super.sample.json super.json
endif
echo "DAM VMS - Start DAM VMS?"
echo "(y)es or (N)o"
set startDAM VMS = $<
if ( $startDAM VMS == "y" ) then
    set PM2BIN="$PWD/node_modules/pm2/bin"
    $PM2BIN/pm2 start camera.js
    $PM2BIN/pm2 start cron.js
    $PM2BIN/pm2 save
    $PM2BIN/pm2 list
endif
echo "DAM VMS - Start on boot?"
echo "(y)es or (N)o"
set startupDAM VMS = $<
if ( $startupDAM VMS == "y" ) then
    set PM2BIN="$PWD/node_modules/pm2/bin"
    $PM2BIN/pm2 startup rcd
endif
echo "DAM VMS - Finished"
