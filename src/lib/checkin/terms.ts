// PAR-Q e Termo de Responsabilidade (fonte: termo-de-responsabilidade.pdf), adaptados por inscrição:
// o nome do evento vem da competição do atleta, a categoria vem da inscrição e a assinatura
// via GOV.BR foi substituída por assinatura na tela com confirmação por e-mail (decisão de 02/11/2026).
// Qualquer mudança de texto exige nova TERMS_VERSION: o check-in guarda o texto aceito.

import type { Competition } from "./sheet";

export const TERMS_VERSION = "2026-11-02.1";

export const COMPETITION_LABEL: Record<Competition, string> = {
  "hibrido-games": "Híbrido Games",
  "hibrido-race": "Híbrido Race",
};

export const EVENT_YEAR = 2026;

export const competitionTitle = (c: Competition) => `${COMPETITION_LABEL[c]} ${EVENT_YEAR}`;

export const PARQ_QUESTIONS = [
  "Algum médico já disse que você possui algum problema de coração ou pressão arterial e que somente deveria realizar atividade física sob supervisão de profissionais de saúde?",
  "Você sente dores no peito quando pratica atividade física?",
  "No último mês, você sentiu dores no peito ao praticar atividade física?",
  "Você apresenta algum desequilíbrio devido à tontura e/ou perda momentânea da consciência?",
  "Você possui algum problema ósseo ou articular que pode ser afetado ou agravado pela atividade física?",
  "Você toma atualmente algum tipo de medicação de uso contínuo?",
  "Você realiza algum tipo de tratamento médico para pressão arterial ou problemas cardíacos?",
  "Você realiza algum tratamento médico contínuo que possa ser afetado ou prejudicado com a atividade física?",
  "Você já se submeteu a algum tipo de cirurgia que comprometa de alguma forma a atividade física?",
  "Sabe de alguma outra razão pela qual a atividade física possa eventualmente comprometer sua saúde?",
] as const;

export const PARQ_INTRO =
  "Este questionário tem por objetivo identificar a necessidade de avaliação médica antes do início ou do aumento do nível de atividade física. Assinale “Sim” ou “Não” em todas as perguntas.";

export type TermsSection = { title: string; articles: { n: string; text: string }[] };

