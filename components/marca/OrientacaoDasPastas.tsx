// A orientação ao cliente sobre as pastas da marca (CEO, 03/10/2026).
// O cliente é leigo: a regra é UMA — jogar a foto na pasta certa. Nada de
// renomear, descrever, converter. No máximo 6 linhas, sem termo técnico.
// O texto mora AQUI, uma vez, e aparece no painel e no portal.

export const LINHAS_DA_ORIENTACAO = [
  "Crie uma pasta com o nome da sua marca e, dentro dela, estas pastas:",
  "Logos e Brand book: seu logo e o manual da marca, se tiver.",
  "Fotos de produto: seus pratos e produtos. Fotos de ambiente: salão, fachada, equipe.",
  "Prontos para postar: artes e vídeos que podem sair como estão, até posts antigos. Referências: só inspiração, nunca é publicado.",
  "Entrada de material: novidades e lançamentos, para entrar logo na agenda.",
  "Não precisa renomear nada: é só colocar cada foto na pasta certa.",
] as const;

export function OrientacaoDasPastas() {
  return (
    <ul className="mt-3 space-y-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
      {LINHAS_DA_ORIENTACAO.map((linha) => (
        <li key={linha}>{linha}</li>
      ))}
    </ul>
  );
}
