/**
 * Apoiadores do evento, na ordem em que aparecem na faixa da home.
 * As imagens ficam em `public/patrocinadores/`. Quando o original contém
 * margens transparentes, `visibleBounds` delimita a marca sem alterar o arquivo.
 *
 * `displayWidth` é a largura em px no celular. Cada logo tem a sua para
 * equilibrar o peso visual de símbolos verticais e assinaturas horizontais.
 * Sem `href` por enquanto: as logos não são clicáveis.
 */
export type Sponsor = {
  name: string;
  src: string;
  /** Tamanho real do arquivo, em px. */
  width: number;
  height: number;
  displayWidth: number;
  /** Área visível em pixels do original, incluindo toda a assinatura. */
  visibleBounds?: { x: number; y: number; width: number; height: number };
};

export const sponsors: readonly Sponsor[] = [
  { name: "Fuego Glasses", src: "/patrocinadores/fuego.png", width: 282, height: 324, displayWidth: 48 },
  { name: "FitBlock Training", src: "/patrocinadores/fitblock.png", width: 550, height: 250, displayWidth: 76 },
  { name: "VUPT Gráfica Rápida", src: "/patrocinadores/vupt.png", width: 602, height: 162, displayWidth: 112 },
  { name: "Roval Farmácia de Manipulação", src: "/patrocinadores/roval.png", width: 552, height: 190, displayWidth: 100 },
  { name: "BSCross", src: "/patrocinadores/bscross.png", width: 530, height: 136, displayWidth: 118 },
  { name: "Sidore", src: "/patrocinadores/sidore.png", width: 532, height: 136, displayWidth: 108 },
  {
    name: "Bárbaros Store",
    src: "/patrocinadores/barbaros.png",
    width: 1080,
    height: 1920,
    displayWidth: 48,
    visibleBounds: { x: 234, y: 458, width: 598, height: 858 },
  },
  { name: "Fernanda Maia Odontologia e Estética", src: "/patrocinadores/fernanda-maia.png", width: 902, height: 291, displayWidth: 116 },
];
