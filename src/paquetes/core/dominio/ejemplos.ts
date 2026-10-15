import type { Idioma } from "./tienda";

/**
 * Productos de ejemplo por rubro, para que la tienda no arranque vacía. Son datos, no reglas: el caso de
 * uso los carga con ids fijos (`ejemplo-…`), así cargarlos dos veces no duplica nada y se pueden borrar
 * todos juntos. Las fotos son de Wikimedia Commons y viven en `public/ejemplos/` de la app; el crédito
 * (autor, licencia, fuente) va al final de la descripción de cada producto.
 */
export const RUBROS_DE_EJEMPLO = ["pasteleria", "ropa", "almacen", "artesanias"] as const;
export type RubroDeEjemplo = (typeof RUBROS_DE_EJEMPLO)[number];

type Texto = Readonly<Record<Idioma, string>>;
export type FotoDeEjemplo = { readonly autor: string; readonly licencia: string; readonly fuente: string };
export type ProductoDeEjemplo = {
  readonly clave: string;
  readonly nombre: Texto;
  readonly descripcion: Texto;
  /** En centavos de ARS. */
  readonly precio: number;
  readonly foto: FotoDeEjemplo;
};
export type CategoriaDeEjemplo = {
  readonly clave: string;
  readonly nombre: Texto;
  readonly productos: readonly ProductoDeEjemplo[];
};
export type Rubro = { readonly nombre: Texto; readonly categorias: readonly CategoriaDeEjemplo[] };

export const MONEDA_DE_EJEMPLO = "ARS";
const PREFIJO = "ejemplo-";

export const idDeCategoriaDeEjemplo = (rubro: RubroDeEjemplo, clave: string) => `${PREFIJO}${rubro}-${clave}`;
export const idDeProductoDeEjemplo = (rubro: RubroDeEjemplo, clave: string) => `${PREFIJO}${rubro}-${clave}`;
/** Ruta del asset estático de la foto (la app la sirve desde `public/`). */
export const rutaDeFotoDeEjemplo = (rubro: RubroDeEjemplo, clave: string) =>
  `/ejemplos/${rubro}/${clave}.webp`;

const ETIQUETA_FOTO: Texto = { es: "Foto", en: "Photo", pt: "Foto" };

/** La descripción del producto con el crédito de la foto al final. */
export const descripcionDeEjemplo = (p: ProductoDeEjemplo, idioma: Idioma): string =>
  `${p.descripcion[idioma]}\n\n${ETIQUETA_FOTO[idioma]}: ${p.foto.autor} (${p.foto.licencia}), ${p.foto.fuente}`;

