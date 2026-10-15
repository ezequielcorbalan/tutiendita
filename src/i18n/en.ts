import type { Textos } from "./es";

/** Textos en inglés (mismas claves que es.ts; ver ahí cómo se usan las que terminan en `Html`). */
export const en: Textos = {
  comun: {
    volver: "Back",
    continuar: "Continue",
    volverALaTienda: "Back to the store",
    sinPasskeys:
      "This browser doesn't support passkeys. Open your store on your phone or update your browser and try again.",
  },
  tienda: {
    sinProductos: "No products yet.",
    productosDe: (nombre: string) => `Products from ${nombre}`,
    noEncontradaTitulo: "Page not found",
    productoNoEncontradoTitulo: "Product not found",
    productoNoEncontrado: "There's no published product at this address.",
  },
  preparando: {
    titulo: "We're getting the store ready",
    descripcion: "This store opens very soon",
    texto: "You'll be able to see the products here very soon. Come back in a little while!",
    esTuTiendaHtml: 'Is this your store? <a href="/panel">Go to your dashboard</a> to finish setting it up.',
  },
  primerArranque: {
    titulo: "Your tiendita is ready",
    descripcion: "Your tiendita was deployed to your Cloudflare account",
    intro: "It was deployed to your Cloudflare account. Here's what was created, all in your name:",
    recursosHtml: [
      "<strong>The store</strong>: a Cloudflare Worker that serves this address.",
      "<strong>The database</strong>: a D1 database for your store, where your products and orders will live.",
      "<strong>The photo storage</strong>: an R2 image bucket for your store, with your product photos.",
      "<strong>Your copy of the code</strong>: a repository in your GitHub or GitLab account. Every change pushed there goes live on its own.",
    ],
    queSigue: "What's next? Claim your store",
    reclamoHtml:
      "So nobody else can take it over, the first time you sign in we ask for a <strong>claim code</strong> that only you can see. Here's where to find it:",
    boton: "Claim my store",
    despues:
      "Then you'll create your passkey (you sign in with your phone's fingerprint, face or PIN, no password), choose your store's name and language, and add your WhatsApp number. It's five short screens.",
    instruccionesHtml:
      'The full instructions are in the <code>README.md</code> file in your repository. You can see the resources that were created in your <a href="https://dash.cloudflare.com/">Cloudflare dashboard</a>.',
  },
  dondeEstaElCodigo: {
    pasosHtml: [
      'Sign in to your <a href="https://dash.cloudflare.com/" rel="noopener" target="_blank">Cloudflare dashboard</a> with the same account you used to create the store.',
      "Go to <strong>Workers &amp; Pages</strong> and open <strong>tiendita</strong>.",
      "In the <strong>Deployments</strong> tab, open the most recent one and click <strong>View build log</strong>.",
      "Scroll to the end of the log: you'll see a box with <code>CODIGO DE RECLAMO: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX</code> (that's your claim code).",
    ],
    notaHtml:
      "Only people with access to your Cloudflare account can see that log, so nobody else can take over your store. Every time the store is published again a new code is generated: use the latest one. If you're trying it on your computer (<code>npm run dev</code>), the code shows up in the terminal.",
  },
  panel: {
    pasoDe: (n: number) => `Step ${n} of 5`,
  },
  reclamar: {
    titulo: "Claim your store",
    intro: "Paste your claim code. Here's where to find yours:",
    etiqueta: "Claim code",
    boton: "Claim my store",
  },
  ingresar: {
    tituloPagina: "Sign in",
    titulo: "Sign in to your store",
    intro: "Use your device's fingerprint, face or PIN.",
    etiqueta: "Your passkey",
    placeholder: "Choose your passkey",
    boton: "Sign in with passkey",
    sinSoporte:
      "This browser doesn't support passkeys. Open your store on the device where you created your passkey, or update your browser.",
    perdiMiDispositivo: "I lost my device",
  },
  recuperar: {
    tituloPagina: "Recover access",
    nuevaTitulo: "Create a new passkey",
    nuevaTexto:
      'Done, your code worked. Now create a passkey on this device. Your code keeps working until you do; after that we give you a new one (the old one stops working) and you can delete your old passkeys from "Access".',
    nuevaBoton: "Create my new passkey",
    titulo: "Lost your device?",
    intro: "Type the recovery code you saved when you created your passkey.",
    sinSoporte:
      "This browser doesn't support passkeys, so you couldn't create a new one. Open your store on your phone or update your browser and try again: your code won't be used up.",
    etiqueta: "Recovery code",
    boton: "Continue",
    emergencia:
      "If you lost both your device and the code, the only way back is the emergency plan in your repository's README: whoever has the Cloudflare account deletes the access from the database and deploys the store again to claim it with a new code. Your products are kept.",
  },
  acceso: {
    titulo: "Access",
    tusPasskeys: "Your passkeys",
    nunca: "never",
    creada: (fecha: string, ultimoUso: string) => `created on ${fecha}, last used: ${ultimoUso}`,
    borrar: "Delete",
    confirmarBorrar: "Delete this passkey? That device won't be able to sign in anymore.",
    agregar: "Add passkey",
    codigoTitulo: "Recovery code",
    codigoTexto:
      "If you lost the code or think someone saw it, generate a new one: the old one stops working.",
    regenerar: "Generate a new recovery code",
    listo: "Done",
    volverAlPanel: "Back to the dashboard",
  },
  inicioPanel: {
    titulo: "Dashboard",
    vendiendo: "Your store is open for business",
    tuTienda: "Your store",
    abierta: "is open:",
    mirala: "see it the way your customers do",
    sinProductos: "You haven't added any products yet. You'll be able to do it from here very soon.",
    publicados: (n: number) => `You have ${n} ${n === 1 ? "published product" : "published products"}.`,
    accesoHtml: '<a href="/panel/acceso">Access</a>: your passkeys and your recovery code.',
    productosHtml: '<a href="/panel/productos">Products</a>: everything you added, published or not.',
    actualizacionesHtml:
      '<a href="/panel/actualizaciones">Updates</a>: bring in tutiendita improvements whenever you want.',
    idiomaTitulo: "Language",
    guardarIdioma: "Save language",
    salir: "Sign out",
  },
  productosPanel: {
    titulo: "Products",
    sinProductos: "You haven't added any products yet. You'll be able to do it from here very soon.",
    foto: "Photo",
    nombre: "Product",
    precio: "Price",
    estado: "Status",
    estados: { publicado: "Published", borrador: "Draft", pausado: "Paused" },
  },
  idioma: {
    etiqueta: "Store language",
    ayuda:
      "Your customers see the store in this language, and you see the dashboard in it. You can change it anytime.",
  },
  pasoAcceso: {
    tituloPagina: "Your access",
    titulo: "Your passkey",
    intro:
      "You'll sign in to your store with this device's fingerprint, face or PIN. There's no password: nobody can steal it and you don't have to remember it.",
    yaCreada:
      "You already created your passkey. If you like, add another device (your computer, for example).",
    agregarOtro: "Add another device",
    aviso:
      "When you create it we'll give you a recovery code. Keep it safe: if you lose your device and that code too, you'll have to deploy the store again.",
  },
  pasoNombre: {
    tituloPagina: "Store name",
    titulo: "What's your store called?",
    etiqueta: "Name",
    placeholder: "Sunrise Bakery",
  },
  pasoWhatsapp: {
    tituloPagina: "WhatsApp",
    titulo: "Which WhatsApp number should customers message?",
    intro: "Orders from your store will reach you on WhatsApp at this number.",
    etiquetaPais: "Country",
    etiqueta: "WhatsApp number",
    placeholder: "555 123 4567",
    ayuda: "Pick your country and type the number with its area code, the way you usually dial it.",
  },
  pasoTransferencia: {
    tituloPagina: "Bank transfer",
    titulo: "Where should customers send transfers?",
    intro:
      "If you want to get paid by bank transfer, add your alias or CBU/CVU (Argentine bank account). We show it to customers when they order.",
    etiquetaCuenta: "Alias or CBU/CVU",
    placeholderCuenta: "sunrise.bakery",
    etiquetaTitular: "Account holder",
    placeholderTitular: "Ann Smith",
    saltear: "Not now",
  },
  pasoProducto: {
    tituloPagina: "First product",
    titulo: "Add your first product",
    intro:
      "A name, a price and a photo are all it takes to put it on sale. You can add as many as you like later.",
    etiquetaNombre: "Name",
    placeholderNombre: "Sourdough bread",
    etiquetaPrecio: (moneda: string) => `Price (${moneda})`,
    etiquetaFoto: "Photo",
    publicar: "Publish",
    saltear: "I'll add it later",
  },
  passkey: {
    crear: "Create my passkey",
  },
  codigoDeRecuperacion: {
    titulo: "Your recovery code",
    explicacion:
      "If you ever lose this device, this code gets you back in. Keep it somewhere safe (written on paper, in your password manager). You'll only see it this once.",
    copiar: "Copy",
    copiado: "Copied!",
    descargar: "Download .txt",
    archivo: (host: string, codigo: string) => `Recovery code for your tiendita (${host}):\n${codigo}\n`,
    nombreDeArchivo: "tiendita-recovery-code.txt",
    imprimir: "Print",
    guardado: "I saved it somewhere safe",
    aviso: "If you lose your device and this code too, you'll have to deploy the store again.",
  },
  actualizaciones: {
    titulo: "Updates",
    intro:
      "tutiendita keeps getting better. From here you bring the improvements to your store whenever you want: nothing changes until you approve it.",
    version: (v: string) => `Your store is on version ${v}.`,
    conectarTitulo: "Connect your store to GitHub",
    conectarTexto:
      "Your store lives in a repository on your GitHub. To bring in improvements, the store creates a GitHub app in your name that only you control: nothing goes through us. You do it once; GitHub will ask you to confirm with the green button.",
    conectar: "Connect to GitHub",
    instalarTitulo: "One more step: choose the repository",
    instalarTexto:
      "The app is created. Now install it only on your store's repository (the one Cloudflare created, for example tiendita).",
    instalar: "Choose the repository on GitHub",
    conectada: (repo: string) => `Connected to ${repo}.`,
    alDia: (v: string) => `You have the latest version (${v}). Check back later.`,
    hayNueva: (nueva: string, actual: string) => `There's a new version: ${nueva} (you have ${actual}).`,
    prepararTexto:
      "First we put together a proposal with the changes on your GitHub (a pull request). Nothing is applied yet.",
    preparar: "See what changes",
    preparado: (n: number) => `Done: the proposal changes ${n} ${n === 1 ? "file" : "files"}.`,
    verEnGithub: "See the changes on GitHub",
    aviso:
      "If someone changed your store's code, review the changes first: the update replaces the files that changed in the official version.",
    aplicar: "Update my store",
    aplicado: "Done! Cloudflare is publishing the new version. You'll see it on your store in a few minutes.",
    errorEstado: "We couldn't reach GitHub. Please try again in a little while.",
    conexionFallida:
      "The connection didn't work (the link expired or isn't from this store). Try connecting again.",
    volver: "Back to updates",
  },
  errores: {
    cancelado: "No worries, try again whenever you're ready.",
    conexion: "Something went wrong. Check your connection and try again.",
    api: {
      PRECIO_INVALIDO: "Check the price: type just the number, for example 2500.",
      SIN_IMAGEN: "The product photo is missing.",
      NOMBRE_VACIO: "Type a name (up to 80 characters).",
      SLUG_INVALIDO: "The product address isn't valid.",
      IMAGEN_INVALIDA: "The photo has to be a JPG, PNG or WebP and not too large. Try another one.",
      PRODUCTO_PAUSADO: "That product is paused.",
      PRODUCTO_NO_ENCONTRADO: "We couldn't find that product.",
      CATEGORIA_NO_ENCONTRADA: "We couldn't find that category.",
      CATEGORIA_CON_PRODUCTOS: "That category still has products.",
      ESTADO_INVALIDO: "That change can't be made to this product.",
      CODIGO_INVALIDO: "That code isn't right. Check it and try again.",
      TIENDA_YA_RECLAMADA: "This store already has an owner. If that's you, sign in with your passkey.",
      DESAFIO_VENCIDO: "Too much time went by. Please try again.",
      PASSKEY_NO_VERIFICADA: "We couldn't verify your passkey. Please try again.",
      PASSKEY_DESCONOCIDA:
        "That passkey doesn't belong to this store. Try another one or use your recovery code.",
      PASSKEY_YA_REGISTRADA: "This device already has a passkey for your store.",
      ORIGEN_NO_PERMITIDO: "Open your store from its usual address to do this.",
      NO_AUTENTICADO: "Your session ended. Please sign in again.",
      ACCESO_LIMITADO: "You can't do that with this access yet.",
      DEMASIADOS_INTENTOS: "Too many attempts. Wait a few minutes and try again.",
      ULTIMA_PASSKEY: "You can't delete your only passkey: add another one first.",
      WHATSAPP_INVALIDO: "Check the number: start with + and your country code, for example +1 555 123 4567.",
      TRANSFERENCIA_INVALIDA: "Check the alias or CBU/CVU and the account holder's name.",
      PASO_INVALIDO: "That step isn't available yet. Go back to the previous screen.",
      IDIOMA_INVALIDO: "Choose Spanish, English or Portuguese.",
      GITHUB_SIN_CONECTAR: "First connect your store to GitHub.",
      GITHUB_NO_RESPONDE: "GitHub didn't respond. Please try again in a little while.",
      GITHUB_VARIOS_REPOSITORIOS:
        "The app has access to more than one repository. On GitHub, give it access only to your store's repository and try again.",
      YA_ACTUALIZADA: "Your store already has the latest version.",
      ENTRADA_INVALIDA: "Check the details and try again.",
      NO_ENCONTRADO: "We couldn't find what you were looking for.",
      INTERNO: "Something failed on our side. Please try again in a little while.",
    },
  },
};
