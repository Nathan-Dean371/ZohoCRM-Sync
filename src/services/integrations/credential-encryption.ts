import crypto from 'crypto';

export interface EncryptedCredential {
    encryptedValue: string;
    iv: string;
    authTag: string;
    algorithm: string;
}

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a credential value using AES-256-GCM.
 * Uses base64url encoding for compact storage (40% smaller than hex).
 */
export function encryptCredential(plaintext: string, encryptionKey: string): EncryptedCredential {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encryptedBuffer = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedValue: encryptedBuffer.toString('base64url'),
        iv: iv.toString('base64url'),
        authTag: authTag.toString('base64url'),
        algorithm: ALGORITHM
    };
}

/**
 * Decrypt a credential value using AES-256-GCM.
 * Throws if decryption fails or auth tag verification fails.
 */
export function decryptCredential(
    encrypted: EncryptedCredential,
    encryptionKey: string
): string {
    const iv = Buffer.from(encrypted.iv, 'base64url');
    const authTag = Buffer.from(encrypted.authTag, 'base64url');
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decryptedBuffer = Buffer.concat([
        decipher.update(Buffer.from(encrypted.encryptedValue, 'base64url')),
        decipher.final()
    ]);

    return decryptedBuffer.toString('utf8');
}
