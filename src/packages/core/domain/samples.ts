import type { OptionTemplate } from "./options";
import type { Language } from "./store";

/**
 * Sample products per industry, so the store does not start empty. They are data, not rules: the use case
 * loads them with fixed ids (`ejemplo-…`), so loading twice duplicates nothing and they can all be deleted
 * together. Photos come from Wikimedia Commons and live in the app's `public/samples/`; the credit
 * (author, license, source) goes at the end of each product description.
 * The `ejemplo-` prefix and the industry and item keys (`pasteleria`, `torta-de-chocolate`, ...) are part of
 * the ids stored in D1 and of the photo paths: they stay in Spanish.
 */
export const SAMPLE_INDUSTRIES = ["pasteleria", "ropa", "almacen", "artesanias"] as const;
export type SampleIndustry = (typeof SAMPLE_INDUSTRIES)[number];

type LocalizedText = Readonly<Record<Language, string>>;
export type SamplePhoto = { readonly author: string; readonly license: string; readonly source: string };
export type SampleProduct = {
  readonly key: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  /** In ARS cents. */
  readonly price: number;
  readonly photo: SamplePhoto;
  /** Its own variants instead of the category's (empty: none). */
  readonly options?: readonly SampleOption[];
};
export type SampleOption = {
  readonly name: LocalizedText;
  readonly values: readonly { readonly label: LocalizedText; readonly priceDelta: number }[];
};
export type SampleCategory = {
  readonly key: string;
  readonly name: LocalizedText;
  /** Variant templates of the category: its products are created with them. */
  readonly options?: readonly SampleOption[];
  readonly products: readonly SampleProduct[];
};
export type Industry = { readonly name: LocalizedText; readonly categories: readonly SampleCategory[] };

export const SAMPLE_CURRENCY = "ARS";
const PREFIX = "ejemplo-";

export const sampleCategoryId = (industry: SampleIndustry, key: string) => `${PREFIX}${industry}-${key}`;
export const sampleProductId = (industry: SampleIndustry, key: string) => `${PREFIX}${industry}-${key}`;
/** Path of the photo's static asset (the app serves it from `public/`). */
export const samplePhotoPath = (industry: SampleIndustry, key: string) => `/samples/${industry}/${key}.webp`;

/** Variants in the store's language (templates: without ids). */
export const sampleOptions = (options: readonly SampleOption[], language: Language): OptionTemplate[] =>
  options.map((o) => ({
    name: o.name[language],
    values: o.values.map((v) => ({ label: v.label[language], priceDelta: v.priceDelta })),
  }));

const PHOTO_LABEL: LocalizedText = { es: "Foto", en: "Photo", pt: "Foto" };

/** The product description with the photo credit at the end. */
export const sampleDescription = (p: SampleProduct, language: Language): string =>
  `${p.description[language]}\n\n${PHOTO_LABEL[language]}: ${p.photo.author} (${p.photo.license}), ${p.photo.source}`;

