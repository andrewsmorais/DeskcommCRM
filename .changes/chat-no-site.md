---
impacto: capacidade_nova
secao: adicionado
titulo: Chat no site — um balão de conversa para colar no seu site
---

Como o "Chat no site" da Umbler Talk: em **Conexões › Chat no site** você cria um chat, copia **uma linha de código** e cola no seu site. Aparece um balão no canto da página; o visitante escreve ali e a conversa chega na **Inbox** como qualquer outra (rodízio, etiquetas, funil, agente de IA). A sua resposta aparece no balão.

- Você escolhe o título, a mensagem de boas-vindas e a cor, e pode pedir o nome do visitante antes da primeira mensagem.
- Pode limitar os **sites que mostram o chat** (em branco, qualquer site com o código mostra).
- A **IA começa pausada** nesse canal, como nos outros: libere em "Configurar acesso da IA", no cartão do chat.
- Só texto por enquanto: imagem, áudio e arquivo ainda não aparecem no balão.
- O visitante é reconhecido pelo próprio navegador: se ele limpar os dados ou trocar de aparelho, começa uma conversa nova.

Nada a fazer na atualização: o `update.sh` aplica a migration 0518. O balão é servido pelo endereço público do seu CRM (`/webchat/v1.js`).
