#!/bin/bash
echo "========================================================="
echo "==!! DAM VMS : The Open Source CCTV and NVR Solution !!=="
echo "========================================================="
echo "To answer yes type the letter (y) in lowercase and press ENTER."
echo "Default is no (N). Skip any components you already have or don't need."
echo "============="
if [ ! -e "./conf.json" ]; then
    cp conf.sample.json conf.json
fi
if [ ! -e "./super.json" ]; then
    echo "Default Superuser : admin@dam-vms.video"
    echo "Default Password : admin"
    sudo cp super.sample.json super.json
    echo "DAM VMS - Do you want to enable superuser access?"
    echo "This may be useful if passwords are forgotten or"
    echo "if you would like to limit accessibility of an"
    echo "account for business scenarios."
    echo "(y)es or (N)o"
    read -r createSuperJson
    if [ "$createSuperJson" = "y" ] || [ "$createSuperJson" = "Y" ]; then
        echo "Default Superuser : admin@dam-vms.video"
        echo "Default Password : admin"
        echo "* You can edit these settings in \"super.json\" located in the DAM VMS directory."
        sudo cp super.sample.json super.json
    fi
fi
echo "DAM VMS - Run zypper refresh"
sudo zypper refresh
sudo zypper install -y make
echo "============="
echo "DAM VMS - Do you want to Install Node.js?"
echo "(y)es or (N)o"
NODEJSINSTALL=0
read -r nodejsinstall
if [ "$nodejsinstall" = "y" ] || [ "$nodejsinstall" = "Y" ]; then
    sudo zypper install -y nodejs16
    NODEJSINSTALL=1
fi
echo "============="
echo "DAM VMS - Do you want to Install FFMPEG?"
echo "(y)es or (N)o"
read -r ffmpeginstall
if [ "$ffmpeginstall" = "y" ] || [ "$ffmpeginstall" = "Y" ]; then
    # Without nodejs8 package we can't use npm command
    if [ "$NODEJSINSTALL" -eq "1" ]; then
        echo "DAM VMS - Do you want to Install FFMPEG with 'zypper --version' or download a static version provided with npm 'npm --version'?"
        echo "(z)ypper or (N)pm"
        echo "Press [ENTER] for default (npm)"
        read -r ffmpegstaticinstall
        if [ "$ffmpegstaticinstall" = "z" ] || [ "$ffmpegstaticinstall" = "Z" ]; then
            # Install ffmpeg and ffmpeg-devel
            sudo zypper install -y ffmpeg ffmpeg-devel
        else
            sudo npm install ffbinaries
        fi
    else
        sudo zypper install -y ffmpeg ffmpeg-devel
    fi
fi
echo "============="
echo "DAM VMS - Do you want to Install MariaDB?"
echo "(y)es or (N)o"
read -r mysqlagree
if [ "$mysqlagree" = "y" ] || [ "$mysqlagree" = "Y" ]; then
    sudo zypper install -y mariadb
    #Start mysql and enable on boot
    sudo systemctl start mariadb
    sudo systemctl enable mariadb
    #Run mysql install
    sudo mysql_secure_installation
fi
echo "============="
echo "DAM VMS - Database Installation"
echo "(y)es or (N)o"
read -r mysqlagreeData
if [ "$mysqlagreeData" = "y" ] || [ "$mysqlagreeData" = "Y" ]; then
    echo "What is your SQL Username?"
    read -r sqluser
    echo "What is your SQL Password?"
    read -r sqlpass
    sudo mysql -u "$sqluser" -p"$sqlpass" -e "source sql/user.sql" || true
fi
echo "============="
echo "DAM VMS - Install NPM Libraries"
npm i npm -g
npm install --unsafe-perm
# sudo npm audit fix --force
echo "============="
echo "DAM VMS - Install PM2"
sudo npm install pm2@latest -g
echo "DAM VMS - Finished"
sudo chmod -R 755 .
touch INSTALL/installed.txt
dos2unix /home/DAM VMS/INSTALL/dam-vms
ln -s /home/DAM VMS/INSTALL/dam-vms /usr/bin/dam-vms
echo "DAM VMS - Start DAM VMS and set to start on boot?"
echo "(y)es or (N)o"
read -r startDAM VMS
if [ "$startDAM VMS" = "y" ] || [ "$startDAM VMS" = "Y" ]; then
    sudo pm2 start camera.js
    #sudo pm2 start cron.js
    sudo pm2 startup
    sudo pm2 save
    sudo pm2 list
fi
echo "====================================="
echo "||=====   Install Completed   =====||"
echo "====================================="
echo "|| Login with the Superuser and create a new user!!"
echo "||==================================="
echo "|| Open http://$(/sbin/ip -o -4 addr list eth0 | awk '{print $4}' | cut -d/ -f1):8080/super in your web browser."
echo "||==================================="
echo "|| Default Superuser : admin@dam-vms.video"
echo "|| Default Password : admin"
echo "====================================="
echo "====================================="