export const SAMPLE_CATALOG: Readonly<Record<SampleIndustry, Industry>> = {
  pasteleria: {
    name: { es: "Pastelería", en: "Bakery", pt: "Confeitaria" },
    categories: [
      {
        key: "tortas",
        name: { es: "Tortas", en: "Cakes", pt: "Bolos" },
        options: [
          {
            name: { es: "Relleno", en: "Filling", pt: "Recheio" },
            values: [
              { label: { es: "Dulce de leche", en: "Dulce de leche", pt: "Doce de leite" }, priceDelta: 0 },
              { label: { es: "Chocolate", en: "Chocolate", pt: "Chocolate" }, priceDelta: 0 },
              {
                label: { es: "Crema y frutillas", en: "Cream and strawberries", pt: "Creme e morangos" },
                priceDelta: 300000,
              },
            ],
          },
          {
            name: { es: "Cobertura", en: "Frosting", pt: "Cobertura" },
            values: [
              { label: { es: "Ganache", en: "Ganache", pt: "Ganache" }, priceDelta: 0 },
              {
                label: { es: "Merengue italiano", en: "Italian meringue", pt: "Merengue italiano" },
                priceDelta: 0,
              },
              { label: { es: "Crema chantilly", en: "Whipped cream", pt: "Chantilly" }, priceDelta: 0 },
            ],
          },
        ],
        products: [
          {
            key: "torta-de-chocolate",
            name: { es: "Torta de chocolate", en: "Chocolate cake", pt: "Bolo de chocolate" },
            description: {
              es: "Bizcochuelo húmedo de cacao con relleno y cobertura de ganache. Para 12 porciones.",
              en: "Moist cocoa sponge with ganache filling and frosting. Serves 12.",
              pt: "Pão de ló úmido de cacau com recheio e cobertura de ganache. Rende 12 fatias.",
            },
            price: 2_800_000,
            photo: {
              author: "Abhinav Goswami",
              license: "CC0",
              source: "https://commons.wikimedia.org/wiki/File:Sliced_chocolate_cake.jpg",
            },
          },
          {
            key: "cheesecake",
            options: [
              {
                name: { es: "Cobertura", en: "Topping", pt: "Cobertura" },
                values: [
                  { label: { es: "Frutos rojos", en: "Berries", pt: "Frutas vermelhas" }, priceDelta: 0 },
                  { label: { es: "Maracuyá", en: "Passion fruit", pt: "Maracujá" }, priceDelta: 0 },
                  {
                    label: { es: "Dulce de leche", en: "Dulce de leche", pt: "Doce de leite" },
                    priceDelta: 0,
                  },
                ],
              },
            ],
            name: {
              es: "Cheesecake de frutos rojos",
              en: "Berry cheesecake",
              pt: "Cheesecake de frutas vermelhas",
            },
            description: {
              es: "Base de galletitas, crema de queso horneada y salsa de frutos rojos.",
              en: "Cookie crust, baked cream cheese filling and berry sauce.",
              pt: "Base de biscoito, creme de queijo assado e calda de frutas vermelhas.",
            },
            price: 3_200_000,
            photo: {
              author: "Rexness",
              license: "CC BY-SA 2.0",
              source: "https://commons.wikimedia.org/wiki/File:Berry_Cheesecake_(7263633496).jpg",
            },
          },
          {
            key: "lemon-pie",
            options: [],
            name: { es: "Lemon pie", en: "Lemon meringue pie", pt: "Torta de limão" },
            description: {
              es: "Masa sablée, crema de limón y merengue italiano dorado.",
              en: "Shortcrust pastry, lemon curd and toasted Italian meringue.",
              pt: "Massa sablée, creme de limão e merengue italiano maçaricado.",
            },
            price: 2_500_000,
            photo: {
              author: "PDPhoto.org",
              license: "Public domain",
              source: "https://commons.wikimedia.org/wiki/File:A_Lemon_Meringue_Tart.jpg",
            },
          },
        ],
      },
      {
        key: "facturas",
        name: { es: "Facturas y medialunas", en: "Pastries", pt: "Folhados" },
        products: [
          {
            key: "medialunas",
            name: {
              es: "Medialunas de manteca (docena)",
              en: "Butter croissants (dozen)",
              pt: "Croissants de manteiga (dúzia)",
            },
            description: {
              es: "Hojaldradas y almibaradas, recién horneadas cada mañana.",
              en: "Flaky and glazed, freshly baked every morning.",
              pt: "Folhados e pincelados com calda, assados toda manhã.",
            },
            price: 900_000,
            photo: {
              author: "Ezarate",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:MediasLunasenMardelPlata.jpg",
            },
          },
        ],
      },
      {
        key: "galletitas",
        name: { es: "Alfajores y galletitas", en: "Cookies and alfajores", pt: "Alfajores e biscoitos" },
        options: [
          {
            name: { es: "Cobertura", en: "Coating", pt: "Cobertura" },
            values: [
              { label: { es: "Clásica", en: "Classic", pt: "Clássica" }, priceDelta: 0 },
              {
                label: { es: "Bañada en chocolate", en: "Chocolate-dipped", pt: "Banhada no chocolate" },
                priceDelta: 100000,
              },
              { label: { es: "Glaseada", en: "Glazed", pt: "Glaçada" }, priceDelta: 0 },
            ],
          },
        ],
        products: [
          {
            key: "alfajores",
            name: {
              es: "Alfajores de maicena (x6)",
              en: "Cornstarch alfajores (6 pack)",
              pt: "Alfajores de maisena (6 un.)",
            },
            description: {
              es: "Rellenos de dulce de leche y con coco rallado en el borde.",
              en: "Filled with dulce de leche and rolled in shredded coconut.",
              pt: "Recheados com doce de leite e coco ralado na borda.",
            },
            price: 750_000,
            photo: {
              author: "Sara McCleary",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Alfajores-de-maicena-biscuits-recipe.jpg",
            },
          },
          {
            key: "cookies",
            name: {
              es: "Cookies con chips de chocolate (x6)",
              en: "Chocolate chip cookies (6 pack)",
              pt: "Cookies com gotas de chocolate (6 un.)",
            },
            description: {
              es: "Crocantes por fuera y tiernas por dentro, con chips de chocolate semiamargo.",
              en: "Crisp outside, chewy inside, with dark chocolate chips.",
              pt: "Crocantes por fora e macios por dentro, com gotas de chocolate meio amargo.",
            },
            price: 600_000,
            photo: {
              author: "Evan-Amos",
              license: "Public domain",
              source: "https://commons.wikimedia.org/wiki/File:Choc-Chip-Cookie.jpg",
            },
          },
        ],
      },
    ],
  },
  ropa: {
    name: { es: "Ropa", en: "Clothing", pt: "Roupas" },
    categories: [
      {
        key: "remeras-y-buzos",
        name: { es: "Remeras y buzos", en: "Tees and sweatshirts", pt: "Camisetas e moletons" },
        options: [
          {
            name: { es: "Talle", en: "Size", pt: "Tamanho" },
            values: [
              { label: { es: "S", en: "S", pt: "P" }, priceDelta: 0 },
              { label: { es: "M", en: "M", pt: "M" }, priceDelta: 0 },
              { label: { es: "L", en: "L", pt: "G" }, priceDelta: 0 },
              { label: { es: "XL", en: "XL", pt: "GG" }, priceDelta: 0 },
            ],
          },
          {
            name: { es: "Color", en: "Color", pt: "Cor" },
            values: [
              { label: { es: "Blanco", en: "White", pt: "Branco" }, priceDelta: 0 },
              { label: { es: "Negro", en: "Black", pt: "Preto" }, priceDelta: 0 },
              { label: { es: "Gris melange", en: "Heather gray", pt: "Cinza mescla" }, priceDelta: 0 },
            ],
          },
        ],
        products: [
          {
            key: "remera",
            name: { es: "Remera de algodón", en: "Cotton T-shirt", pt: "Camiseta de algodão" },
            description: {
              es: "Algodón peinado, corte recto. Talles S a XXL.",
              en: "Combed cotton, regular fit. Sizes S to XXL.",
              pt: "Algodão penteado, corte reto. Tamanhos P ao GG.",
            },
            price: 1_800_000,
            photo: {
              author: "THOR",
              license: "CC BY 2.0",
              source:
                "https://commons.wikimedia.org/wiki/File:Ringflash_Tshirt_Blank_Template_(3214240974).jpg",
            },
          },
          {
            key: "buzo",
            name: { es: "Buzo de frisa", en: "Crewneck sweatshirt", pt: "Moletom careca" },
            description: {
              es: "Frisa invernal, cuello redondo y puños elastizados.",
              en: "Brushed fleece, crew neck and ribbed cuffs.",
              pt: "Moletom flanelado, gola redonda e punhos com elástico.",
            },
            price: 3_800_000,
            photo: {
              author: "Tisahd 23 HAOEYVMA",
              license: "CC BY-SA 4.0",
              source:
                "https://commons.wikimedia.org/wiki/File:HK_TKO_%E5%B0%87%E8%BB%8D%E6%BE%B3_Tseung_Kwan_O_PopCorn_mall_shop_Uniqlo_Clothing_Store_%E5%86%AC%E5%AD%A3_winter_December_2022_Px3_01.jpg",
            },
          },
        ],
      },
      {
        key: "pantalones",
        name: { es: "Pantalones", en: "Pants", pt: "Calças" },
        options: [
          {
            name: { es: "Talle", en: "Size", pt: "Tamanho" },
            values: [
              { label: { es: "38", en: "28", pt: "38" }, priceDelta: 0 },
              { label: { es: "40", en: "30", pt: "40" }, priceDelta: 0 },
              { label: { es: "42", en: "32", pt: "42" }, priceDelta: 0 },
              { label: { es: "44", en: "34", pt: "44" }, priceDelta: 0 },
              { label: { es: "46", en: "36", pt: "46" }, priceDelta: 0 },
            ],
          },
        ],
        products: [
          {
            key: "jean",
            name: { es: "Jean clásico", en: "Classic jeans", pt: "Calça jeans clássica" },
            description: {
              es: "Denim rígido de calce recto, cinco bolsillos.",
              en: "Rigid denim, straight fit, five pockets.",
              pt: "Jeans rígido de corte reto, cinco bolsos.",
            },
            price: 4_500_000,
            photo: {
              author: "Autor desconocido (DigitaltMuseum, digitaltmuseum.se/011023811372)",
              license: "CC BY-SA 4.0",
              source:
                "https://commons.wikimedia.org/wiki/File:Slitna_jeans_f%C3%B6r_m%C3%A4n_i_bomull_med_lagade_med_sick-sacks%C3%B6m_p%C3%A5_kn%C3%A4na._032s8YepsD7C.jpg",
            },
          },
        ],
      },
      {
        key: "abrigo",
        name: { es: "Abrigo", en: "Outerwear", pt: "Agasalhos" },
        products: [
          {
            key: "campera",
            name: { es: "Campera de jean", en: "Denim jacket", pt: "Jaqueta jeans" },
            description: {
              es: "Denim lavado, botones metálicos y dos bolsillos al pecho.",
              en: "Washed denim, metal buttons and two chest pockets.",
              pt: "Jeans lavado, botões de metal e dois bolsos no peito.",
            },
            price: 7_500_000,
            photo: {
              author: "NikosLikomitros",
              license: "CC0",
              source: "https://commons.wikimedia.org/wiki/File:Jean_jacket.jpg",
            },
          },
          {
            key: "gorro-de-lana",
            name: { es: "Gorro de lana", en: "Wool beanie", pt: "Gorro de lã" },
            description: {
              es: "Tejido a mano en lana de oveja. Talle único.",
              en: "Hand-knitted from sheep's wool. One size.",
              pt: "Tricotado à mão em lã de ovelha. Tamanho único.",
            },
            price: 1_500_000,
            photo: {
              author:
                "Robert Lender from Vienna, Austria, postprocessed by Rosso Robot (cropped, colors enhanced).",
              license: "CC BY-SA 2.0",
              source: "https://commons.wikimedia.org/wiki/File:Blue_knit-cap_beanie_by_RobertLender.jpeg",
            },
          },
          {
            key: "bufanda",
            name: { es: "Bufanda tejida", en: "Knitted scarf", pt: "Cachecol de tricô" },
            description: {
              es: "Larga y suave, en punto elástico.",
              en: "Long and soft, rib knit.",
              pt: "Comprido e macio, em ponto canelado.",
            },
            price: 1_700_000,
            photo: {
              author: "Missouri Historical Society (vía Digital Public Library of America)",
              license: "Public domain",
              source:
                "https://commons.wikimedia.org/wiki/File:Small_Homemade_Knitted_Scarf_-_DPLA_-_fcde1f6bb3c41863d0b2f99f6d5379b3_(page_1).jpg",
            },
          },
        ],
      },
    ],
  },
  almacen: {
    name: { es: "Almacén", en: "Grocery", pt: "Mercearia" },
    categories: [
      {
        key: "despensa",
        name: { es: "Despensa", en: "Pantry", pt: "Despensa" },
        products: [
          {
            key: "miel",
            name: { es: "Miel pura (1 kg)", en: "Pure honey (1 kg)", pt: "Mel puro (1 kg)" },
            description: {
              es: "Miel multifloral de productores locales.",
              en: "Wildflower honey from local beekeepers.",
              pt: "Mel silvestre de apicultores locais.",
            },
            price: 900_000,
            photo: {
              author: "Marcobeltrametti",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Honey_miele.jpg",
            },
          },
          {
            key: "aceite-de-oliva",
            name: {
              es: "Aceite de oliva extra virgen (500 ml)",
              en: "Extra virgin olive oil (500 ml)",
              pt: "Azeite extravirgem (500 ml)",
            },
            description: {
              es: "Primera prensada en frío.",
              en: "First cold pressed.",
              pt: "Primeira prensagem a frio.",
            },
            price: 1_200_000,
            photo: {
              author: "margenauer from Pixabay",
              license: "CC0",
              source: "https://commons.wikimedia.org/wiki/File:Bottle_of_olive_oil.jpg",
            },
          },
          {
            key: "dulce-de-leche",
            name: {
              es: "Dulce de leche (400 g)",
              en: "Dulce de leche (400 g)",
              pt: "Doce de leite (400 g)",
            },
            description: {
              es: "Clásico, cremoso, ideal para untar.",
              en: "Classic and creamy, great for spreading.",
              pt: "Clássico e cremoso, ótimo para passar no pão.",
            },
            price: 450_000,
            photo: {
              author: "audinou from Paris, France",
              license: "CC BY 2.0",
              source: "https://commons.wikimedia.org/wiki/File:DulceDeLeche.jpg",
            },
          },
        ],
      },
      {
        key: "infusiones",
        name: { es: "Infusiones", en: "Coffee and mate", pt: "Café e mate" },
        products: [
          {
            key: "yerba-mate",
            name: { es: "Yerba mate (1 kg)", en: "Yerba mate (1 kg)", pt: "Erva-mate (1 kg)" },
            description: {
              es: "Con palo, estacionada naturalmente.",
              en: "With stems, naturally aged.",
              pt: "Com talos, envelhecida naturalmente.",
            },
            price: 650_000,
            photo: {
              author: "ChimaAddicted",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Erva_mate_chimarrao_in_big_cuia.jpg",
            },
          },
          {
            key: "cafe-en-grano",
            name: {
              es: "Café en grano (500 g)",
              en: "Whole bean coffee (500 g)",
              pt: "Café em grãos (500 g)",
            },
            description: {
              es: "Tostado medio, notas a chocolate y frutos secos.",
              en: "Medium roast with notes of chocolate and nuts.",
              pt: "Torra média, notas de chocolate e castanhas.",
            },
            price: 1_400_000,
            photo: {
              author: "A S M Jobaer",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans_in_a_jar._01.jpg",
            },
          },
        ],
      },
      {
        key: "frescos",
        name: { es: "Frescos", en: "Fresh", pt: "Frescos" },
        products: [
          {
            key: "huevos",
            name: {
              es: "Huevos de campo (docena)",
              en: "Free-range eggs (dozen)",
              pt: "Ovos caipiras (dúzia)",
            },
            description: {
              es: "De gallinas criadas a campo.",
              en: "From pasture-raised hens.",
              pt: "De galinhas criadas soltas.",
            },
            price: 380_000,
            photo: {
              author: "Krzysztof Golik",
              license: "CC BY-SA 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Egg_cartons_with_chicken_eggs_03.jpg",
            },
          },
        ],
      },
    ],
  },
  artesanias: {
    name: { es: "Artesanías", en: "Crafts", pt: "Artesanato" },
    categories: [
      {
        key: "ceramica",
        name: { es: "Cerámica", en: "Ceramics", pt: "Cerâmica" },
        options: [
          {
            name: { es: "Esmalte", en: "Glaze", pt: "Esmalte" },
            values: [
              { label: { es: "Natural", en: "Natural", pt: "Natural" }, priceDelta: 0 },
              { label: { es: "Blanco", en: "White", pt: "Branco" }, priceDelta: 0 },
              { label: { es: "Verde agua", en: "Seafoam", pt: "Verde-água" }, priceDelta: 0 },
            ],
          },
        ],
        products: [
          {
            key: "taza-de-ceramica",
            name: { es: "Taza de cerámica", en: "Ceramic mug", pt: "Caneca de cerâmica" },
            description: {
              es: "Torneada y esmaltada a mano. 300 ml.",
              en: "Wheel-thrown and hand-glazed. 300 ml.",
              pt: "Torneada e esmaltada à mão. 300 ml.",
            },
            price: 1_200_000,
            photo: {
              author: "Royal Oak Pottery",
              license: "CC BY 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Mug_(AM_10099-3).jpg",
            },
          },
          {
            key: "maceta-de-barro",
            options: [
              {
                name: { es: "Tamaño", en: "Size", pt: "Tamanho" },
                values: [
                  {
                    label: { es: "Chica (12 cm)", en: "Small (12 cm)", pt: "Pequeno (12 cm)" },
                    priceDelta: -500000,
                  },
                  {
                    label: { es: "Mediana (16 cm)", en: "Medium (16 cm)", pt: "Médio (16 cm)" },
                    priceDelta: 0,
                  },
                  {
                    label: { es: "Grande (22 cm)", en: "Large (22 cm)", pt: "Grande (22 cm)" },
                    priceDelta: 700000,
                  },
                ],
              },
            ],
            name: { es: "Maceta de barro", en: "Clay pot", pt: "Vaso de barro" },
            description: {
              es: "Terracota cocida, con orificio de drenaje.",
              en: "Fired terracotta with a drainage hole.",
              pt: "Terracota queimada, com furo de drenagem.",
            },
            price: 1_500_000,
            photo: {
              author: "Spnq",
              license: "CC BY-SA 4.0",
              source:
                "https://commons.wikimedia.org/wiki/File:Epipremnum_aureum_(Marble_Queen)_houseplant.png",
            },
          },
        ],
      },
      {
        key: "tejidos",
        name: { es: "Tejidos", en: "Weaving", pt: "Tecidos" },
        products: [
          {
            key: "canasta-tejida",
            name: { es: "Canasta de mimbre", en: "Wicker basket", pt: "Cesta de vime" },
            description: {
              es: "Mimbre trenzado a mano, con manija.",
              en: "Hand-woven wicker with a handle.",
              pt: "Vime trançado à mão, com alça.",
            },
            price: 2_200_000,
            photo: {
              author: "George Chernilevsky",
              license: "Public domain",
              source: "https://commons.wikimedia.org/wiki/File:Sweet_cherries_in_basket_2018_G1.jpg",
            },
          },
          {
            key: "manta-tejida",
            name: { es: "Manta tejida", en: "Woven blanket", pt: "Manta tecida" },
            description: {
              es: "Tejida en telar con lana natural. 1,5 × 2 m.",
              en: "Loom-woven natural wool. 1.5 × 2 m.",
              pt: "Tecida em tear com lã natural. 1,5 × 2 m.",
            },
            price: 4_800_000,
            photo: {
              author: "Catherine from Australia",
              license: "CC BY 2.0",
              source: "https://commons.wikimedia.org/wiki/File:Too_big..._(5706206759).jpg",
            },
          },
        ],
      },
      {
        key: "madera",
        name: { es: "Madera", en: "Woodwork", pt: "Madeira" },
        products: [
          {
            key: "tabla-de-madera",
            name: { es: "Tabla de madera", en: "Wooden board", pt: "Tábua de madeira" },
            description: {
              es: "Para picar o servir, terminada con aceite apto alimentos.",
              en: "For chopping or serving, finished with food-safe oil.",
              pt: "Para cortar ou servir, com acabamento de óleo atóxico.",
            },
            price: 2_000_000,
            photo: {
              author: "Fructibus",
              license: "CC0",
              source: "https://commons.wikimedia.org/wiki/File:Wooden_cutting_board_2017.jpg",
            },
          },
          {
            key: "cucharas-de-madera",
            name: {
              es: "Cuchara y espátula de madera",
              en: "Wooden spoon and spatula",
              pt: "Colher e espátula de madeira",
            },
            description: {
              es: "Talladas a mano en madera dura, para cocinar sin rayar.",
              en: "Hand-carved from hardwood, gentle on your pans.",
              pt: "Entalhadas à mão em madeira de lei, não riscam as panelas.",
            },
            price: 900_000,
            photo: {
              author: "Edukatori",
              license: "CC BY 4.0",
              source: "https://commons.wikimedia.org/wiki/File:Lug%C3%AB_druri.jpg",
            },
          },
        ],
      },
    ],
  },
};

export const isSampleIndustry = (value: string): value is SampleIndustry =>
  (SAMPLE_INDUSTRIES as readonly string[]).includes(value);
