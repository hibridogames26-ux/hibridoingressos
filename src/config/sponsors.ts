/**
 * Apoiadores do evento, na ordem em que aparecem na faixa da home.
 * As imagens ficam em `public/patrocinadores/`, recortadas sem margem vazia
 * (os originais estão em `patrocinadores/`, fora do app).
 *
 * `displayWidth` é a largura em px no celular. Cada logo tem a sua para que
 * nenhuma pareça maior que as outras (a Fuego é quase quadrada; as demais, largas).
 * Sem `href` por enquanto: as logos não são clicáveis.
 */
export type Sponsor = {
  name: string;
  src: string;
  /** Tamanho real do arquivo, em px. */
  width: number;
  height: number;
  displayWidth: number;
};

export const sponsors: readonly Sponsor[] = [
  { name: "Fuego Glasses", src: "/patrocinadores/fuego.png", width: 282, height: 324, displayWidth: 44 },
  { name: "FitBlock Training", src: "/patrocinadores/fitblock.png", width: 550, height: 250, displayWidth: 84 },
  { name: "VUPT Gráfica Rápida", src: "/patrocinadores/vupt.png", width: 602, height: 162, displayWidth: 112 },
  { name: "Roval Farmácia de Manipulação", src: "/patrocinadores/roval.png", width: 552, height: 190, displayWidth: 100 },
  { name: "BSCross", src: "/patrocinadores/bscross.png", width: 530, height: 136, displayWidth: 122 },
  { name: "Sidore", src: "/patrocinadores/sidore.png", width: 532, height: 136, displayWidth: 110 },
];
