/*
 * Chat no site — o balão de conversa.
 *
 * Uso (uma linha, no site do cliente):
 *   <script async src="https://SEU-CRM/webchat/v1.js" data-chave="..."></script>
 *
 * Sem dependência e sem tocar no CSS da página (Shadow DOM). Todo texto entra
 * por `textContent` — nada vindo da rede vira HTML. O token do visitante nasce
 * aqui, fica no `localStorage` deste site e só viaja no CORPO dos pedidos.
 */
(function () {
  "use strict";
  if (window.__chatDoSiteCarregado) return;
  window.__chatDoSiteCarregado = true;

  var script = document.currentScript;
  if (!script) return;
  var chave = script.getAttribute("data-chave") || "";
  if (!/^[0-9a-f]{32}$/.test(chave)) return;
  var base = new URL(script.src).origin + "/api/v1/webhooks/webchat/" + chave;
  var GUARDA = "chat_do_site_" + chave;

  // ---- o que fica guardado no navegador do visitante ----
  var memoria = { visitante: "", nome: "", email: "" };
  try {
    var salvo = JSON.parse(localStorage.getItem(GUARDA) || "{}");
    if (salvo && typeof salvo === "object") {
      memoria.visitante = typeof salvo.visitante === "string" ? salvo.visitante : "";
      memoria.nome = typeof salvo.nome === "string" ? salvo.nome : "";
      memoria.email = typeof salvo.email === "string" ? salvo.email : "";
    }
  } catch {
    /* navegação privada: a conversa vale só enquanto a aba estiver aberta */
  }
  function guardar() {
    try {
      localStorage.setItem(GUARDA, JSON.stringify(memoria));
    } catch {
      /* sem armazenamento: segue em memória */
    }
  }
  function novoToken() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function novoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
    return (
      h.slice(0, 4).join("") + "-" + h.slice(4, 6).join("") + "-" + h.slice(6, 8).join("") + "-" +
      h.slice(8, 10).join("") + "-" + h.slice(10).join("")
    );
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(memoria.visitante)) {
    memoria.visitante = novoToken();
    guardar();
  }

  // `text/plain` de propósito: pedido "simples", sem pré-voo do navegador.
  function pedir(caminho, corpo) {
    return fetch(base + caminho, {
      method: corpo ? "POST" : "GET",
      headers: corpo ? { "Content-Type": "text/plain;charset=UTF-8" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: "omit",
    }).then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, status: r.status, corpo: j };
      });
    });
  }

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".botao{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;" +
    "background:var(--cor);color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;" +
    "display:flex;align-items:center;justify-content:center}" +
    ".botao:focus-visible,.enviar:focus-visible,.fechar:focus-visible{outline:3px solid #000;outline-offset:2px}" +
    ".aviso{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#dc2626;" +
    "color:#fff;font-size:12px;font-weight:600;display:none;align-items:center;justify-content:center;padding:0 5px}" +
    ".painel{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 24px);height:520px;" +
    "max-height:calc(100vh - 110px);background:#fff;color:#111827;border-radius:14px;overflow:hidden;display:none;" +
    "flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.28);z-index:2147483000}" +
    ".painel.aberto{display:flex}" +
    ".topo{background:var(--cor);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
    ".titulo{font-size:16px;font-weight:600;margin:0}" +
    ".fechar{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:6px}" +
    ".lista{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f3f4f6}" +
    ".msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}" +
    ".msg.deles{align-self:flex-start;background:#fff;color:#111827;border-bottom-left-radius:4px}" +
    ".msg.minha{align-self:flex-end;background:var(--cor);color:#fff;border-bottom-right-radius:4px}" +
    ".msg.falhou{opacity:.6}" +
    ".nota{align-self:center;font-size:12px;color:#6b7280;text-align:center}" +
    ".form{border-top:1px solid #e5e7eb;padding:10px;display:flex;flex-direction:column;gap:8px;background:#fff}" +
    ".linha{display:flex;gap:8px}" +
    "input,textarea{width:100%;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font-size:14px;color:#111827;" +
    "background:#fff;outline:none;resize:none}" +
    "input:focus,textarea:focus{border-color:var(--cor);box-shadow:0 0 0 2px rgba(0,0,0,.08)}" +
    ".enviar{background:var(--cor);color:#fff;border:0;border-radius:10px;padding:0 16px;font-size:14px;font-weight:600;cursor:pointer;min-height:40px}" +
    ".enviar:disabled{opacity:.5;cursor:default}" +
    "@media (max-width:480px){.painel{right:12px;left:12px;width:auto;bottom:84px}.botao{right:14px;bottom:14px}input,textarea{font-size:16px}}";

  function montar(config) {
    var raiz = document.createElement("div");
    raiz.setAttribute("data-chat-do-site", "");
    var sombra = raiz.attachShadow({ mode: "open" });
    var estilo = document.createElement("style");
    estilo.textContent = CSS;
    sombra.appendChild(estilo);
    var caixa = el("div");
    caixa.style.setProperty("--cor", /^#[0-9a-fA-F]{6}$/.test(config.cor) ? config.cor : "#4f46e5");
    sombra.appendChild(caixa);

    var botao = el("button", "botao");
    botao.type = "button";
    botao.setAttribute("aria-label", config.titulo);
    botao.setAttribute("aria-expanded", "false");
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "26");
    svg.setAttribute("height", "26");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    var caminho = document.createElementNS(NS, "path");
    caminho.setAttribute("d", "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z");
    svg.appendChild(caminho);
    botao.appendChild(svg);
    var aviso = el("span", "aviso");
    botao.appendChild(aviso);

    var painel = el("div", "painel");
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-label", config.titulo);
    var topo = el("div", "topo");
    topo.appendChild(el("p", "titulo", config.titulo));
    var fechar = el("button", "fechar", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar");
    topo.appendChild(fechar);
    var lista = el("div", "lista");
    lista.setAttribute("aria-live", "polite");
    var form = el("form", "form");

    var campoNome = el("input");
    campoNome.placeholder = "Seu nome";
    campoNome.maxLength = 80;
    campoNome.autocomplete = "name";
    campoNome.value = memoria.nome;
    var campoEmail = el("input");
    campoEmail.type = "email";
    campoEmail.placeholder = "Seu e-mail (opcional)";
    campoEmail.maxLength = 200;
    campoEmail.autocomplete = "email";
    campoEmail.value = memoria.email;
    var pedeNome = config.pedir_nome && !memoria.nome;
    if (pedeNome) {
      form.appendChild(campoNome);
      form.appendChild(campoEmail);
    }
    var linha = el("div", "linha");
    var campo = el("textarea");
    campo.rows = 1;
    campo.maxLength = 2000;
    campo.placeholder = "Escreva sua mensagem";
    campo.setAttribute("aria-label", "Escreva sua mensagem");
    var enviar = el("button", "enviar", "Enviar");
    enviar.type = "submit";
    linha.appendChild(campo);
    linha.appendChild(enviar);
    form.appendChild(linha);

    painel.appendChild(topo);
    painel.appendChild(lista);
    painel.appendChild(form);
    caixa.appendChild(painel);
    caixa.appendChild(botao);
    document.body.appendChild(raiz);

    var vistas = {}; // id → já está na tela
    var ultima = ""; // `em` da mensagem mais nova
    var aberto = false;
    var naoLidas = 0;
    var relogio = null;

    if (config.saudacao) lista.appendChild(el("div", "msg deles", config.saudacao));

    // O servidor encerrou este visitante (dados apagados a pedido): token novo,
    // tela limpa. A próxima mensagem abre uma conversa nova.
    function recomecar() {
      memoria.visitante = novoToken();
      guardar();
      vistas = {};
      ultima = "";
      while (lista.firstChild) lista.removeChild(lista.firstChild);
      if (config.saudacao) lista.appendChild(el("div", "msg deles", config.saudacao));
    }
    function rolar() {
      lista.scrollTop = lista.scrollHeight;
    }
    function mostrarAviso() {
      aviso.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
      aviso.style.display = naoLidas > 0 && !aberto ? "flex" : "none";
    }
    function pintar(m) {
      if (vistas[m.id]) return false;
      vistas[m.id] = true;
      lista.appendChild(el("div", "msg " + (m.de === "visitante" ? "minha" : "deles"), m.texto));
      if (m.em > ultima) ultima = m.em;
      return m.de !== "visitante";
    }
    function ler() {
      var corpo = { visitante: memoria.visitante };
      if (ultima) corpo.depois = ultima;
      return pedir("/ler", corpo)
        .then(function (r) {
          if (r.status === 410) return recomecar();
          if (!r.ok || !r.corpo.data) return;
          var novas = 0;
          r.corpo.data.mensagens.forEach(function (m) {
            if (pintar(m)) novas++;
          });
          if (novas > 0) {
            if (!aberto) naoLidas += novas;
            mostrarAviso();
            rolar();
          }
        })
        .catch(function () {
          /* rede caiu: a próxima volta tenta de novo */
        });
    }
    function agendar() {
      clearTimeout(relogio);
      // Aberto: conversa viva. Fechado: só confere de vez em quando se chegou resposta.
      relogio = setTimeout(function () {
        if (document.hidden) return agendar();
        ler().then(agendar);
      }, aberto ? 3000 : 20000);
    }
    function abrir(sim) {
      aberto = sim;
      painel.className = "painel" + (sim ? " aberto" : "");
      botao.setAttribute("aria-expanded", sim ? "true" : "false");
      if (sim) {
        naoLidas = 0;
        mostrarAviso();
        ler().then(rolar);
        (pedeNome && !campoNome.value ? campoNome : campo).focus();
      }
      agendar();
    }

    botao.addEventListener("click", function () {
      abrir(!aberto);
    });
    fechar.addEventListener("click", function () {
      abrir(false);
      botao.focus();
    });
    painel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        abrir(false);
        botao.focus();
      }
    });
    campo.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else enviar.click();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var texto = campo.value.trim();
      if (!texto) return;
      if (pedeNome) {
        var nome = campoNome.value.trim();
        if (!nome) {
          campoNome.focus();
          return;
        }
        memoria.nome = nome;
        memoria.email = campoEmail.value.trim();
        guardar();
      }
      var id = novoId();
      var corpo = { visitante: memoria.visitante, id: id, texto: texto, pagina: location.href.slice(0, 500) };
      if (memoria.nome) corpo.nome = memoria.nome;
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(memoria.email)) corpo.email = memoria.email;

      var bolha = el("div", "msg minha", texto);
      lista.appendChild(bolha);
      campo.value = "";
      rolar();
      enviar.disabled = true;

      function falhou(frase) {
        bolha.className = "msg minha falhou";
        lista.appendChild(el("div", "nota", frase));
        campo.value = texto;
        rolar();
      }
      pedir("/enviar", corpo)
        .then(function (r) {
          if (r.ok) {
            // O id do servidor marca a bolha como já vista — a leitura não a repete.
            if (r.corpo.data && r.corpo.data.id) vistas[r.corpo.data.id] = true;
            if (pedeNome) {
              pedeNome = false;
              if (campoNome.parentNode) form.removeChild(campoNome);
              if (campoEmail.parentNode) form.removeChild(campoEmail);
            }
          } else if (r.status === 410) {
            recomecar();
            campo.value = texto;
            lista.appendChild(el("div", "nota", "Sua conversa anterior foi encerrada. Envie de novo para começar outra."));
          } else if (r.status === 429) {
            falhou("Muitas mensagens seguidas. Aguarde um pouco e tente de novo.");
          } else {
            falhou("Não foi possível enviar. Tente de novo.");
          }
        })
        .catch(function () {
          falhou("Sem conexão. Tente de novo.");
        })
        .then(function () {
          enviar.disabled = false;
          campo.focus();
        });
    });

    // Quem já conversou antes recebe o histórico (e o aviso de resposta nova).
    ler().then(agendar);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) ler();
    });
  }

  function comecar() {
    pedir("", null)
      .then(function (r) {
        if (r.ok && r.corpo.data) montar(r.corpo.data);
      })
      .catch(function () {
        /* sem resposta: o site segue sem o balão */
      });
  }
  if (document.body) comecar();
  else document.addEventListener("DOMContentLoaded", comecar);
})();
