### Namespace travado
As vezes quando excluimos o namespace ele fica em estado Terminating,  geralmente porque há um ou mais recursos dentro dele que possuem finalizers e o controlador responsável por remover esses finalizers não conseguiu concluir a limpeza por algum motivo (um bug, um recurso externo indisponível, etc.). O Kubernetes não exclui o namespace enquanto houver recursos com finalizers pendentes.
A forma de "desbloquear" a exclusão envolve editar o objeto do namespace e remover manualmente a lista de finalizers. Importante: Isso força a exclusão do objeto namespace na API, mas não garante que todos os recursos dentro dele serão limpos corretamente. Recursos com finalizers presos podem se tornar "órfãos" após a exclusão forçada do namespace. Use com cautela

Aqui está o procedimento:

Passo 1: Identifique o namespace travado

Você já sabe qual é, mas para confirmar:

```Bash
kubectl get namespaces
```
Procure pelo namespace que está listado como Terminating.

Passo 2: Obtenha a definição YAML do namespace

Precisamos pegar a definição atual do namespace para editá-la. Use kubectl get com a flag -o yaml:

```Bash
kubectl get namespace <nome-do-namespace> -o yaml
```
Substitua <nome-do-namespace> pelo nome do namespace que está travado.

A saída será algo parecido com isto (muito simplificado):

```YAML
apiVersion: v1
kind: Namespace
metadata:
  creationTimestamp: "2023-10-27T10:00:00Z"
  name: meu-namespace-travado
  resourceVersion: "1234567"
  uid: abcdefg-1234-5678-90ab-abcdefghijkl
spec:
  finalizers:
  - kubernetes # <<< Procure por esta linha ou uma lista semelhante
status:
  phase: Terminating
```
Passo 3: Edite o objeto Namespace e remova os finalizers
Vamos usar o kubectl edit para modificar a definição do namespace diretamente no servidor API do Kubernetes:

```Bash
kubectl edit namespace <nome-do-namespace>
```
Este comando abrirá a definição YAML do namespace no seu editor de texto padrão (configurado pela variável de ambiente EDITOR ou KUBE_EDITOR).

Procure pela seção spec.finalizers. Ela deve estar listada sob spec:. Exemplo:

```YAML
spec:
  finalizers:
  - kubernetes # <<< REMOVA ESTA LINHA OU TODA A SEÇÃO finalizers SE ELA SÓ TIVER ISSO
```
Remova a linha - kubernetes (ou a lista inteira de finalizers se for só essa linha). A seção spec deve ficar assim (se não houver mais nada relevante nela):

```YAML
spec: {} # Ou sem a seção spec se ela ficou vazia
```
> CUIDADO: Não altere mais nada no YAML! Apenas remova a seção finalizers dentro de spec.

Salve e feche o editor.

Passo 4: O Kubernetes API Server tentará novamente excluir o namespace

Ao salvar as alterações, o kubectl edit enviará a definição modificada para o API Server. Como você removeu o finalizer kubernetes, o API Server agora entende que não há mais impedimentos impostos por ele para a exclusão do namespace e prosseguirá com a remoção do objeto namespace.

O namespace deverá sair do estado Terminating e ser excluído completamente em poucos instantes.

Importante:

Este procedimento requer permissões elevadas (geralmente cluster-admin).
Como mencionado, esta é uma forma de "forçar" a exclusão do namespace object. Recursos que estavam travando a exclusão por causa de seus próprios finalizers podem permanecer no cluster em um estado inconsistente ou órfão. Isso é raro com recursos padrão do Kubernetes, mas pode acontecer com Custom Resources (CRs) se o controlador (Operator) responsável por eles não estiver funcionando corretamente.
Se o problema ocorrer repetidamente com o mesmo tipo de recurso, pode ser necessário investigar por que o controlador desse recurso não está conseguindo finalizar a exclusão corretamente.
Execute este procedimento com cuidado e apenas para os namespaces que estão realmente travados no estado Terminating.