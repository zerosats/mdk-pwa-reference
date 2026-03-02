const PRF_SALT = new TextEncoder().encode('arkade-vpn-master-key');
const RP_ID = window.location.hostname;
const RP_NAME = 'Arkade Chat';

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function getIOSVersion(): number[] | null {
  const match = navigator.userAgent.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3] || '0', 10)];
}

function isIOSPrfSafe(): boolean {
  const version = getIOSVersion();
  if (!version) return false;
  const [major, minor] = version;
  // PRF data-loss bug fixed in iOS 18.4
  return major > 18 || (major === 18 && minor >= 4);
}

export function getPasskeyUnsupportedReason(): string | null {
  if (!window.PublicKeyCredential) return null;
  if (!isIOS()) return null;
  const version = getIOSVersion();
  if (!version) return null;
  const [major, minor] = version;
  if (major >= 18 && !(major > 18 || minor >= 4)) {
    return `Passkeys require iOS 18.4 or later. You're on ${major}.${minor} — update in Settings > General > Software Update.`;
  }
  if (major < 18) {
    return `Passkeys require iOS 18.4 or later. You're on iOS ${major} — update in Settings > General > Software Update.`;
  }
  return null;
}

export async function isPrfSupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  if (isIOS()) {
    // PRF works on iOS 18.4+ via iCloud Keychain. getClientCapabilities may
    // not report extension:prf on Safari/PWA, so trust the version check
    // and let the actual WebAuthn call surface errors at runtime.
    return isIOSPrfSafe();
  }

  const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
    getClientCapabilities?: () => Promise<Record<string, boolean>>;
  };
  if (typeof pkc.getClientCapabilities === 'function') {
    try {
      const caps = await pkc.getClientCapabilities();
      return caps['extension:prf'] === true;
    } catch {
      // Fall through to heuristic
    }
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  return false;
}

export async function registerPasskey(
  userName: string,
): Promise<{ credentialId: string; ikm: Uint8Array }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: RP_ID },
      user: { id: userId, name: userName, displayName: userName },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions: {
        // @ts-expect-error -- PRF extension not yet in TypeScript DOM lib
        prf: { eval: { first: PRF_SALT } },
      },
    },
  }) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey creation cancelled');
  }

  const extensions = credential.getClientExtensionResults() as Record<string, unknown>;
  const prfResult = extensions.prf as { results?: { first?: ArrayBuffer } } | undefined;
  const prfOutput = prfResult?.results?.first;

  if (!prfOutput || prfOutput.byteLength < 32) {
    throw new Error('PRF extension did not return key material');
  }

  return {
    credentialId: toBase64Url(credential.rawId),
    ikm: new Uint8Array(prfOutput).slice(0, 32),
  };
}

export async function authenticatePasskey(
  credentialId: string,
): Promise<{ ikm: Uint8Array }> {
  const allowCredentials: PublicKeyCredentialDescriptor[] = [
    { type: 'public-key', id: fromBase64Url(credentialId) },
  ];

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: RP_ID,
      allowCredentials,
      userVerification: 'required',
      extensions: {
        // @ts-expect-error -- PRF extension not yet in TypeScript DOM lib
        prf: { eval: { first: PRF_SALT } },
      },
    },
  }) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey authentication cancelled');
  }

  const extensions = assertion.getClientExtensionResults() as Record<string, unknown>;
  const prfResult = extensions.prf as { results?: { first?: ArrayBuffer } } | undefined;
  const prfOutput = prfResult?.results?.first;

  if (!prfOutput || prfOutput.byteLength < 32) {
    throw new Error('PRF extension did not return key material');
  }

  return { ikm: new Uint8Array(prfOutput).slice(0, 32) };
}
