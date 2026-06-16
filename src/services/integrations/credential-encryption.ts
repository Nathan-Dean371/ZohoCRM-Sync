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
 * Matches the encryption pattern used for tunnel_credentials.
 */
export function encryptCredential(plaintext: string, encryptionKey: string): EncryptedCredential {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
        encryptedValue: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
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
    const iv = Buffer.from(encrypted.iv, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
