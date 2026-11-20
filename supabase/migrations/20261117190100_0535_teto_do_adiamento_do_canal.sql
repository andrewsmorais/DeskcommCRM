-- manifest: A campanha de prospecção marca desde quando o número está fora (`prospecting_campaigns.channel_down_since`): a reconexão de segundos não pausa mais a campanha, e há teto para o adiamento. (vindo do produto original: 0738 de lá)
alter table public.prospecting_campaigns
  add column if not exists channel_down_since timestamptz;
