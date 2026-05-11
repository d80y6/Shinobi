echo "============="
echo "Updating Node.js to version 16..."
wget https://deb.nodesource.com/setup_16.x
chmod +x setup_16.x
./setup_16.x
apt install nodejs -y
apt install node-pre-gyp -y
rm setup_16.x
npm i npm -g

echo "============="
echo "Updating PM2..."
npm install pm2@latest -g

echo "============="
echo "Updating DAM VMS dependencies..."
git reset --hard
git pull
rm -rf node_modules
npm install

echo "============="
echo "Restarting PM2..."
pm2 update
pm2 restart camera.js
