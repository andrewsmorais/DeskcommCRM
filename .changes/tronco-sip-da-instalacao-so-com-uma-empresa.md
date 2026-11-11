---
impacto: exige_acao
secao: alterado
titulo: O tronco SIP da instalação só serve a outras empresas quando o servidor autoriza
---

O tronco SIP configurado no servidor (`VOIP_TRUNK_ENDPOINT`) era usado por qualquer empresa da instalação que não tivesse tronco próprio — numa instalação com várias empresas, uma delas ligava pela conta SIP de quem paga o servidor, sem ninguém ter autorizado; e podia cadastrar um número do servidor e passar a receber as ligações dele.

Agora o tronco da instalação vale sozinho só quando a instalação tem uma empresa (o caso comum). Com mais de uma, cada empresa usa o tronco que configurou em Configurações › Telefonia, e o da instalação — para ligar ou para cadastrar número — só entra para as demais se o servidor disser que é compartilhado. Quem já tem tronco próprio por empresa não percebe diferença.

## Requer atenção

Só para instalação com mais de uma empresa que liga pelo tronco do servidor: depois de atualizar, ou cada empresa configura o próprio tronco em Configurações › Telefonia, ou o operador acrescenta `VOIP_TRUNK_COMPARTILHADO=ligado` ao `.env` e reinicia o app. Até lá, a empresa sem tronco próprio não consegue ligar nem cadastrar número no tronco do servidor. Números já cadastrados continuam recebendo ligações.
