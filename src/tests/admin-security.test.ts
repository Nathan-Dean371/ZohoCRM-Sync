import request from 'supertest';
import app from '../app';
import jwt from 'jsonwebtoken';
import { user_role } from '../types/userRoles';

// Mock the database connector
jest.mock('../services/database/databaseConnector', () => ({
    __esModule: true,
    default: {
        companies: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        users: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        user_invitations: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        tunnels: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        $queryRaw: jest.fn().mockResolvedValue([]),
    },
    connectToDatabase: jest.fn(),
    getUserDetails: jest.fn(),
}));

// Mock bullmq to avoid Redis errors
jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        on: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
    })),
}));

import { getUserDetails } from '../services/database/databaseConnector';

describe('Admin Security', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should redirect unauthenticated users to home or show 401', async () => {
        // Current behavior: verifyRole throws AppError(401) but it might hang due to empty catch
        const res = await request(app).get('/admin/dashboard');
        // If it hangs, this test will timeout. 
        // If it's fixed, it should return 401 or redirect.
        expect(res.status).toBe(401);
    });

    it('should forbid non-admin users from accessing admin routes', async () => {
        const user = {
            id: 'user-1',
            email: 'user@example.com',
            role: user_role.OPERATOR,
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(user);

        const token = jwt.sign({ user: { email: user.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(403);
    });

    it('should allow admin users to access admin routes', async () => {
        const admin = {
            id: 'admin-1',
            email: 'admin@example.com',
            role: user_role.ADMIN,
            company_id: 'company-1'
        };

        (getUserDetails as jest.Mock).mockResolvedValue(admin);

        const token = jwt.sign({ user: { email: admin.email } }, JWT_SECRET);

        const res = await request(app)
            .get('/admin/dashboard')
            .set('Cookie', [`auth-token=${token}`]);

        expect(res.status).toBe(200);
    });

    it('should reject malformed JWT tokens on admin routes', async () => {
        const res = await request(app)
            .get('/admin/dashboard')
            .set('Cookie', ['auth-token=invalid-token']);

        expect(res.status).toBe(401);
    });
});
