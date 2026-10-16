import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUserDetails } from '../services/database/databaseConnector';
import { User } from '../types/users';
import { user_role } from '../types/userRoles';
import { AppError } from './errorHandler';
import { getAuthCookieClearOptions } from '../config/auth-cookie';


const checkForAuthToken = async (req : Request, res : Response, next : NextFunction) => {
    try {
        
        //console.log('Checking for auth token on route ', req.path); 
        
        if(req.cookies['auth-token'] === undefined)
        {
            console.log('No auth token found');
            next();
            return;
        }
        
        const decode = <jwt.JwtPayload> jwt.verify(req.cookies['auth-token'], process.env.JWT_SECRET as string);
        
        const userFromDb  = await getUserDetails(decode.user.email);
        
        if(userFromDb)
        {
            req.user = userFromDb;
        }

        next();
    } catch(error) 
    {
        if(error instanceof jwt.TokenExpiredError)
        { 
            console.log('Token expired');
            res.clearCookie('auth-token', getAuthCookieClearOptions());
            res.redirect('/');
        }
        else
        {
            console.log('JWT Error: ', error);
            res.clearCookie('auth-token', getAuthCookieClearOptions());
            next(new AppError(401, 'Unauthorized'));
        }
    }
};

export const userAuthMiddleware = checkForAuthToken;

