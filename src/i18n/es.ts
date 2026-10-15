import type { CodigoError, EstadoProducto } from "../paquetes/core/index";

/**
 * Textos de la tiendita en español (el idioma por defecto). en.ts y pt.ts tienen el tipo `Textos`: si falta
 * o sobra una clave, TypeScript falla. Las claves que terminan en `Html` llevan marcado y se pintan con
 * set:html: son constantes de este archivo, nunca datos de la tienda ni del comprador.
 */
export const es = {
  comun: {
    volver: "Volver",
    continuar: "Continuar",
    volverALaTienda: "Volver a la tiendita",
    sinPasskeys:
      "Este navegador no permite passkeys. Abrí tu tienda en el celular o actualizá el navegador y probá de nuevo.",
  },
  storeLayout: {
    madeWith: "Hecho con",
  },
  tienda: {
    sinProductos: "Todavía no hay productos.",
    productosDe: (nombre: string) => `Productos de ${nombre}`,
    noEncontradaTitulo: "Página no encontrada",
    productoNoEncontradoTitulo: "Producto no encontrado",
    productoNoEncontrado: "No existe un producto publicado con esa dirección.",
    categorias: "Categorías",
    todos: "Todos",
    categoriaNoEncontradaTitulo: "Categoría no encontrada",
    categoriaNoEncontrada: "No hay productos publicados en esa categoría.",
  },
  preparando: {
    titulo: "Estamos preparando la tienda",
    descripcion: "Esta tienda abre muy pronto",
    texto: "Muy pronto vas a poder ver los productos acá. ¡Volvé en un ratito!",
    esTuTiendaHtml: '¿Es tu tienda? <a href="/panel">Entrá a tu panel</a> para terminar de configurarla.',
  },
  primerArranque: {
    titulo: "Tu tiendita está lista",
    descripcion: "La tiendita se desplegó bien en tu cuenta de Cloudflare",
    intro: "Se desplegó bien en tu cuenta de Cloudflare. Esto es lo que quedó creado, todo a tu nombre:",
    recursosHtml: [
      "<strong>La tiendita</strong>: un Worker de Cloudflare que atiende esta dirección.",
      "<strong>La base de datos</strong>: una base D1 a nombre de tu tienda, donde van a vivir tus productos y pedidos.",
      "<strong>El lugar para las fotos</strong>: un espacio de imágenes R2 a nombre de tu tienda, con las fotos de tus productos.",
      "<strong>Tu copia del código</strong>: un repositorio en tu cuenta de GitHub o GitLab. Cada cambio que se suba ahí se publica solo.",
    ],
    queSigue: "¿Qué sigue? Reclamá tu tienda",
    reclamoHtml:
      "Para que nadie más pueda adueñarse de ella, la primera vez que entrás te pedimos un <strong>código de reclamo</strong> que solo vos podés ver. Así lo encontrás:",
    boton: "Reclamar mi tienda",
    despues:
      "Después vas a crear tu llave de acceso (passkey: entrás con la huella, la cara o el PIN de tu teléfono, sin contraseña), elegir el nombre y el idioma de la tienda y dejar tu WhatsApp. Son cinco pantallas cortas.",
    instruccionesHtml:
      'Las instrucciones completas están en el archivo <code>README.md</code> de tu repositorio. Podés ver los recursos creados en tu <a href="https://dash.cloudflare.com/">panel de Cloudflare</a>.',
  },
  dondeEstaElCodigo: {
    pasosHtml: [
      'Entrá a tu <a href="https://dash.cloudflare.com/" rel="noopener" target="_blank">panel de Cloudflare</a> con la misma cuenta con la que creaste la tienda.',
      "Andá a <strong>Workers y Pages</strong> (en inglés, <em>Workers &amp; Pages</em>) y abrí <strong>tiendita</strong>.",
      "En la pestaña <strong>Implementaciones</strong> (<em>Deployments</em>), abrí la más reciente y tocá <strong>Ver registro de compilación</strong> (<em>View build log</em>).",
      "Bajá hasta el final del registro: vas a ver un recuadro con <code>CODIGO DE RECLAMO: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code>.",
    ],
    notaHtml:
      "Ese registro solo lo ve quien tiene acceso a tu cuenta de Cloudflare, así que nadie más puede adueñarse de tu tienda. Cada vez que la tienda se vuelve a publicar se genera un código nuevo: usá el del último. Si estás probando en tu computadora (<code>npm run dev</code>), el código aparece en la terminal.",
  },
  panel: {
    pasoDe: (n: number) => `Paso ${n} de 5`,
  },
  reclamar: {
    titulo: "Reclamá tu tienda",
    intro: "Pegá el código de reclamo. Así encontrás el tuyo:",
    etiqueta: "Código de reclamo",
    boton: "Reclamar mi tienda",
  },
  ingresar: {
    tituloPagina: "Entrar",
    titulo: "Entrá a tu tienda",
    intro: "Usá la huella, la cara o el PIN de tu dispositivo.",
    etiqueta: "Tu passkey",
    placeholder: "Elegí tu passkey",
    boton: "Entrar con passkey",
    sinSoporte:
      "Este navegador no permite passkeys. Abrí tu tienda en el dispositivo donde creaste la passkey o actualizá el navegador.",
    perdiMiDispositivo: "Perdí mi dispositivo",
  },
  recuperar: {
    tituloPagina: "Recuperar el acceso",
    nuevaTitulo: "Creá una passkey nueva",
    nuevaTexto:
      'Listo, tu código funcionó. Ahora creá una passkey en este dispositivo. Tu código sigue sirviendo hasta que la crees; después te damos uno nuevo (el anterior deja de servir) y podés borrar las passkeys viejas desde "Acceso".',
    nuevaBoton: "Crear mi passkey nueva",
    titulo: "¿Perdiste tu dispositivo?",
    intro: "Escribí el código de recuperación que guardaste cuando creaste tu passkey.",
    sinSoporte:
      "Este navegador no permite passkeys, así que no podrías crear una nueva. Abrí tu tienda en el celular o actualizá el navegador y probá de nuevo: tu código no se gasta.",
    etiqueta: "Código de recuperación",
    boton: "Seguir",
    emergencia:
      "Si perdiste el dispositivo y también el código, la única salida es el plan de emergencia del README de tu repositorio: quien tiene la cuenta de Cloudflare borra el acceso desde la base de datos y vuelve a desplegar la tienda para reclamarla con un código nuevo. Tus productos no se pierden.",
  },
  acceso: {
    titulo: "Acceso",
    tusPasskeys: "Tus passkeys",
    nunca: "nunca",
    creada: (fecha: string, ultimoUso: string) => `creada el ${fecha}, último uso: ${ultimoUso}`,
    borrar: "Borrar",
    confirmarBorrar: "¿Borrar esta passkey? Ese dispositivo ya no va a poder entrar.",
    agregar: "Agregar passkey",
    codigoTitulo: "Código de recuperación",
    codigoTexto:
      "Si perdiste el código o creés que alguien lo vio, generá uno nuevo: el anterior deja de servir.",
    regenerar: "Generar un código de recuperación nuevo",
    listo: "Listo",
    volverAlPanel: "Volver al panel",
  },
  navPanel: {
    marca: "tiendita",
    etiqueta: "Secciones del panel",
    inicio: "Inicio",
    productos: "Productos",
    actualizaciones: "Actualizaciones",
    acceso: "Acceso",
    verTienda: "Ver mi tienda",
    codigo: "Código público",
    pie: (v: string) => `tiendita ${v} ·`,
  },
  inicioPanel: {
    titulo: "Panel",
    vendiendo: "Tu tienda está vendiendo",
    tuTienda: "Tu tienda",
    abierta: "ya está abierta:",
    mirala: "mirala como la ven tus clientes",
    sinProductos: "Todavía no cargaste productos. Cargá el primero desde Productos.",
    publicados: (n: number) => `Tenés ${n} ${n === 1 ? "producto publicado" : "productos publicados"}.`,
    resumen: "Resumen",
    cifraPublicados: "productos publicados",
    cifraSinPublicar: "sin publicar (borradores o pausados)",
    verProductos: "Ver mis productos",
    insightsTitulo: "Insights",
    insightsIntro: "Muy pronto vas a ver acá cómo le va a tu tienda, con números simples y sin letra chica.",
    proximamente: "Próximamente",
    insights: [
      { titulo: "Visitas a tu tienda", texto: "Cuánta gente entra cada día y desde dónde llega." },
      { titulo: "Productos más vistos", texto: "Qué productos miran más tus clientes." },
      { titulo: "Pedidos por WhatsApp", texto: "Cuántas consultas y pedidos te llegan por semana." },
      { titulo: "Ventas del mes", texto: "Lo que vendiste este mes comparado con el anterior." },
    ],
    idiomaTitulo: "Idioma",
    guardarIdioma: "Guardar idioma",
    salir: "Salir",
  },
  productosPanel: {
    titulo: "Productos",
    sinProductos: "Todavía no cargaste productos. Cargá el primero con el botón de arriba.",
    foto: "Foto",
    nombre: "Producto",
    precio: "Precio",
    estado: "Estado",
    estados: { publicado: "Publicado", borrador: "Borrador", pausado: "Pausado" } satisfies Record<
      EstadoProducto,
      string
    >,
  },
  newProduct: {
    action: "Cargar producto",
    title: "Nuevo producto",
    name: "Nombre",
    namePlaceholder: "Torta de chocolate",
    description: "Descripción (opcional)",
    descriptionHelp:
      "Contá cómo es, de qué tamaño, qué incluye. La ven tus clientes en la página del producto.",
    price: (currency: string) => `Precio (${currency})`,
    photo: "Foto",
    photoHelp:
      "JPG, PNG o WebP de hasta 5 MB. Para publicar hace falta una foto; sin foto queda como borrador.",
    publishNow: "Publicarlo ahora",
    save: "Guardar producto",
    back: "Volver a productos",
    created: "Listo, el producto quedó cargado.",
  },
  idioma: {
    etiqueta: "Idioma de la tienda",
    ayuda: "Tus clientes ven la tienda en este idioma, y vos el panel. Lo podés cambiar cuando quieras.",
  },
  pasoAcceso: {
    tituloPagina: "Tu acceso",
    titulo: "Tu llave de acceso",
    intro:
      "Vas a entrar a tu tienda con la huella, la cara o el PIN de este dispositivo. No hay contraseña: nadie te la puede robar ni la tenés que recordar.",
    yaCreada: "Ya creaste tu passkey. Si querés, agregá otro dispositivo (por ejemplo, tu computadora).",
    agregarOtro: "Agregar otro dispositivo",
    aviso:
      "Al crearla te vamos a dar un código de recuperación. Guardalo bien: si perdés el dispositivo y también ese código, vas a tener que volver a desplegar la tienda.",
  },
  pasoNombre: {
    tituloPagina: "Nombre de la tienda",
    titulo: "¿Cómo se llama tu tienda?",
    etiqueta: "Nombre",
    placeholder: "Panadería La Espiga",
  },
  pasoWhatsapp: {
    tituloPagina: "WhatsApp",
    titulo: "¿A qué WhatsApp te escriben los clientes?",
    intro: "Los pedidos de tu tienda te van a llegar por WhatsApp a este número.",
    etiquetaPais: "País",
    etiqueta: "Número de WhatsApp",
    placeholder: "11 2233-4455",
    ayuda:
      "Elegí el país y escribí el número con el código de área, como lo marcás siempre (por ejemplo 11 2233-4455 o 351 15 123-4567).",
  },
  pasoTransferencia: {
    tituloPagina: "Transferencia",
    titulo: "¿A dónde te transfieren?",
    intro:
      "Si querés cobrar por transferencia, dejá tu alias o tu CBU/CVU. Se lo mostramos al cliente cuando pide.",
    etiquetaCuenta: "Alias o CBU/CVU",
    placeholderCuenta: "panaderia.espiga",
    etiquetaTitular: "Titular de la cuenta",
    placeholderTitular: "Ana Pérez",
    saltear: "Ahora no",
  },
  pasoProducto: {
    tituloPagina: "Primer producto",
    titulo: "Cargá tu primer producto",
    intro: "Con nombre, precio y una foto ya queda a la venta. Después podés cargar todos los que quieras.",
    etiquetaNombre: "Nombre",
    placeholderNombre: "Pan de campo",
    etiquetaPrecio: (moneda: string) => `Precio (${moneda})`,
    etiquetaFoto: "Foto",
    publicar: "Publicar",
    saltear: "Lo cargo después",
  },
  ejemplos: {
    titulo: "Productos de ejemplo",
    introPrimerIngreso:
      "¿Preferís ver primero cómo queda? Cargá productos de ejemplo de un rubro, con fotos y categorías. Después los borrás todos juntos desde el panel.",
    introPanel:
      "Cargá productos de ejemplo de un rubro, con fotos y categorías, para ver cómo queda la tienda. Cuando quieras, los borrás todos juntos (tus productos no se tocan).",
    etiquetaRubro: "Rubro",
    cargar: "Cargar productos de ejemplo",
    cargando: "Cargando…",
    borrar: "Borrar los productos de ejemplo",
    confirmarBorrar: "¿Borrar todos los productos de ejemplo? Tus productos no se tocan.",
  },
  passkey: {
    crear: "Crear mi passkey",
  },
  codigoDeRecuperacion: {
    titulo: "Tu código de recuperación",
    explicacion:
      "Si algún día perdés este dispositivo, con este código volvés a entrar. Guardalo en un lugar seguro (anotado en papel, en tu gestor de contraseñas). Lo vas a ver solo esta vez.",
    copiar: "Copiar",
    copiado: "¡Copiado!",
    descargar: "Descargar .txt",
    archivo: (host: string, codigo: string) =>
      `Código de recuperación de tu tiendita (${host}):\n${codigo}\n`,
    nombreDeArchivo: "codigo-de-recuperacion-tiendita.txt",
    imprimir: "Imprimir",
    guardado: "Lo guardé en un lugar seguro",
    aviso: "Si perdés el dispositivo y también este código, vas a tener que volver a desplegar la tienda.",
  },
  actualizaciones: {
    titulo: "Actualizaciones",
    intro:
      "tutiendita sigue mejorando. Desde acá traés las mejoras a tu tienda cuando vos quieras: nada cambia sin que lo apruebes.",
    version: (v: string) => `Tu tienda tiene la versión ${v}.`,
    conectarTitulo: "Conectá tu tienda con GitHub",
    conectarTexto:
      "Tu tienda vive en un repositorio de tu GitHub. Para traer las mejoras, la tienda crea una app de GitHub a tu nombre que solo vos controlás: no pasa por nosotros. Es una sola vez; GitHub te va a pedir que confirmes con el botón verde.",
    conectar: "Conectar con GitHub",
    instalarTitulo: "Falta un paso: elegí el repositorio",
    instalarTexto:
      "La app ya está creada. Ahora instalala solo en el repositorio de tu tienda (el que creó Cloudflare, por ejemplo tiendita).",
    instalar: "Elegir el repositorio en GitHub",
    conectada: (repo: string) => `Conectada con ${repo}.`,
    alDia: (v: string) => `Tenés la última versión (${v}). Volvé a mirar más adelante.`,
    hayNueva: (nueva: string, actual: string) => `Hay una versión nueva: ${nueva} (tenés ${actual}).`,
    prepararTexto:
      "Primero armamos en tu GitHub una propuesta con los cambios (un pull request). Todavía no se aplica nada.",
    preparar: "Ver qué cambia",
    preparado: (n: number) => `Listo: la propuesta cambia ${n} ${n === 1 ? "archivo" : "archivos"}.`,
    verEnGithub: "Ver los cambios en GitHub",
    aviso:
      "Si alguien cambió el código de tu tienda, revisá los cambios antes: la actualización reemplaza los archivos que cambiaron en la versión oficial.",
    aplicar: "Actualizar mi tienda",
    aplicado:
      "¡Listo! Cloudflare está publicando la versión nueva. En unos minutos la vas a ver en tu tienda.",
    errorEstado: "No pudimos hablar con GitHub. Probá de nuevo en un rato.",
    conexionFallida:
      "La conexión no salió bien (el enlace venció o no es de esta tienda). Probá conectar de nuevo.",
    volver: "Volver a actualizaciones",
  },
  errores: {
    cancelado: "No pasa nada, probá de nuevo cuando quieras.",
    conexion: "Algo no salió bien. Revisá tu conexión y probá de nuevo.",
    /** Un mensaje en lenguaje llano por cada código de error de la API. */
    api: {
      PRECIO_INVALIDO: "Revisá el precio: escribí solo el número, por ejemplo 2500.",
      SIN_IMAGEN: "Falta la foto del producto.",
      NOMBRE_VACIO: "Escribí un nombre (hasta 80 caracteres).",
      SLUG_INVALIDO: "La dirección del producto no es válida.",
      IMAGEN_INVALIDA: "La foto tiene que ser JPG, PNG o WebP y no muy pesada. Probá con otra.",
      PRODUCTO_PAUSADO: "Ese producto está pausado.",
      PRODUCTO_NO_ENCONTRADO: "No encontramos ese producto.",
      CATEGORIA_NO_ENCONTRADA: "No encontramos esa categoría.",
      CATEGORIA_CON_PRODUCTOS: "Esa categoría todavía tiene productos.",
      ESTADO_INVALIDO: "No se puede hacer ese cambio en este producto.",
      CODIGO_INVALIDO: "El código no es correcto. Revisalo y probá de nuevo.",
      TIENDA_YA_RECLAMADA: "Esta tienda ya tiene dueña o dueño. Si sos vos, entrá con tu passkey.",
      DESAFIO_VENCIDO: "Pasó demasiado tiempo. Probá de nuevo.",
      PASSKEY_NO_VERIFICADA: "No pudimos verificar tu passkey. Probá de nuevo.",
      PASSKEY_DESCONOCIDA:
        "Esa passkey no es de esta tienda. Probá con otra o usá tu código de recuperación.",
      PASSKEY_YA_REGISTRADA: "Este dispositivo ya tiene una passkey de tu tienda.",
      ORIGEN_NO_PERMITIDO: "Abrí tu tienda desde su dirección de siempre para hacer esto.",
      NO_AUTENTICADO: "Tu sesión terminó. Volvé a entrar.",
      ACCESO_LIMITADO: "Con este acceso no podés hacer eso todavía.",
      DEMASIADOS_INTENTOS: "Probaste demasiadas veces. Esperá unos minutos y volvé a intentar.",
      ULTIMA_PASSKEY: "No podés borrar tu única passkey: agregá otra primero.",
      WHATSAPP_INVALIDO: "Revisá el número: código de área y número, por ejemplo 11 2233-4455.",
      TRANSFERENCIA_INVALIDA: "Revisá el alias o CBU/CVU y el nombre del titular.",
      PASO_INVALIDO: "Ese paso todavía no se puede hacer. Volvé a la pantalla anterior.",
      IDIOMA_INVALIDO: "Elegí español, inglés o portugués.",
      GITHUB_SIN_CONECTAR: "Primero conectá tu tienda con GitHub.",
      GITHUB_NO_RESPONDE: "GitHub no respondió. Probá de nuevo en un rato.",
      GITHUB_VARIOS_REPOSITORIOS:
        "La app tiene acceso a más de un repositorio. En GitHub, dejale acceso solo al de tu tienda y volvé a intentar.",
      YA_ACTUALIZADA: "Tu tienda ya tiene la última versión.",
      ENTRADA_INVALIDA: "Revisá los datos y probá de nuevo.",
      NO_ENCONTRADO: "No encontramos lo que buscabas.",
      INTERNO: "Algo falló de nuestro lado. Probá de nuevo en un rato.",
    } satisfies Record<CodigoError | "ENTRADA_INVALIDA" | "NO_ENCONTRADO" | "INTERNO", string>,
  },
};

export type Textos = typeof es;