/** Seções 3 a 10 do termo, com o nome da competição do atleta. */
export function termsSections(competition: Competition): TermsSection[] {
  const ev = competitionTitle(competition);
  return [
    {
      title: "Declaração de participação e aptidão",
      articles: [
        { n: "1º", text: `Declaro que participo do ${ev} por livre e espontânea vontade, após conhecer a natureza, o formato e o nível de exigência da competição em que estou inscrito(a).` },
        { n: "2º", text: "Declaro que respondi de forma verdadeira e completa às perguntas do PAR-Q constante neste documento. Caso tenha respondido negativamente a todas as perguntas, declaro não possuir limitação de saúde conhecida que impeça a prática da atividade. Caso tenha respondido positivamente a qualquer pergunta, comprometo-me a apresentar atestado médico de aptidão antes da participação." },
        { n: "3º", text: "Comprometo-me a não iniciar minha participação, ou a interrompê-la caso já tenha começado, se apresentar dor, mal-estar, tontura, dificuldade respiratória, lesão ou qualquer sinal incompatível com a continuidade segura da atividade." },
        { n: "4º", text: "Reconheço que a direção de prova e os profissionais de saúde poderão impedir minha largada ou determinar a interrupção da minha participação quando identificarem risco à minha integridade ou à de terceiros." },
      ],
    },
    {
      title: "Responsabilidade na prática esportiva",
      articles: [
        { n: "5º", text: "Estou ciente de que a participação na competição exige esforço físico, atenção e cumprimento das orientações de segurança. Comprometo-me a respeitar meus limites, utilizar corretamente os equipamentos e comunicar imediatamente qualquer condição que possa comprometer minha participação segura." },
        { n: "6º", text: "Declaro que compreendo esses riscos e assumo a responsabilidade por minha decisão de participar, por respeitar meus limites, utilizar corretamente os equipamentos e cumprir o regulamento, os briefings, a sinalização, as orientações de árbitros, staff, segurança e equipe de saúde." },
        { n: "7º", text: "A presente declaração refere-se aos riscos inerentes e razoavelmente esperados da prática esportiva e não afasta responsabilidades atribuídas pela legislação aplicável à organização, aos fornecedores ou a terceiros." },
      ],
    },
    {
      title: "Atendimento de emergência",
      articles: [
        { n: "8º", text: "Autorizo a equipe de primeiros socorros a realizar avaliação e atendimento emergencial e, quando necessário, a providenciar minha remoção por ambulância para unidade da rede pública de saúde ou outro serviço indicado conforme a situação." },
        { n: "9º", text: "Estou ciente de que o atendimento médico posterior à remoção será prestado sob responsabilidade da unidade de destino. Eu ou meu responsável poderemos optar por atendimento particular, assumindo as despesas e providências correspondentes." },
        { n: "10º", text: "Autorizo o compartilhamento das informações estritamente necessárias com profissionais de saúde, serviço de remoção e contato de emergência para proteção da minha vida e integridade física." },
      ],
    },
    {
      title: "Bens e equipamentos pessoais",
      articles: [
        { n: "11º", text: "Sou responsável pela guarda de meus objetos, equipamentos e acessórios pessoais. A organização não se responsabiliza por perda, furto, extravio ou dano, salvo quando houver responsabilidade legalmente atribuível à própria organização." },
      ],
    },
    {
      title: "Regulamento e conduta",
      articles: [
        { n: "12º", text: `Declaro que li e aceito o Regulamento Oficial do ${ev} e seus comunicados complementares, comprometendo-me a cumprir as regras da categoria escolhida, padrões de movimento, fluxo de prova, horários, critérios de arbitragem, segurança e conduta.` },
        { n: "13º", text: "Estou ciente de que o descumprimento das regras, fraude, auxílio externo indevido, conduta antidesportiva, agressão, ameaça, discriminação, assédio, vandalismo ou desrespeito poderá resultar nas penalidades previstas, inclusive desclassificação e retirada do evento." },
      ],
    },
    {
      title: "Uso de imagem e voz",
      articles: [
        { n: "14º", text: `Autorizo, de forma gratuita, a captação e utilização da minha imagem, voz e nome em fotografias e vídeos produzidos durante o ${ev}, para registro e divulgação institucional, jornalística e promocional do evento, da organização e de seus parceiros, em redes sociais, sites, imprensa, transmissões e materiais físicos ou digitais, sem uso que atente contra minha honra, dignidade ou reputação.` },
        { n: "15º", text: "Esta autorização não permite uso da minha imagem para finalidade estranha ao evento. Solicitações relacionadas ao uso de imagem e aos direitos sobre dados pessoais poderão ser encaminhadas pelos canais oficiais da organização, preservados os materiais já utilizados de forma legítima e os registros de interesse histórico, jornalístico ou de exercício regular de direitos, quando aplicável." },
      ],
    },
    {
      title: "Dados pessoais",
      articles: [
        { n: "16º", text: "Estou ciente de que meus dados pessoais serão tratados para inscrição, identificação, comunicação, segurança, atendimento emergencial, cronometragem, classificação, premiação, registro do evento e cumprimento de obrigações legais, conforme a legislação aplicável e a política de privacidade informada pela organização." },
        { n: "17º", text: "Dados de saúde eventualmente informados serão utilizados apenas quando necessários à segurança, ao atendimento emergencial ou ao exercício regular de direitos, com acesso restrito aos responsáveis pela finalidade correspondente." },
      ],
    },
    {
      title: "Participante menor de 18 anos",
      articles: [
        { n: "18º", text: "Quando o participante for menor de 18 anos, este termo deverá ser lido e assinado também por seu pai, mãe ou responsável legal, que autoriza sua participação, declara ciência das exigências e dos riscos da categoria escolhida e confirma a veracidade das informações fornecidas." },
      ],
    },
  ];
}

export const IMAGE_CONSENT_TEXT = "Li e autorizo o uso da minha imagem, voz e nome, conforme os Arts. 14º e 15º deste termo.";

export const FINAL_DECLARATION =
  "Declaro que li integralmente este PAR-Q e Termo de Responsabilidade, tive oportunidade de esclarecer dúvidas, compreendi seu conteúdo e forneci informações verdadeiras. Confirmo que todos os campos e respostas foram preenchidos antes da assinatura eletrônica.";

export const SIGNATURE_NOTE =
  "Assinatura eletrônica: após o preenchimento integral, o participante assina na tela do próprio aparelho, depois de confirmar sua identidade com o código enviado ao e-mail da inscrição. Quando o participante for menor de 18 anos, o responsável legal também assina. A data, a hora, o e-mail confirmado e o aparelho utilizado ficam registrados.";

export const MEDICAL_CERTIFICATE_NOTE =
  "Para participar, cada atleta anexa o próprio atestado médico de aptidão para atividade física (nas duplas, um por integrante).";

/** Texto integral aceito, guardado no check-in (snapshot). */
export function termsSnapshot(competition: Competition, category: string) {
  const lines = [
    `PAR-Q E TERMO DE RESPONSABILIDADE — ${competitionTitle(competition).toUpperCase()}`,
    `Versão ${TERMS_VERSION}`,
    `Competição e categoria: ${COMPETITION_LABEL[competition]} — ${category}`,
    "",
    "QUESTIONÁRIO DE PRONTIDÃO PARA ATIVIDADE FÍSICA — PAR-Q",
    PARQ_INTRO,
    ...PARQ_QUESTIONS.map((q, i) => `${i + 1}. ${q}`),
    "",
    MEDICAL_CERTIFICATE_NOTE,
  ];
  for (const section of termsSections(competition)) {
    lines.push("", section.title.toUpperCase(), ...section.articles.map((a) => `Art. ${a.n}. ${a.text}`));
  }
  lines.push("", IMAGE_CONSENT_TEXT, "", "DECLARAÇÃO FINAL E ASSINATURA ELETRÔNICA", FINAL_DECLARATION, SIGNATURE_NOTE);
  return lines.join("\n");
}
