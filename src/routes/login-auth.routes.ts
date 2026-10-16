import { Router, RequestHandler } from "express";
import { checkLoginDetails } from '../utils/userAuth';  
import { createJWTtoken } from '../utils/JWT-generator';
import { getUserDetails } from '../services/database/databaseConnector';
import { user_role } from "../types/userRoles";
import { getAuthCookieOptions } from '../config/auth-cookie';



const router = Router();
const tryToLoginUser: RequestHandler = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        
        
        // Validate inputs
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
            return;
        }

        // Check login
        const isValid = await checkLoginDetails({ email, password });
        if (!isValid) {
            res.status(401).json({
                success: false,
                message: "Invalid login details",
            });
            return;
        }

        // Get user details
        const userDetails = await getUserDetails(email);
        if (!userDetails) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        
        // Create token and set cookie
        const token = createJWTtoken(userDetails);
        res.cookie('auth-token', token, getAuthCookieOptions());

        // Redirect based on role
        if (userDetails.role === user_role.ADMIN) {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error("Error during login verification:", error);
        
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "An error occurred",
            });
        } else {
            // Log the error but don't try to send another response
            console.error("Headers already sent, cannot send error response");
        }
    }
};

router.post("/login", tryToLoginUser);

export default router;
