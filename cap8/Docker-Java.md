# Docker

apt-get update
apt-get install apt-transport-https ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian buster stable"
apt-get update
apt-get install docker-ce docker-ce-cli containerd.io


# Java 11 e 1.8

apt-get install default-jdk
apt-get update
apt install apt-transport-https ca-certificates wget dirmngr gnupg software-properties-common
wget -qO - https://adoptopenjdk.jfrog.io/adoptopenjdk/api/gpg/key/public | sudo apt-key add -
add-apt-repository --yes https://adoptopenjdk.jfrog.io/adoptopenjdk/deb/
apt update
apt install adoptopenjdk-8-hotspot

(COMANDO PARA ALTERNAR OS JAVAS)
update-alternatives --config java