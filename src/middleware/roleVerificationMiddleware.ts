import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { user_role } from '../types/userRoles';
import { User } from '../types/users';

export const verifyRole = (roles : user_role[]) => (req: Request, res: Response, next: NextFunction) => {
    try 
    {
        const user = req.user;
        // Check if user exists
        if (!user) 
        {
            throw new AppError(401, 'Unauthorized');
        }
        // Check if user has the required role
        if (!roles.includes(user.role))
        {
            throw new AppError(403, 'Forbidden');
        }

        next();

    }   catch (error)
    {
        next(error);
    }
};