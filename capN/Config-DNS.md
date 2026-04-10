#Organização Padrão dos arquivo:
# Títulos começam com e letras maiúsculas #
# Segunda linha pode ser a descrição do comando
# Cada comando tem uma linha de margem 
# Espaçamento é o conteúdo do arquivo
# Variáveis são entre parênteses ( )


#DNS ZONA EXTERNA
#configurar os registros dns no servidor 10.20.1.142, endereço /var/cache/bind/master/dominio.dns
$TTL 43200      ; 12 hours
@                       SOA     prodam04.prodam.am.gov.br. abuse.prodam.am.gov.br. (
                                2021100401 ; serial
                                3600       ; refresh (1 hour)
                                15         ; retry (15 seconds)
                                1209600    ; expire (2 weeks)
                                43200      ; minimum (12 hours)
                                )
                        NS      prodam04.prodam.am.gov.br.
                        NS      bauru.prodam.am.gov.br.


dominio.                        IN      A       x.x.x.x
www                             IN      CNAME   dominio.  
api                             IN      A       x.x.x.x  #exemplo de 

#teste da zona
named-checkzone dominio /var/cache/bind/master/dominio.dns

Outro campo para configurar

cd /etc/bind/named.conf.local
# nano named.conf.local

zone "dominio.am.gov.br" {
        type master;
        allow-transfer { 10.20.1.174;  };
        file "master/domino.am.gov.br.dns";
};


#Configurar a zona no DNS primário 10.20.1.120,  endereço /var/lib/bind/var/cache/bind/master/am.gov.br.dns
; Dominio: dominio
; Criado: 01/10/2021
; Alterado:
; Entidade:
; Endereço:
; Responsável:
; Telefone:
; Função:
; E-mail:
; Chamado/SAC: xxxx.xxxx
;
; Delegated sub-zone: domino
;
dominio                         IN      NS      prodam04.prodam.am.gov.br.
dominio                         IN      NS      bauru.prodam.am.gov.br.
;

#Configurar no dns slave da prodam, ip 10.20.1.174, endereço /etc/bind/named.conf.local
zone "dominio" {
        type slave;
        masters { 10.20.1.142; };
        file "slave/dominio.dns";
};

#DNS ZONA INTERNA
#Criação de uma nova zona rede interna, servidor 10.20.1.126

#Adicionar no final do arquivo o domino /etc/bind/named.conf.local
zone "site.dominio" in {
        type master;
        file "primario/site.dominio.dns";
        allow-update { none; };
        allow-query { 10.20.0.0/16; 10.60.0.0/22; 10.10.0.0/16; 10.30.0.0/16; };
};

#Adicionar o registro da zona no diretório /var/cache/bind/primario/domino.dns
$TTL 3600       ; 1 hour
@                               IN      SOA     monitor.prodam.am.gov.br abuse.auxilioe.am.gov.br. (
                                2021100402 ; serial
                                900        ; refresh (15 minutes)
                                600        ; retry (10 minutes)
                                86400      ; expire (1 day)
                                3600       ; minimum (1 hour)
                                )

@               IN               NS      ns.domino.


domino.                 IN      A       x.x.x.x
ns                      IN      A       10.20.1.126
www                     IN      A       x.x.x.x
api                     IN      A       x.x.x.x


#Arquivo para configurar o DNS 

#TESTES DE DNS REVERSO
#INCLUIR A ZONA NO ARQUIVO /etc/bind/named.conf.local
zone "10.in-addr.arpa" in {
        type master;
        file "primario/prodam.local.rev.dns";
        allow-update { none; };
        allow-query { 10.0.0.0/8; };
};

#PARA CRIAR O DNS REVERSO DE UMA ZONA/var/cache/bind/primario/prodam.local.rev.dns
$TTL 86400
@       IN SOA monitor.dominio.local.    administrator.dominio.local. (
                2023050105 ; serial
                8H ; refresh
                2H ; retry
                4w ; expire
                1D ; minimum TTL
        )
        IN      NS      monitor.dominio.local.
10.0.0        IN      PTR     nome.dominio.local. #IP DO SERVIDOR APONTAMENTO DNS