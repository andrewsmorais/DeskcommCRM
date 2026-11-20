---
impacto: capacidade_nova
secao: adicionado
titulo: Contatos — sincronizar a agenda do celular do número conectado
---
Na tela de Contatos há um botão novo, **Agenda do celular**. Ele traz para o CRM os contatos que estão salvos no celular do número conectado (só números pareados com o aplicativo do WhatsApp), até 500 por vez; se a agenda for maior, o botão **Continuar de onde parou** segue do próximo contato, sem repetir ninguém. Quem já está no CRM não vira duplicata, e quem pediu para ser apagado (LGPD) não volta pela agenda. Os contatos novos entram com a origem "Agenda do celular". Para o WhatsApp entregar a agenda, a opção **Guardar o histórico anterior à vinculação** do número precisa estar ligada; se não estiver, a tela explica. O banco ganha a atualização 0560, que o `update.sh` aplica sozinho.
