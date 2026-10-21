import "./vitest.dom.setup";

/**
 * A suíte comercial é unitária: banco e provedores são dublados em cada teste.
 * Não ler arquivos de ambiente nem herdar os três acessos ao Supabase real.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-placeholder.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-placeholder-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-placeholder-service-role-key";

// Testes que verificam HTTP instalam seu próprio dublê de fetch. Uma chamada
// esquecida deve falhar imediatamente, sem DNS, auditoria ou pagamento externo.
globalThis.fetch = async () => {
  throw new TypeError("Rede real bloqueada na suíte unitária de planos.");
};
