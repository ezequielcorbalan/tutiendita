import type { Textos } from "./es";

/** Textos em português do Brasil (mismas claves que es.ts; ver ahí cómo se usan las que terminan en `Html`). */
export const pt: Textos = {
  comun: {
    volver: "Voltar",
    continuar: "Continuar",
    volverALaTienda: "Voltar para a loja",
    sinPasskeys:
      "Este navegador não aceita passkeys. Abra sua loja no celular ou atualize o navegador e tente de novo.",
  },
  tienda: {
    sinProductos: "Ainda não há produtos.",
    productosDe: (nombre: string) => `Produtos de ${nombre}`,
    noEncontradaTitulo: "Página não encontrada",
    productoNoEncontradoTitulo: "Produto não encontrado",
    productoNoEncontrado: "Não existe um produto publicado neste endereço.",
  },
  preparando: {
    titulo: "Estamos preparando a loja",
    descripcion: "Esta loja abre muito em breve",
    texto: "Muito em breve você vai poder ver os produtos aqui. Volte daqui a pouquinho!",
    esTuTiendaHtml:
      'Esta loja é sua? <a href="/panel">Entre no seu painel</a> para terminar de configurá-la.',
  },
  primerArranque: {
    titulo: "Sua tiendita está pronta",
    descripcion: "A tiendita foi publicada na sua conta da Cloudflare",
    intro: "Ela foi publicada na sua conta da Cloudflare. Isto é o que foi criado, tudo no seu nome:",
    recursosHtml: [
      "<strong>A loja</strong>: um Worker da Cloudflare que atende este endereço.",
      "<strong>O banco de dados</strong>: um banco D1 da sua loja, onde vão ficar seus produtos e pedidos.",
      "<strong>O lugar das fotos</strong>: um espaço de imagens R2 da sua loja, com as fotos dos seus produtos.",
      "<strong>Sua cópia do código</strong>: um repositório na sua conta do GitHub ou GitLab. Cada mudança enviada para lá é publicada sozinha.",
    ],
    queSigue: "E agora? Reivindique sua loja",
    reclamoHtml:
      "Para ninguém mais conseguir se apropriar dela, na primeira vez que você entra pedimos um <strong>código de reivindicação</strong> que só você pode ver. Veja onde encontrá-lo:",
    boton: "Reivindicar minha loja",
    despues:
      "Depois você vai criar sua chave de acesso (passkey: você entra com a digital, o rosto ou o PIN do celular, sem senha), escolher o nome e o idioma da loja e informar seu WhatsApp. São cinco telas curtas.",
    instruccionesHtml:
      'As instruções completas estão no arquivo <code>README.md</code> do seu repositório. Você pode ver os recursos criados no seu <a href="https://dash.cloudflare.com/">painel da Cloudflare</a>.',
  },
  dondeEstaElCodigo: {
    pasosHtml: [
      'Entre no seu <a href="https://dash.cloudflare.com/" rel="noopener" target="_blank">painel da Cloudflare</a> com a mesma conta que você usou para criar a loja.',
      "Vá em <strong>Workers e Pages</strong> (em inglês, <em>Workers &amp; Pages</em>) e abra <strong>tiendita</strong>.",
      "Na aba <strong>Implantações</strong> (<em>Deployments</em>), abra a mais recente e clique em <strong>Ver log de compilação</strong> (<em>View build log</em>).",
      "Role até o final do log: você vai ver um quadro com <code>CODIGO DE RECLAMO: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code> (esse é o seu código de reivindicação).",
    ],
    notaHtml:
      "Esse log só pode ser visto por quem tem acesso à sua conta da Cloudflare, então ninguém mais consegue se apropriar da sua loja. Cada vez que a loja é publicada de novo, um código novo é gerado: use o mais recente. Se você está testando no seu computador (<code>npm run dev</code>), o código aparece no terminal.",
  },
  panel: {
    pasoDe: (n: number) => `Passo ${n} de 5`,
  },
  reclamar: {
    titulo: "Reivindique sua loja",
    intro: "Cole o código de reivindicação. Veja onde encontrar o seu:",
    etiqueta: "Código de reivindicação",
    boton: "Reivindicar minha loja",
  },
  ingresar: {
    tituloPagina: "Entrar",
    titulo: "Entre na sua loja",
    intro: "Use a digital, o rosto ou o PIN do seu dispositivo.",
    etiqueta: "Sua passkey",
    placeholder: "Escolha sua passkey",
    boton: "Entrar com passkey",
    sinSoporte:
      "Este navegador não aceita passkeys. Abra sua loja no dispositivo onde você criou a passkey ou atualize o navegador.",
    perdiMiDispositivo: "Perdi meu dispositivo",
  },
  recuperar: {
    tituloPagina: "Recuperar o acesso",
    nuevaTitulo: "Crie uma passkey nova",
    nuevaTexto:
      'Pronto, seu código funcionou. Agora crie uma passkey neste dispositivo. Seu código continua valendo até você criá-la; depois damos um novo (o anterior para de funcionar) e você pode apagar as passkeys antigas em "Acesso".',
    nuevaBoton: "Criar minha passkey nova",
    titulo: "Perdeu seu dispositivo?",
    intro: "Digite o código de recuperação que você guardou quando criou sua passkey.",
    sinSoporte:
      "Este navegador não aceita passkeys, então você não conseguiria criar uma nova. Abra sua loja no celular ou atualize o navegador e tente de novo: seu código não é gasto.",
    etiqueta: "Código de recuperação",
    boton: "Continuar",
    emergencia:
      "Se você perdeu o dispositivo e também o código, a única saída é o plano de emergência do README do seu repositório: quem tem a conta da Cloudflare apaga o acesso no banco de dados e publica a loja de novo para reivindicá-la com um código novo. Seus produtos não se perdem.",
  },
  acceso: {
    titulo: "Acesso",
    tusPasskeys: "Suas passkeys",
    nunca: "nunca",
    creada: (fecha: string, ultimoUso: string) => `criada em ${fecha}, último uso: ${ultimoUso}`,
    borrar: "Apagar",
    confirmarBorrar: "Apagar esta passkey? Esse dispositivo não vai mais conseguir entrar.",
    agregar: "Adicionar passkey",
    codigoTitulo: "Código de recuperação",
    codigoTexto:
      "Se você perdeu o código ou acha que alguém o viu, gere um novo: o anterior para de funcionar.",
    regenerar: "Gerar um código de recuperação novo",
    listo: "Pronto",
    volverAlPanel: "Voltar para o painel",
  },
  inicioPanel: {
    titulo: "Painel",
    vendiendo: "Sua loja está vendendo",
    tuTienda: "Sua loja",
    abierta: "já está aberta:",
    mirala: "veja como seus clientes a veem",
    sinProductos: "Você ainda não cadastrou produtos. Muito em breve vai poder fazer isso por aqui.",
    publicados: (n: number) => `Você tem ${n} ${n === 1 ? "produto publicado" : "produtos publicados"}.`,
    accesoHtml: '<a href="/panel/acceso">Acesso</a>: suas passkeys e seu código de recuperação.',
    idiomaTitulo: "Idioma",
    guardarIdioma: "Salvar idioma",
    salir: "Sair",
  },
  idioma: {
    etiqueta: "Idioma da loja",
    ayuda: "Seus clientes veem a loja neste idioma, e você vê o painel nele. Você pode mudar quando quiser.",
  },
  pasoAcceso: {
    tituloPagina: "Seu acesso",
    titulo: "Sua chave de acesso",
    intro:
      "Você vai entrar na sua loja com a digital, o rosto ou o PIN deste dispositivo. Não tem senha: ninguém pode roubá-la e você não precisa lembrar dela.",
    yaCreada:
      "Você já criou sua passkey. Se quiser, adicione outro dispositivo (por exemplo, seu computador).",
    agregarOtro: "Adicionar outro dispositivo",
    aviso:
      "Ao criá-la, vamos te dar um código de recuperação. Guarde bem: se você perder o dispositivo e também esse código, vai ter que publicar a loja de novo.",
  },
  pasoNombre: {
    tituloPagina: "Nome da loja",
    titulo: "Qual é o nome da sua loja?",
    etiqueta: "Nome",
    placeholder: "Padaria Espiga",
  },
  pasoWhatsapp: {
    tituloPagina: "WhatsApp",
    titulo: "Em qual WhatsApp os clientes falam com você?",
    intro: "Os pedidos da sua loja vão chegar por WhatsApp neste número.",
    etiqueta: "Número de WhatsApp",
    placeholder: "+55 11 91234-5678",
    ayuda:
      "Comece com + e o código do país (por exemplo +55 11 91234-5678). Números da Argentina também podem ser digitados do jeito de sempre, como 11 2233-4455.",
  },
  pasoTransferencia: {
    tituloPagina: "Transferência",
    titulo: "Para onde os clientes transferem?",
    intro:
      "Se você quer receber por transferência, informe seu alias ou CBU/CVU (conta bancária da Argentina). Mostramos isso ao cliente quando ele faz o pedido.",
    etiquetaCuenta: "Alias ou CBU/CVU",
    placeholderCuenta: "padaria.espiga",
    etiquetaTitular: "Titular da conta",
    placeholderTitular: "Ana Souza",
    saltear: "Agora não",
  },
  pasoProducto: {
    tituloPagina: "Primeiro produto",
    titulo: "Cadastre seu primeiro produto",
    intro: "Com nome, preço e uma foto ele já fica à venda. Depois você pode cadastrar quantos quiser.",
    etiquetaNombre: "Nome",
    placeholderNombre: "Pão caseiro",
    etiquetaPrecio: (moneda: string) => `Preço (${moneda})`,
    etiquetaFoto: "Foto",
    publicar: "Publicar",
    saltear: "Cadastro depois",
  },
  passkey: {
    crear: "Criar minha passkey",
  },
  codigoDeRecuperacion: {
    titulo: "Seu código de recuperação",
    explicacion:
      "Se um dia você perder este dispositivo, é com este código que você volta a entrar. Guarde em um lugar seguro (anotado em papel, no seu gerenciador de senhas). Você só vai vê-lo agora.",
    copiar: "Copiar",
    copiado: "Copiado!",
    descargar: "Baixar .txt",
    archivo: (host: string, codigo: string) =>
      `Código de recuperação da sua tiendita (${host}):\n${codigo}\n`,
    nombreDeArchivo: "codigo-de-recuperacao-tiendita.txt",
    imprimir: "Imprimir",
    guardado: "Guardei em um lugar seguro",
    aviso: "Se você perder o dispositivo e também este código, vai ter que publicar a loja de novo.",
  },
  errores: {
    cancelado: "Tudo bem, tente de novo quando quiser.",
    conexion: "Algo deu errado. Confira sua conexão e tente de novo.",
    api: {
      PRECIO_INVALIDO: "Confira o preço: digite só o número, por exemplo 2500.",
      SIN_IMAGEN: "Falta a foto do produto.",
      NOMBRE_VACIO: "Digite um nome (até 80 caracteres).",
      SLUG_INVALIDO: "O endereço do produto não é válido.",
      IMAGEN_INVALIDA: "A foto precisa ser JPG, PNG ou WebP e não muito pesada. Tente outra.",
      PRODUCTO_PAUSADO: "Esse produto está pausado.",
      PRODUCTO_NO_ENCONTRADO: "Não encontramos esse produto.",
      CATEGORIA_NO_ENCONTRADA: "Não encontramos essa categoria.",
      CATEGORIA_CON_PRODUCTOS: "Essa categoria ainda tem produtos.",
      ESTADO_INVALIDO: "Não dá para fazer essa mudança neste produto.",
      CODIGO_INVALIDO: "O código não está correto. Confira e tente de novo.",
      TIENDA_YA_RECLAMADA: "Esta loja já tem dono. Se for você, entre com sua passkey.",
      DESAFIO_VENCIDO: "Passou tempo demais. Tente de novo.",
      PASSKEY_NO_VERIFICADA: "Não conseguimos verificar sua passkey. Tente de novo.",
      PASSKEY_DESCONOCIDA: "Essa passkey não é desta loja. Tente outra ou use seu código de recuperação.",
      PASSKEY_YA_REGISTRADA: "Este dispositivo já tem uma passkey da sua loja.",
      ORIGEN_NO_PERMITIDO: "Abra sua loja pelo endereço de sempre para fazer isso.",
      NO_AUTENTICADO: "Sua sessão terminou. Entre de novo.",
      ACCESO_LIMITADO: "Com este acesso você ainda não pode fazer isso.",
      DEMASIADOS_INTENTOS: "Você tentou vezes demais. Espere alguns minutos e tente de novo.",
      ULTIMA_PASSKEY: "Você não pode apagar sua única passkey: adicione outra antes.",
      WHATSAPP_INVALIDO: "Confira o número: comece com + e o código do país, por exemplo +55 11 91234-5678.",
      TRANSFERENCIA_INVALIDA: "Confira o alias ou CBU/CVU e o nome do titular.",
      PASO_INVALIDO: "Esse passo ainda não está disponível. Volte para a tela anterior.",
      IDIOMA_INVALIDO: "Escolha espanhol, inglês ou português.",
      ENTRADA_INVALIDA: "Confira os dados e tente de novo.",
      NO_ENCONTRADO: "Não encontramos o que você procurava.",
      INTERNO: "Algo falhou do nosso lado. Tente de novo daqui a pouco.",
    },
  },
};
