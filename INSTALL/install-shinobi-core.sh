#! /bin/sh
# Check OS
OSTYPE="$(uname -s)"
defaultDirectory="/home"
if [ "$OSTYPE" = "Darwin" ]; then
    defaultDirectory="/Applications"
fi

installLocation="$defaultDirectory"
cd $installLocation

echo "Opening Install Location : \"$installLocation\""

if [ ! -d "Shinobi" ]; then
    if [ "$OSTYPE" = "Darwin" ]; then
        if [ ! -x "$(command -v brew)" ]; then
            ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
            brew doctor
        fi
        if [ ! -x "$(command -v git)" ]; then
            brew install git
        fi
    else
        if [ "$(id -u)" != 0 ]; then
            echo "*--------------------**---------------------*"
            echo "*Shinobi requires being run as root."
            echo "*Do you want to continue without being root? (Y/n) Default: Yes"
            read nonRootUser
            if [ "$nonRootUser" = "N" ] || [ "$nonRootUser" = "n" ]; then
                echo "Stopping..."
                exit 1
            fi
        fi
        if [ ! -x "$(command -v git)" ]; then
            if [ -x "$(command -v apt)" ]; then
                sudo apt update
                sudo apt install git -y
            elif [ -x "$(command -v yum)" ]; then
                sudo yum makecache
                sudo yum install git -y
            fi
        fi
        if [ ! -x "$(command -v wget)" ]; then
            if [ -x "$(command -v apt)" ]; then
                sudo apt install wget -y
            elif [ -x "$(command -v yum)" ]; then
                sudo yum install wget -y
            fi
        fi
    fi
    
    theRepo=''
    productName="Shinobi Professional (Pro)"
    echo "Install the Development branch? (y/N) Default: No"
    read theBranchChoice
    if [ "$theBranchChoice" = "Y" ] || [ "$theBranchChoice" = "y" ]; then
        echo "Getting the Development Branch"
        theBranch='dev'
    else
        echo "Enter the branch name (default: master):"
        read theBranch
        theBranch=${theBranch:-master}
    fi
    
    gitURL="https://gitlab.com/reachchinmoy/Shinobi$theRepo"
    sudo git clone $gitURL.git -b $theBranch Shinobi
    cd Shinobi
    gitVersionNumber=$(git rev-parse HEAD)
    theDateRightNow=$(date)
    
    sudo touch version.json
    sudo chmod 777 version.json
    echo '{"Product" : "'$productName'" , "Branch" : "'$theBranch'" , "Version" : "'$gitVersionNumber'" , "Date" : "'$theDateRightNow'" , "Repository" : "'$gitURL'"}' | sudo tee version.json
    
    echo "-------------------------------------"
    echo "---------- Shinobi Systems ----------"
    echo "Repository : $gitURL"
    echo "Product : $productName"
    echo "Branch : $theBranch"
    echo "Version : $gitVersionNumber"
    echo "Date : $theDateRightNow"
    echo "-------------------------------------"
else
    echo "!-----------------------------------!"
    echo "Shinobi already downloaded."
    cd Shinobi
fi

sudo chmod +x INSTALL/start.sh
sudo INSTALL/start.sh
