#!/bin/bash
echo "========================================================="
echo "==!! DAM VMS : The Open Source CCTV and NVR Solution !!=="
echo "=================== Mac OS Install Part 2 ==============="
echo "========================================================="
echo "DAM VMS - Database Installation"
echo "(y)es or (N)o"
read -r mysqlagreeData
if [ "$mysqlagreeData" = "y" ]; then
    echo "DAM VMS will now use root for database installation..."
    sudo mysql -e "source sql/user.sql" || true
fi
echo "============="
echo "DAM VMS - Install NPM Libraries"
sudo npm i npm -g
sudo npm install --unsafe-perm
# sudo npm audit fix --unsafe-perm
echo "============="
echo "DAM VMS - Install PM2"
sudo npm install pm2@latest -g
if [ ! -e "./conf.json" ]; then
    sudo cp conf.sample.json conf.json
fi
if [ ! -e "./super.json" ]; then
    echo "Default Superuser : admin@dam-vms.video"
    echo "Default Password : admin"
    sudo cp super.sample.json super.json
fi
echo "DAM VMS - Finished"
touch INSTALL/installed.txt
dos2unix /home/DAM VMS/INSTALL/dam-vms
ln -s /home/DAM VMS/INSTALL/dam-vms /usr/bin/dam-vms
sudo chmod -R 755 .
echo "=====================================" > INSTALL/installed.txt
echo "=======   Login Credentials   =======" >> INSTALL/installed.txt
echo "|| Username : $userEmail" >> INSTALL/installed.txt
echo "|| Password : $userPasswordPlain" >> INSTALL/installed.txt
echo "|| API Key : $apiKey" >> INSTALL/installed.txt
echo "=====================================" >> INSTALL/installed.txt
echo "=====================================" >> INSTALL/installed.txt
echo "DAM VMS - Start DAM VMS and set to start on boot?"
echo "(y)es or (N)o"
read -r startDAM VMS
if [ "$startDAM VMS" = "y" ]; then
    sudo pm2 start camera.js
    sudo pm2 startup
    sudo pm2 save
    sudo pm2 list
fi
echo "details written to INSTALL/installed.txt"
echo "====================================="
echo "=======   Login Credentials   ======="
echo "|| Username : $userEmail"
echo "|| Password : $userPasswordPlain"
echo "|| API Key : $apiKey"
echo "====================================="
echo "====================================="