export const CATALOGO_DE_EJEMPLO: Readonly<Record<RubroDeEjemplo, Rubro>> = {
  pasteleria: {
    nombre: { es: "Pastelería", en: "Bakery", pt: "Confeitaria" },
    categorias: [
      {
        clave: "tortas",
        nombre: { es: "Tortas", en: "Cakes", pt: "Bolos" },
        productos: [
          {
            clave: "torta-de-chocolate",
            nombre: { es: "Torta de chocolate", en: "Chocolate cake", pt: "Bolo de chocolate" },
            descripcion: {
              es: "Bizcochuelo húmedo de cacao con relleno y cobertura de ganache. Para 12 porciones.",
              en: "Moist cocoa sponge with ganache filling and frosting. Serves 12.",
              pt: "Pão de ló úmido de cacau com recheio e cobertura de ganache. Rende 12 fatias.",
            },
            precio: 2_800_000,
            foto: {
              autor: "Abhinav Goswami",
              licencia: "CC0",
              fuente: "https://commons.wikimedia.org/wiki/File:Sliced_chocolate_cake.jpg",
            },
          },
          {
            clave: "cheesecake",
            nombre: {
              es: "Cheesecake de frutos rojos",
              en: "Berry cheesecake",
              pt: "Cheesecake de frutas vermelhas",
            },
            descripcion: {
              es: "Base de galletitas, crema de queso horneada y salsa de frutos rojos.",
              en: "Cookie crust, baked cream cheese filling and berry sauce.",
              pt: "Base de biscoito, creme de queijo assado e calda de frutas vermelhas.",
            },
            precio: 3_200_000,
            foto: {
              autor: "Rexness",
              licencia: "CC BY-SA 2.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Berry_Cheesecake_(7263633496).jpg",
            },
          },
          {
            clave: "lemon-pie",
            nombre: { es: "Lemon pie", en: "Lemon meringue pie", pt: "Torta de limão" },
            descripcion: {
              es: "Masa sablée, crema de limón y merengue italiano dorado.",
              en: "Shortcrust pastry, lemon curd and toasted Italian meringue.",
              pt: "Massa sablée, creme de limão e merengue italiano maçaricado.",
            },
            precio: 2_500_000,
            foto: {
              autor: "PDPhoto.org",
              licencia: "Public domain",
              fuente: "https://commons.wikimedia.org/wiki/File:A_Lemon_Meringue_Tart.jpg",
            },
          },
        ],
      },
      {
        clave: "facturas",
        nombre: { es: "Facturas y medialunas", en: "Pastries", pt: "Folhados" },
        productos: [
          {
            clave: "medialunas",
            nombre: {
              es: "Medialunas de manteca (docena)",
              en: "Butter croissants (dozen)",
              pt: "Croissants de manteiga (dúzia)",
            },
            descripcion: {
              es: "Hojaldradas y almibaradas, recién horneadas cada mañana.",
              en: "Flaky and glazed, freshly baked every morning.",
              pt: "Folhados e pincelados com calda, assados toda manhã.",
            },
            precio: 900_000,
            foto: {
              autor: "Ezarate",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:MediasLunasenMardelPlata.jpg",
            },
          },
        ],
      },
      {
        clave: "galletitas",
        nombre: { es: "Alfajores y galletitas", en: "Cookies and alfajores", pt: "Alfajores e biscoitos" },
        productos: [
          {
            clave: "alfajores",
            nombre: {
              es: "Alfajores de maicena (x6)",
              en: "Cornstarch alfajores (6 pack)",
              pt: "Alfajores de maisena (6 un.)",
            },
            descripcion: {
              es: "Rellenos de dulce de leche y con coco rallado en el borde.",
              en: "Filled with dulce de leche and rolled in shredded coconut.",
              pt: "Recheados com doce de leite e coco ralado na borda.",
            },
            precio: 750_000,
            foto: {
              autor: "Sara McCleary",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Alfajores-de-maicena-biscuits-recipe.jpg",
            },
          },
          {
            clave: "cookies",
            nombre: {
              es: "Cookies con chips de chocolate (x6)",
              en: "Chocolate chip cookies (6 pack)",
              pt: "Cookies com gotas de chocolate (6 un.)",
            },
            descripcion: {
              es: "Crocantes por fuera y tiernas por dentro, con chips de chocolate semiamargo.",
              en: "Crisp outside, chewy inside, with dark chocolate chips.",
              pt: "Crocantes por fora e macios por dentro, com gotas de chocolate meio amargo.",
            },
            precio: 600_000,
            foto: {
              autor: "Evan-Amos",
              licencia: "Public domain",
              fuente: "https://commons.wikimedia.org/wiki/File:Choc-Chip-Cookie.jpg",
            },
          },
        ],
      },
    ],
  },
  ropa: {
    nombre: { es: "Ropa", en: "Clothing", pt: "Roupas" },
    categorias: [
      {
        clave: "remeras-y-buzos",
        nombre: { es: "Remeras y buzos", en: "Tees and sweatshirts", pt: "Camisetas e moletons" },
        productos: [
          {
            clave: "remera",
            nombre: { es: "Remera de algodón", en: "Cotton T-shirt", pt: "Camiseta de algodão" },
            descripcion: {
              es: "Algodón peinado, corte recto. Talles S a XXL.",
              en: "Combed cotton, regular fit. Sizes S to XXL.",
              pt: "Algodão penteado, corte reto. Tamanhos P ao GG.",
            },
            precio: 1_800_000,
            foto: {
              autor: "THOR",
              licencia: "CC BY 2.0",
              fuente:
                "https://commons.wikimedia.org/wiki/File:Ringflash_Tshirt_Blank_Template_(3214240974).jpg",
            },
          },
          {
            clave: "buzo",
            nombre: { es: "Buzo de frisa", en: "Crewneck sweatshirt", pt: "Moletom careca" },
            descripcion: {
              es: "Frisa invernal, cuello redondo y puños elastizados.",
              en: "Brushed fleece, crew neck and ribbed cuffs.",
              pt: "Moletom flanelado, gola redonda e punhos com elástico.",
            },
            precio: 3_800_000,
            foto: {
              autor: "Tisahd 23 HAOEYVMA",
              licencia: "CC BY-SA 4.0",
              fuente:
                "https://commons.wikimedia.org/wiki/File:HK_TKO_%E5%B0%87%E8%BB%8D%E6%BE%B3_Tseung_Kwan_O_PopCorn_mall_shop_Uniqlo_Clothing_Store_%E5%86%AC%E5%AD%A3_winter_December_2022_Px3_01.jpg",
            },
          },
        ],
      },
      {
        clave: "pantalones",
        nombre: { es: "Pantalones", en: "Pants", pt: "Calças" },
        productos: [
          {
            clave: "jean",
            nombre: { es: "Jean clásico", en: "Classic jeans", pt: "Calça jeans clássica" },
            descripcion: {
              es: "Denim rígido de calce recto, cinco bolsillos.",
              en: "Rigid denim, straight fit, five pockets.",
              pt: "Jeans rígido de corte reto, cinco bolsos.",
            },
            precio: 4_500_000,
            foto: {
              autor: "Autor desconocido (DigitaltMuseum, digitaltmuseum.se/011023811372)",
              licencia: "CC BY-SA 4.0",
              fuente:
                "https://commons.wikimedia.org/wiki/File:Slitna_jeans_f%C3%B6r_m%C3%A4n_i_bomull_med_lagade_med_sick-sacks%C3%B6m_p%C3%A5_kn%C3%A4na._032s8YepsD7C.jpg",
            },
          },
        ],
      },
      {
        clave: "abrigo",
        nombre: { es: "Abrigo", en: "Outerwear", pt: "Agasalhos" },
        productos: [
          {
            clave: "campera",
            nombre: { es: "Campera de jean", en: "Denim jacket", pt: "Jaqueta jeans" },
            descripcion: {
              es: "Denim lavado, botones metálicos y dos bolsillos al pecho.",
              en: "Washed denim, metal buttons and two chest pockets.",
              pt: "Jeans lavado, botões de metal e dois bolsos no peito.",
            },
            precio: 7_500_000,
            foto: {
              autor: "NikosLikomitros",
              licencia: "CC0",
              fuente: "https://commons.wikimedia.org/wiki/File:Jean_jacket.jpg",
            },
          },
          {
            clave: "gorro-de-lana",
            nombre: { es: "Gorro de lana", en: "Wool beanie", pt: "Gorro de lã" },
            descripcion: {
              es: "Tejido a mano en lana de oveja. Talle único.",
              en: "Hand-knitted from sheep's wool. One size.",
              pt: "Tricotado à mão em lã de ovelha. Tamanho único.",
            },
            precio: 1_500_000,
            foto: {
              autor:
                "Robert Lender from Vienna, Austria, postprocessed by Rosso Robot (cropped, colors enhanced).",
              licencia: "CC BY-SA 2.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Blue_knit-cap_beanie_by_RobertLender.jpeg",
            },
          },
          {
            clave: "bufanda",
            nombre: { es: "Bufanda tejida", en: "Knitted scarf", pt: "Cachecol de tricô" },
            descripcion: {
              es: "Larga y suave, en punto elástico.",
              en: "Long and soft, rib knit.",
              pt: "Comprido e macio, em ponto canelado.",
            },
            precio: 1_700_000,
            foto: {
              autor: "Missouri Historical Society (vía Digital Public Library of America)",
              licencia: "Public domain",
              fuente:
                "https://commons.wikimedia.org/wiki/File:Small_Homemade_Knitted_Scarf_-_DPLA_-_fcde1f6bb3c41863d0b2f99f6d5379b3_(page_1).jpg",
            },
          },
        ],
      },
    ],
  },
  almacen: {
    nombre: { es: "Almacén", en: "Grocery", pt: "Mercearia" },
    categorias: [
      {
        clave: "despensa",
        nombre: { es: "Despensa", en: "Pantry", pt: "Despensa" },
        productos: [
          {
            clave: "miel",
            nombre: { es: "Miel pura (1 kg)", en: "Pure honey (1 kg)", pt: "Mel puro (1 kg)" },
            descripcion: {
              es: "Miel multifloral de productores locales.",
              en: "Wildflower honey from local beekeepers.",
              pt: "Mel silvestre de apicultores locais.",
            },
            precio: 900_000,
            foto: {
              autor: "Marcobeltrametti",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Honey_miele.jpg",
            },
          },
          {
            clave: "aceite-de-oliva",
            nombre: {
              es: "Aceite de oliva extra virgen (500 ml)",
              en: "Extra virgin olive oil (500 ml)",
              pt: "Azeite extravirgem (500 ml)",
            },
            descripcion: {
              es: "Primera prensada en frío.",
              en: "First cold pressed.",
              pt: "Primeira prensagem a frio.",
            },
            precio: 1_200_000,
            foto: {
              autor: "margenauer from Pixabay",
              licencia: "CC0",
              fuente: "https://commons.wikimedia.org/wiki/File:Bottle_of_olive_oil.jpg",
            },
          },
          {
            clave: "dulce-de-leche",
            nombre: {
              es: "Dulce de leche (400 g)",
              en: "Dulce de leche (400 g)",
              pt: "Doce de leite (400 g)",
            },
            descripcion: {
              es: "Clásico, cremoso, ideal para untar.",
              en: "Classic and creamy, great for spreading.",
              pt: "Clássico e cremoso, ótimo para passar no pão.",
            },
            precio: 450_000,
            foto: {
              autor: "audinou from Paris, France",
              licencia: "CC BY 2.0",
              fuente: "https://commons.wikimedia.org/wiki/File:DulceDeLeche.jpg",
            },
          },
        ],
      },
      {
        clave: "infusiones",
        nombre: { es: "Infusiones", en: "Coffee and mate", pt: "Café e mate" },
        productos: [
          {
            clave: "yerba-mate",
            nombre: { es: "Yerba mate (1 kg)", en: "Yerba mate (1 kg)", pt: "Erva-mate (1 kg)" },
            descripcion: {
              es: "Con palo, estacionada naturalmente.",
              en: "With stems, naturally aged.",
              pt: "Com talos, envelhecida naturalmente.",
            },
            precio: 650_000,
            foto: {
              autor: "ChimaAddicted",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Erva_mate_chimarrao_in_big_cuia.jpg",
            },
          },
          {
            clave: "cafe-en-grano",
            nombre: {
              es: "Café en grano (500 g)",
              en: "Whole bean coffee (500 g)",
              pt: "Café em grãos (500 g)",
            },
            descripcion: {
              es: "Tostado medio, notas a chocolate y frutos secos.",
              en: "Medium roast with notes of chocolate and nuts.",
              pt: "Torra média, notas de chocolate e castanhas.",
            },
            precio: 1_400_000,
            foto: {
              autor: "A S M Jobaer",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Roasted_coffee_beans_in_a_jar._01.jpg",
            },
          },
        ],
      },
      {
        clave: "frescos",
        nombre: { es: "Frescos", en: "Fresh", pt: "Frescos" },
        productos: [
          {
            clave: "huevos",
            nombre: {
              es: "Huevos de campo (docena)",
              en: "Free-range eggs (dozen)",
              pt: "Ovos caipiras (dúzia)",
            },
            descripcion: {
              es: "De gallinas criadas a campo.",
              en: "From pasture-raised hens.",
              pt: "De galinhas criadas soltas.",
            },
            precio: 380_000,
            foto: {
              autor: "Krzysztof Golik",
              licencia: "CC BY-SA 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Egg_cartons_with_chicken_eggs_03.jpg",
            },
          },
        ],
      },
    ],
  },
  artesanias: {
    nombre: { es: "Artesanías", en: "Crafts", pt: "Artesanato" },
    categorias: [
      {
        clave: "ceramica",
        nombre: { es: "Cerámica", en: "Ceramics", pt: "Cerâmica" },
        productos: [
          {
            clave: "taza-de-ceramica",
            nombre: { es: "Taza de cerámica", en: "Ceramic mug", pt: "Caneca de cerâmica" },
            descripcion: {
              es: "Torneada y esmaltada a mano. 300 ml.",
              en: "Wheel-thrown and hand-glazed. 300 ml.",
              pt: "Torneada e esmaltada à mão. 300 ml.",
            },
            precio: 1_200_000,
            foto: {
              autor: "Royal Oak Pottery",
              licencia: "CC BY 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Mug_(AM_10099-3).jpg",
            },
          },
          {
            clave: "maceta-de-barro",
            nombre: { es: "Maceta de barro", en: "Clay pot", pt: "Vaso de barro" },
            descripcion: {
              es: "Terracota cocida, con orificio de drenaje.",
              en: "Fired terracotta with a drainage hole.",
              pt: "Terracota queimada, com furo de drenagem.",
            },
            precio: 1_500_000,
            foto: {
              autor: "Spnq",
              licencia: "CC BY-SA 4.0",
              fuente:
                "https://commons.wikimedia.org/wiki/File:Epipremnum_aureum_(Marble_Queen)_houseplant.png",
            },
          },
        ],
      },
      {
        clave: "tejidos",
        nombre: { es: "Tejidos", en: "Weaving", pt: "Tecidos" },
        productos: [
          {
            clave: "canasta-tejida",
            nombre: { es: "Canasta de mimbre", en: "Wicker basket", pt: "Cesta de vime" },
            descripcion: {
              es: "Mimbre trenzado a mano, con manija.",
              en: "Hand-woven wicker with a handle.",
              pt: "Vime trançado à mão, com alça.",
            },
            precio: 2_200_000,
            foto: {
              autor: "George Chernilevsky",
              licencia: "Public domain",
              fuente: "https://commons.wikimedia.org/wiki/File:Sweet_cherries_in_basket_2018_G1.jpg",
            },
          },
          {
            clave: "manta-tejida",
            nombre: { es: "Manta tejida", en: "Woven blanket", pt: "Manta tecida" },
            descripcion: {
              es: "Tejida en telar con lana natural. 1,5 × 2 m.",
              en: "Loom-woven natural wool. 1.5 × 2 m.",
              pt: "Tecida em tear com lã natural. 1,5 × 2 m.",
            },
            precio: 4_800_000,
            foto: {
              autor: "Catherine from Australia",
              licencia: "CC BY 2.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Too_big..._(5706206759).jpg",
            },
          },
        ],
      },
      {
        clave: "madera",
        nombre: { es: "Madera", en: "Woodwork", pt: "Madeira" },
        productos: [
          {
            clave: "tabla-de-madera",
            nombre: { es: "Tabla de madera", en: "Wooden board", pt: "Tábua de madeira" },
            descripcion: {
              es: "Para picar o servir, terminada con aceite apto alimentos.",
              en: "For chopping or serving, finished with food-safe oil.",
              pt: "Para cortar ou servir, com acabamento de óleo atóxico.",
            },
            precio: 2_000_000,
            foto: {
              autor: "Fructibus",
              licencia: "CC0",
              fuente: "https://commons.wikimedia.org/wiki/File:Wooden_cutting_board_2017.jpg",
            },
          },
          {
            clave: "cucharas-de-madera",
            nombre: {
              es: "Cuchara y espátula de madera",
              en: "Wooden spoon and spatula",
              pt: "Colher e espátula de madeira",
            },
            descripcion: {
              es: "Talladas a mano en madera dura, para cocinar sin rayar.",
              en: "Hand-carved from hardwood, gentle on your pans.",
              pt: "Entalhadas à mão em madeira de lei, não riscam as panelas.",
            },
            precio: 900_000,
            foto: {
              autor: "Edukatori",
              licencia: "CC BY 4.0",
              fuente: "https://commons.wikimedia.org/wiki/File:Lug%C3%AB_druri.jpg",
            },
          },
        ],
      },
    ],
  },
};

export const esRubroDeEjemplo = (valor: string): valor is RubroDeEjemplo =>
  (RUBROS_DE_EJEMPLO as readonly string[]).includes(valor);
