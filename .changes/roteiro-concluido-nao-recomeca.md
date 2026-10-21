---
impacto: capacidade_nova
secao: alterado
titulo: Roteiro de perguntas já concluído não recomeça para o mesmo cliente, a não ser que o roteiro permita
---

Um roteiro de atendimento que o cliente já respondeu até o fim não volta a fazer as mesmas perguntas quando ele repete a palavra-gatilho, nem quando um roteador de intenção ou o fim de outro roteiro aponta para ele de novo. Antes, repetir a palavra reabria um cadastro já feito. A palavra-gatilho passa a valer para o próximo roteiro que o cliente ainda não concluiu.

Cada roteiro pode escolher o contrário: no início do roteiro, a opção **Pode recomeçar para quem já concluiu** faz ele começar de novo, útil para roteiros que se repetem, como agendamento. A opção nasce desligada, inclusive nos roteiros que já existem: quem dependia de um roteiro que recomeça precisa ligá-la nele. Um roteiro encerrado por prazo ou interrompido não conta como concluído e pode começar de novo. Não há mudança no banco.

Contribuição de @vgamkt (#1130).
