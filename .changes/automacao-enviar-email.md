---
impacto: capacidade_nova
secao: adicionado
titulo: Automações — nova ação "Enviar e-mail"
---

Em Automações, uma regra pode enviar um e-mail: ao contato (pelo e-mail do cadastro) ou à equipe (dono do negócio, gerentes ou uma pessoa). Assunto e texto aceitam `{{contact.name}}` e `{{lead.title}}`. Quem recusou contato, está bloqueado ou é marcado como "pessoal" / "sempre atendimento humano" não recebe, e contato sem e-mail no cadastro é ignorado. Usa o e-mail já configurado na instalação (SMTP ou Resend); sem ele, a regra apenas registra que o e-mail não está ligado. Nada a fazer na atualização.
