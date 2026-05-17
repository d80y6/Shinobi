# Install DAM VMS with Docker

**Warning :** It is recommended that you have a dedicated machine for DAM VMS even if you intend to use Docker. If you are willing to install directly on the operating system please consider installing Ubuntu 22.04 and using the Ninja Way.

We recommend that your Host OS is one of the following :

- Ubuntu 22.04
- CentOS 8
- MacOS 10.7

Docker Image Used : `registry.gitlab.com/dam-vms-systems/dam-vms:dev`

## Ninja Way - Docker Edition

> This method uses `docker-compose`. This will build your container from the images hosted on Gitlab. We no longer use Docker Hub and will not in the foreseeable future.

```
bash <(curl -s https://gitlab.com/DAM VMS-Systems/DAM VMS-Installer/raw/master/dam-vms-docker.sh)
```

Once complete open port `8080` of your Docker host in a web browser.

## "Run" Way

**Installing DAM VMS**

> Please remember to check out the Environment Variables table further down this README.

```
docker run -d --name='DAM VMS' -p '8080:8080/tcp' -v "/dev/shm/DAM VMS/streams":'/dev/shm/streams':'rw' -v "$HOME/DAM VMS/config":'/config':'rw' -v "$HOME/DAM VMS/customAutoLoad":'/home/DAM VMS/libs/customAutoLoad':'rw' -v "$HOME/DAM VMS/database":'/var/lib/mysql':'rw' -v "$HOME/DAM VMS/videos":'/home/DAM VMS/videos':'rw' -v "$HOME/DAM VMS/plugins":'/home/DAM VMS/plugins':'rw' -v '/etc/localtime':'/etc/localtime':'ro' registry.gitlab.com/dam-vms-systems/dam-vms:dev
```

**Installing Object Detection (TensorFlow.js)**
*Updated Image only works with Dashboard v3*

> This requires that you add the plugin key to the DAM VMS container. This key is generated and displayed in the startup logs of the Object Detection docker container.

- `-p '8082:8082/tcp'` is an optional flag if you decide to run the plugin in host mode.
- `-e PLUGIN_HOST='10.1.103.113'` Set this as your DAM VMS IP Address.
- `-e PLUGIN_PORT='8080'` Set this as your DAM VMS Web Port number.

```
docker run -d --name='dam-vms-tensorflow' -e PLUGIN_HOST='10.1.103.113' -e PLUGIN_PORT='8080' -v "$HOME/DAM VMS/docker-plugins/tensorflow":'/config':'rw' registry.gitlab.com/dam-vms-systems/docker-plugin-tensorflow.js:master
```

More Information about this plugin :
- CPU : https://gitlab.com/DAM VMS-Systems/docker-plugin-tensorflow.js
- GPU (NVIDIA CUDA) : https://gitlab.com/DAM VMS-Systems/docker-plugin-tensorflow.js/-/tree/gpu


## From Source
> Image is based on Ubuntu Bionic (20.04). Node.js 12 is used. MariaDB and FFmpeg are included.

1. Download Repo

```
git clone -b dev https://gitlab.com/DAM VMS-Systems/DAM VMS.git DAM VMSSource
```

2. Enter repository.

```
cd DAM VMSSource
```

3. Build Image.

```
docker build --tag dam-vms-image:1.0 .
```

**Running on ARM32v7?** Run this instead.

```
docker build -f Dockerfile.arm32v7 --tag dam-vms-image:1.0 .
```

4. Create a container with the image.

> This command only works on Linux because of the temporary directory used. This location must exist in RAM. `-v "/dev/shm/dam-vmsStreams":'/dev/shm/streams':'rw'`. The timezone is also acquired from the host by the volume declaration of `-v '/etc/localtime':'/etc/localtime':'ro'`.

```
docker run -d --name='DAM VMS' -p '8080:8080/tcp' -v "/dev/shm/DAM VMS/streams":'/dev/shm/streams':'rw' -v "$HOME/DAM VMS/config":'/config':'rw' -v "$HOME/DAM VMS/customAutoLoad":'/home/DAM VMS/libs/customAutoLoad':'rw' -v "$HOME/DAM VMS/database":'/var/lib/mysql':'rw' -v "$HOME/DAM VMS/videos":'/home/DAM VMS/videos':'rw' -v "$HOME/DAM VMS/plugins":'/home/DAM VMS/plugins':'rw' -v '/etc/localtime':'/etc/localtime':'ro' dam-vms-image:1.0
```

 > Host mount paths have been updated in this document.

 ### Running without Included Database (NoDB)

 For information about this please see this Merge Request done by @thtmnisamnstr. It thoroughly documents how to use the NoDB installation method.

 https://gitlab.com/DAM VMS-Systems/DAM VMS/-/merge_requests/443

 ### Volumes

 | Volumes                      | Description                                                                                                                                         |
 |------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
 | /dev/shm/DAM VMS/streams     | **IMPORTANT!** This must be mapped to somewhere in the host's RAM. When running this image on Windows you will need to select a different location. |
 | /config                      | Put `conf.json` or `super.json` files in here to override the default. values.                                                                      |
 | $HOME/DAM VMS/customAutoLoad | Maps to the `/home/DAM VMS/libs/customAutoLoad` folder for loading your own modules into DAM VMS.                                                   |
 | $HOME/DAM VMS/database       | A map to `/var/lib/mysql` in the container. This is the database's core files.                                                                      |
 | $HOME/DAM VMS/videos         | A map to `/home/DAM VMS/videos`. The storage location of your recorded videos.                                                                      |
 | $HOME/DAM VMS/plugins        | A map to `/home/DAM VMS/plugins`. Mapped so that plugins can easily be modified or swapped.                                                         |

### Environment Variables

> Environment Variables have been disabled. You must now make changes in the conf.json itself when it is mounted on the host.
> If conf.json does not exist inside the mounted folder then you may create it and DAM VMS will use that on next container start.

 > You must add (to the docker container) `/config/ssl/server.key` and `/config/ssl/server.cert`. The `/config` folder is mapped to `$HOME/DAM VMS/config` on the host by default with the quick run methods. Place `key` and `cert` in `$HOME/DAM VMS/config/ssl`. If `SSL_ENABLED=true` and these files don't exist they will be generated with `openssl`.

> For those using `DB_DISABLE_INCLUDED=true` please remember to create a user in your databse first. The Docker image will create the `DB_DATABASE` under the specified connection information.

### Power Video Viewer Blank or Not working

This seems to be an issue with using Docker on some linux OS' like Arch Linux. It is uncertain what the specific issue is but for now please use Docker on a consumer or enterprise supported distribution of linux, like Ubuntu 20.04.

### Tips

Modifying `conf.json` or Superuser credentials.
> Please read **Volumes** table in this README. conf.json is for general configuration. super.json is for Superuser credential management.

Get Docker Containers
```
docker ps -a
```

Get Images
```
docker images
```

Container Logs
```
docker logs /DAM VMS
```

Enter the Command Line of the Container
```
docker exec -it /DAM VMS /bin/bash
```

Stop and Remove
```
docker stop /DAM VMS
docker rm /DAM VMS
```

**WARNING - DEVELOPMENT ONLY!!!** Kill all Containers and Images
> These commands will completely erase all of your docker containers and images. **You have been warned!**

```
docker stop /DAM VMS
docker rm $(docker ps -a -f status=exited -q)
docker rmi $(docker images -a -q)
```
