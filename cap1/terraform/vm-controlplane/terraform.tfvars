#Obrigatórias (sem default no variables.tf)
proxmox_password = "Arreto23"
ssh_public_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC9TWPvajhZkMTM7m6UKHTm/vOmslx2JjuSNJyA1++KGV3d5gSpDOxHouePFI9p+74FEHyIDJBZQhtRfoWFxP5srJsuuJ1kBmIZL8ol3VVnNOh6QgrmI5lyoX/QmZaCQ/GDE1vHIRRJOrSk+7JYnLkMuHD38wJJtAbG3ogfa2K3tJWosTjhLvjZM8nAXNMK3d8iTZZeq/8jcZesIrSFSLh75TKH5AE7O46hww+nlv9d2Kh/l7dWt6PezkEszXUl0TWjfLUl8g/98LBdWoyotAT+aC/fUSTRq3IsINPNdXRHTmYG6Yi0dBQaaX0kETIFcoL3XrNJwc4YakyuygkZXa9ka7xq1eDyPs2+YYw6v5b1LaeNWkaTZQ0pFb6Cx0dWJtE04QWKQo7os+woGpUSSwDpwc4v+supEqUrk9L28I1NXE3T+3WJCqRAbU/4M4984nKz28u5A7DAz1Vfs8JvKzIxEPCB4iOb6MMf0DEv1HeYaz5n3QTTp4i4FsIEp/tuGVQVoMWabNJ1L0iRnf7HeLUVv9nz3pWhqJNsUt5qKVyLnmaPZ/FosrZIdWmfP4e0Wbo+TpIBkae83MKSLSjLPBebDrbiw8aDHFpfA/Yq64+qGOYHABDTYKCPEnIlWJnvo8JblBFgpQv0zCXSGCyyxizPPbGoj7ADT2ewAMuyJmhHLw== devopstatu@localhost.localdomain"
#Opcionais (Já tem no default - so informe se for sobrescrever)
#gateway = <GW>
template_id = 201
template_vm_password = "Arreto23"
storage = "ssdevo"
vms = {
  "vm-control1" = {
    vm_id = 301
    ip = "192.168.1.42/24"
    cores = 4
    memory = 4096 #Número de RAM em MB
    disk_gb = 60 #Tamanho do disco
    role = "server"
  }
  "vm-control2" = {
    vm_id = 302
    ip = "192.168.1.43/24"
    cores = 4
    memory = 4096
    disk_gb = 60
    role = "server"
  }
    "vm-control3" = {
    vm_id = 303
    ip = "192.168.1.44/24"
    cores = 4
    memory = 4096
    disk_gb = 60
    role = "server"
  }
  "vm-work1" = {
    vm_id = 304
    ip = "192.168.1.45/24"
    cores = 8
    memory = 8192
    disk_gb = 80
    role = "agent"
  }
  "vm-work2" = {
    vm_id = 305
    ip = "192.168.1.46/24"
    cores = 8
    memory = 8192
    disk_gb = 80
    role = "agent"
  }
  "vm-work3" = {
    vm_id = 306
    ip = "192.168.1.47/24"
    cores = 8
    memory = 8192
    disk_gb = 80
    role = "agent"
  }
  "vm-work4" = {
    vm_id = 307
    ip = "192.168.1.48/24"
    cores = 8
    memory = 8192
    disk_gb = 80
    role = "agent"
  }
}
