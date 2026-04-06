output "vms_info" {
  description = "Informações das VMS criadas"
  value = {
    for name, vm in proxmox_virtual_environment_vm.vms : name => {
      vm_id = vm.vm_id
      ip = vm.initialization[0].ip_config[0].ipv4[0].address
      ssh_command = "ssh <user>@${split("/",vm.initialization[0].ip_config[0].ipv4[0].address)[0]}"
      } 
    }
}
