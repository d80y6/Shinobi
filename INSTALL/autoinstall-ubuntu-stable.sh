#!/bin/sh

apt install git -y
git clone https://github.com/DAM VMSCCTV/DAM VMS.git DAM VMS
cd DAM VMS || exit
chmod +x INSTALL/ubuntu-easyinstall.sh && INSTALL/ubuntu-easyinstall.sh
bash INSTALL/ubuntu-easyinstall.sh