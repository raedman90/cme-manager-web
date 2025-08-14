export type MedicalCatalogItem = {
  name: string;
  synonyms?: string[];
  defaultCode?: string;
  description?: string;
};

export const MEDICAL_CATALOG: MedicalCatalogItem[] = [
  { name: "Teste2", synonyms: ["teste2"], description: "teste2 teste2" },
  { name: "Teste1", synonyms: ["teste1"], description: "teste1 teste1" },
  { name: "Tesoura Metzenbaum 14cm", synonyms: ["tesoura metz"], description: "Tesoura cirúrgica Metzenbaum 14cm" },
  { name: "Tesoura Mayo 14cm", description: "Tesoura cirúrgica Mayo 14cm" },
  { name: "Pinça Kelly 14cm", synonyms: ["kelly", "pinça hemostática"], description: "Pinça hemostática Kelly 14cm" },
  { name: "Pinça Crile 14cm", description: "Pinça hemostática Crile 14cm" },
  { name: "Pinça Kocher 14cm", description: "Pinça hemostática Kocher 14cm" },
  { name: "Pinça Backhaus 13cm", synonyms: ["backhaus"], description: "Pinça Backhaus 13cm" },
  { name: "Pinça Adson com Dente", synonyms: ["adson dente"], description: "Pinça Adson com dente" },
  { name: "Pinça Adson sem Dente", synonyms: ["adson sem dente"], description: "Pinça Adson sem dente" },
  { name: "Pinça Anatômica 16cm", description: "Pinça anatômica 16cm" },
  { name: "Pinça Dissecção 16cm", description: "Pinça de dissecção 16cm" },
  { name: "Porta Agulha Mayo-Hegar 16cm", synonyms: ["porta agulha"], description: "Porta agulha Mayo-Hegar 16cm" },
  { name: "Afastador Farabeuf (par)", synonyms: ["farabeuf"], description: "Afastador Farabeuf – par" },
  { name: "Afastador Balfour", description: "Afastador Balfour" },
  { name: "Cuba Rim 700ml", synonyms: ["cuba rim"], description: "Cuba rim 700 ml" },
  { name: "Cureta Volkmann", description: "Cureta Volkmann" },
  { name: "Pinça Allis 15cm", description: "Pinça Allis 15cm" },
  { name: "Pinça Foerster 24cm", description: "Pinça Foerster 24cm" },
  { name: "Pinça Pean 14cm", description: "Pinça Pean 14cm" },
  { name: "Seringa 10ml", description: "Seringa 10 ml" },
  { name: "Seringa 20ml", description: "Seringa 20 ml" },
  { name: "Compressa Gaze 7,5x7,5", synonyms: ["gaze"], description: "Compressa de gaze 7,5 x 7,5 cm" },
];