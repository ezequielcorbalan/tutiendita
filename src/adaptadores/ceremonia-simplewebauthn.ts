import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { type CeremoniaWebAuthn, err, errorDeDominio, ok } from "../paquetes/core/index";

/**
 * Adaptador del puerto `CeremoniaWebAuthn` con @simplewebauthn/server. Vive en la app (no en
 * infra-cloudflare) para que la regla de dependencias de infra siga siendo "solo drizzle y Workers".
 * Algoritmos fijados: Ed25519, ES256 y RS256, sin depender de lo que traiga el runtime (la 14 prefiere
 * ML-DSA donde existe).
 */
export const ALGORITMOS = [-8, -7, -257];

const noVerificada = (causa: unknown) =>
  err(
    errorDeDominio("PASSKEY_NO_VERIFICADA", "No pudimos verificar la passkey", {
      motivo: causa instanceof Error ? causa.message : String(causa),
    }),
  );

const transportes = (lista: readonly string[]) => lista as AuthenticatorTransport[];

export function crearCeremoniaSimpleWebAuthn(): CeremoniaWebAuthn {
  return {
    async opcionesDeRegistro(e) {
      const opciones = await generateRegistrationOptions({
        rpName: e.rpNombre,
        rpID: e.rpId,
        userName: e.nombreDeUsuario,
        userDisplayName: e.nombreVisible,
        userID: isoBase64URL.toBuffer(e.webauthnUserId),
        attestationType: "none",
        excludeCredentials: e.excluir.map((c) => ({ id: c.id, transports: transportes(c.transportes) })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        supportedAlgorithmIDs: ALGORITMOS,
      });
      return { opciones, desafio: opciones.challenge };
    },

    async verificarRegistro(e) {
      try {
        const r = await verifyRegistrationResponse({
          response: e.respuesta as RegistrationResponseJSON,
          expectedChallenge: e.desafio,
          expectedOrigin: e.origen,
          expectedRPID: e.rpId,
          requireUserVerification: true,
          supportedAlgorithmIDs: ALGORITMOS,
        });
        if (!r.verified) return noVerificada("la librería no verificó el registro");
        const info = r.registrationInfo;
        return ok({
          id: info.credential.id,
          clavePublica: new Uint8Array(info.credential.publicKey),
          contador: info.credential.counter,
          transportes: info.credential.transports ?? [],
          tipoDispositivo: info.credentialDeviceType,
          respaldada: info.credentialBackedUp,
        });
      } catch (causa) {
        return noVerificada(causa);
      }
    },

    async opcionesDeIngreso(e) {
      const opciones = await generateAuthenticationOptions({
        rpID: e.rpId,
        allowCredentials: [],
        userVerification: "required",
      });
      return { opciones, desafio: opciones.challenge };
    },

    async verificarIngreso(e) {
      try {
        const r = await verifyAuthenticationResponse({
          response: e.respuesta as AuthenticationResponseJSON,
          expectedChallenge: e.desafio,
          expectedOrigin: e.origen,
          expectedRPID: e.rpId,
          requireUserVerification: true,
          credential: {
            id: e.credencial.id,
            publicKey: Uint8Array.from(e.credencial.clavePublica),
            counter: e.credencial.contador,
            transports: transportes(e.credencial.transportes),
          },
        });
        if (!r.verified) return noVerificada("la librería no verificó el ingreso");
        return ok({ nuevoContador: r.authenticationInfo.newCounter });
      } catch (causa) {
        return noVerificada(causa);
      }
    },
  };
}
