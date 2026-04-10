### Script .sh para request de sites
#!/bin/bash

# URLs para monitorar
URL1="https://Wordpress.tatulab.com.br"
URL2="https://Wordpress.tatulab.com.br/teste-error"
INTERVALO=5 # Intervalo em segundos

echo "Iniciando monitoramento das URLs: $URL1 e $URL2"
echo "Pressione Ctrl+C a qualquer momento para parar o script."
echo "---"

while true; do
    HORA_ATUAL=$(date +"%Y-%m-%d %H:%M:%S")

    echo "[$HORA_ATUAL] Consultando $URL1..."
    curl -s -o /dev/null -w "%{http_code}\n" $URL1
    
    echo "[$HORA_ATUAL] Consultando $URL2..."
    curl -s -o /dev/null -w "%{http_code}\n" $URL2

    echo "---"
    sleep $INTERVALO
done