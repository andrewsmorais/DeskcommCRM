---
impacto: capacidade_nova
secao: adicionado
titulo: Venda devolvida ao pixel do TikTok, do Pinterest e do Taboola
---
Em **Configurações › Conversões**, a nova seção **TikTok, Pinterest e Taboola** conecta cada plataforma: no TikTok, o código do pixel e o token da Events API; no Pinterest, o ID da conta de anúncios e o token da API de conversões; no Taboola, só o nome do evento de conversão (o Taboola não usa token). Quando um negócio de quem chegou por anúncio dessas plataformas é ganho, a venda volta como compra (TikTok `CompletePayment`, Pinterest `checkout`, postback S2S do Taboola), com o valor e a mesma proteção contra venda contada duas vezes da Meta e do Google. O código de teste do TikTok e do Pinterest marca os envios como teste.

Para a venda voltar, a pessoa precisa chegar pelo **link rastreável** com o link pronto da plataforma: o link agora guarda o código de clique que cada uma põe no endereço (`ttclid`, `epik`, `tblci`) e marca o contato com a plataforma. No Pinterest, o sistema guarda também o IP e o navegador do clique, porque a API dele recusa a venda sem eles quando não há e-mail; as outras plataformas não recebem esses dados. O card do funil mostra o rótulo da plataforma (TikTok_ads, Pinterest_ads, Taboola_ads).

Banco: migration 0567 (`update.sh` aplica sozinho).
