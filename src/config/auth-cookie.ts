import { CookieOptions } from 'express';

const getAuthCookieBaseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/'
});

export const getAuthCookieOptions = (): CookieOptions => ({
  ...getAuthCookieBaseOptions(),
  maxAge: 60 * 60 * 1000
});

export const getAuthCookieClearOptions = (): CookieOptions =>
  getAuthCookieBaseOptions();
