---
impacto: nada_mudou
secao: corrigido
titulo: A confirmação de acesso preserva o endereço local de desenvolvimento
---
Ao desenvolver usando 127.0.0.1, localhost ou ::1, a confirmação de acesso e os erros da entrada com Google permanecem no endereço aberto pelo navegador. Isso evita perder a sessão ao trocar o host durante o retorno. Em produção, continua valendo o endereço público configurado. Esta mudança não cria contas nem separa o banco usado pelo desenvolvimento do banco da instalação.
