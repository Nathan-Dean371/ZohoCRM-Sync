import 'dotenv/config';
import express, { Express, Request, Response, NextFunction } from 'express';
import webhookRoutes from './routes/webhook.routes';
import apiKeyRoute from './routes/api-key.routes';
import loginRoute from './routes/login-auth.routes';
import inviteUserRoute from './routes/inviteUser.routes';
import updateUserRoute from './routes/updateUser.route';
import acceptInviteRoute from './routes/join.routes';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import prismaClientInstance, { connectToDatabase } from './services/database/databaseConnector';
import path from 'path';
import { userAuthMiddleware } from './middleware/user-auth';
import cookieParser from 'cookie-parser';
import { verifyRole } from './middleware/roleVerificationMiddleware';
import { user_role } from './types/userRoles';
import crypto from 'crypto';
import session from 'express-session';
import { User } from './types/users';
import { create } from 'domain';
import wetravelIntegrationRoutes from './routes/wetravel-integration.routes';
import wetravelSyncRoutes from './routes/wetravel-sync.routes';
import ZohoAuthService from './services/zoho/zoho-auth';
import { integrationDataService } from './services/integrations/integration-config-service';
import { webhookWorker } from './services/worker';

declare module "express-session"
{
  interface SessionData {
    invitedUser: {
      email: string,
      firstName: string,
      lastName: string
    },
    tunnelSetup: {
      tunnelId: string,
      currentStep: number,
      stepToken: string,
      apiKeyValidated?: boolean
    }
    csrfToken?: string
  }
}

const app: Express = express();
app.use(session(
  {
    secret: process.env.SESSION_SECRET as string,
    saveUninitialized: false,
    resave: false

  }
));

// Apply Middleware
EnableMiddleware(app);
// Apply auth middleware to all API routes
EnableAuthMiddleware(app);
// Apply role checking middlewate to all API routes
EnableRoleMiddleware(app);
//Connect to postgres database
connectToDatabase();

//#region Routes
// Mount the API key check route
app.use('/api/', apiKeyRoute)
app.use('/api', webhookRoutes);
app.use('/admin/api/wetravel', wetravelSyncRoutes);
app.use('/', wetravelIntegrationRoutes);
app.post('/api/:id/webhook', (req: Request, res: Response) => {
  console.log("Received webhook");
  res.status(200).send("Webhook received from tunnel " + req.params.id);

  //To do: Process the webhook, using the webhook handler
});

AddAdminRoutes(app);
AddManagerRoutes(app);
// Routes will be added here
// app.use('/api/v1', routes);
app.use('/', loginRoute);
// app.use('/', companyRoute);
app.use('/', inviteUserRoute);
// app.use('/', updateCompanyRoute);
app.use('/', updateUserRoute); // Add this line
app.use('/', acceptInviteRoute);


//#endregion

app.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('auth-token');
  res.redirect('/');
});

// Use the robust error handling middleware
app.use(errorHandler);

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});


app.get("/", (req: Request, res: Response) => {

  const user = req.user as User;
  res.render('index', { title: 'Home', user: user });
});

app.get('/invite/declined', (req: Request, res: Response) => {
  res.render('invite-declined', {
    title: 'Invitation Declined',
    user: req.user
  });
});

// Initialize webhook worker for queue processing (Ventrata + WeTravel webhooks)
if (process.env.NODE_ENV !== 'test') {
  console.log('✅ Webhook worker initialized and listening for jobs');
  // Worker is instantiated and listening; no explicit start needed with BullMQ Worker
}

export default app;

//#region Functions
function EnableMiddleware(app: express.Express) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.set('view engine', 'ejs');
  app.set('views', 'src/views');
  app.use(express.static(path.join(process.cwd(), 'src/public')));
  app.use(cookieParser());
  app.use((req, res, next) => {
    // Generate CSRF token if it doesn't exist
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(16).toString('hex');
    }
    next();
  });
}

// Apply auth middleware to all API routes
function EnableAuthMiddleware(app: express.Express) {
  // Mount the webhook route BEFORE auth middleware to exempt it from X-API-Key requirement
  // It has its own X-Webhook-Secret validation in the controller
  app.use('/api', webhookRoutes);

  app.use('/api', authMiddleware);
  app.use('/', userAuthMiddleware);
}

function EnableRoleMiddleware(app: express.Express) {
  app.use('/admin', verifyRole([user_role.ADMIN]));
  app.use('/manager', verifyRole([user_role.MANAGER]));
}

function AddAdminRoutes(app: express.Express) {
  //#region Admin routes
  app.get('/admin/dashboard', (req: Request, res: Response) => {
    res.render('admin', { title: 'Admin Dashboard', user: req.user });
  });

  app.get('/admin/dashboard/companies', (req: Request, res: Response) => {
    //Get all companies
    prismaClientInstance.companies.findMany().then((companies) => {
      res.render('admin-companies', { title: 'Admin Companies', user: req.user, companies });
    }
    ).catch((error) => {
      console.error(error);
      res.status(500).send('Internal server error');
    });


  });

  app.get('/admin/invite/company', (req: Request, res: Response) => {
    res.status(404).render('error', { title: 'Not Found', message: 'Company invite UI removed', user: req.user });
  });

  app.get('/admin/invite/company/success', (req: Request, res: Response) => {
    res.status(404).render('error', { title: 'Not Found', message: 'Company invite UI removed', user: req.user });
  });

  app.get('/admin/invite/user/success', (req: Request, res: Response) => {

    if (req.session.invitedUser) {
      let invitedUser = req.session.invitedUser;
      console.log("Clearing session data");
      res.render('invite-user-success', { title: 'Invite User Success', user: req.user, invitedUser });
      //Clear the session data
      console.log("Clearing session data");
      req.session.invitedUser = undefined;
    }
  });
  app.get('/admin/invite/user', (req: Request, res: Response) => {
    //Need a dictionary of companies to populate the dropdown
    // Key is the company id, value is the company name
    //Create dictionary
    let companyDictionary: Map<string, string> = new Map<string, string>();
    prismaClientInstance.companies.findMany().then((companies) => {
      companies.forEach((company) => {
        companyDictionary.set(company.id, company.name);
      });

      res.render('invite-user', { title: 'Invite User', user: req.user, companyDictionary });
    });

  });
  app.get('/admin/dashboard/users', async (req: Request, res: Response) => {
    //Get all users with company name using a join

    prismaClientInstance.$queryRaw`SELECT users.*, c.name FROM users LEFT JOIN companies c ON users.company_id = c.id`.then((users) => {
      res.render('admin-users', { title: 'Admin Users', user: req.user, users, showReturnToCompanies: false });
    }
    ).catch((error) => {
      console.error(error);
      res.status(500).send('Internal server error');
    });
  });

  app.get('/admin/dashboard/user/invites', async (req: Request, res: Response) => {

    let companyDictionary: Map<string, string> = new Map<string, string>();
    const companies = prismaClientInstance.companies.findMany().then((companies) => {
      companies.forEach((company) => {
        companyDictionary.set(company.id, company.name);

      });
    });
    prismaClientInstance.user_invitations.findMany().then((invites) => {
      res.render('admin-user-invites', { title: 'Admin User Invites', user: req.user, invites, companyDictionary });
    }).catch((error) => {
      console.error(error);
      res.status(500).send('Internal server error');
    });
  });

  app.get('/admin/dashboard/companies/:id/users', async (req: Request, res: Response) => {

    //Get all users with for managers company
    const companyId = req.params.id;
    const users = await prismaClientInstance.users.findMany(
      {
        where: {
          company_id: companyId
        }
      }
    )
    console.log(users);

    res.render('admin-users', { title: 'Admin Users', user: req.user, users, showReturnToCompanies: true });
  });

  app.get('/admin/dashboard/tunnels', async (req: Request, res: Response) => {
    try {
      const tunnels = await prismaClientInstance.tunnels.findMany({
        include: {
          companies: true
        }
      });

      res.render('admin-tunnels', {
        title: 'Admin Tunnels Dashboard',
        user: req.user,
        tunnels
      });
    } catch (error) {
      console.error('Error fetching tunnels:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'Error loading tunnels',
        user: req.user
      });
    }
  });

  app.delete('/admin/dashboard/tunnels/:id', async (req: Request, res: Response) => {
    try {
      await prismaClientInstance.tunnels.delete({
        where: { id: req.params.id }
      });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting tunnel:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting tunnel'
      });
    }
  });

  app.get('/admin/dashboard/integrations/zoho', async (req: Request, res: Response) => {
    try {
      const isConnected = await integrationDataService.hasZohoRefreshToken();
      res.render('admin-zoho-integration', {
        title: 'Zoho Integration',
        user: req.user,
        isConnected,
        error: req.query.error,
        success: req.query.success
      });
    } catch (error) {
      console.error('Error loading Zoho integration status:', error);
      res.status(500).render('error', { title: 'Error', message: 'Error loading integration status', user: req.user });
    }
  });

  app.get('/admin/dashboard/integrations/wetravel', async (req: Request, res: Response) => {
    try {
      const status = await integrationDataService.getWeTravelStatus();
      const credentials = await integrationDataService.getWeTravelCredentials();
      const rolloutGuard = await integrationDataService.getWeTravelRolloutGuard();

      const statusLabel = status.status === 'connected'
        ? 'Connected'
        : status.status === 'invalid_key'
          ? 'Needs attention'
          : status.status === 'no_pro'
            ? 'WeTravel Pro required'
            : status.status === 'not_main_account'
              ? 'Main account required'
              : status.status === 'permission_denied'
                ? 'Permission denied'
                : 'Not connected';

      const statusTone = status.status === 'connected'
        ? 'success'
        : status.status
          ? 'warning'
          : 'danger';

      const webhookUrl = credentials
        ? `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/webhook/wetravel`
        : null;

      res.render('admin-wetravel-integration', {
        title: 'WeTravel Integration',
        user: req.user,
        companyId: (req.user as any)?.company_id || null,
        status,
        statusLabel,
        statusTone,
        credentialsPresent: !!credentials,
        rolloutGuard,
        webhookUrl,
        error: req.query.error,
        success: req.query.success
      });
    } catch (error) {
      console.error('Error loading WeTravel integration status:', error);
      res.status(500).render('error', { title: 'Error', message: 'Error loading WeTravel integration status', user: req.user });
    }
  });

  app.get('/admin/dashboard/integrations/zoho/auth', (req: Request, res: Response) => {
    const zohoAuth = new ZohoAuthService();
    res.redirect(zohoAuth.getAuthorizationUrl());
  });

  app.get('/admin/dashboard/integrations/zoho/callback', async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`/admin/dashboard/integrations/zoho?error=${error}`);
    }

    if (!code) {
      return res.redirect('/admin/dashboard/integrations/zoho?error=No code provided');
    }

    try {
      const zohoAuth = new ZohoAuthService();
      const tokens = await zohoAuth.exchangeCodeForTokens(code as string);

      // Store the refresh token and metadata
      await integrationDataService.saveIntegrationConfig({
        zoho_refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expires_at: new Date(tokens.expires_at!),
        token_metadata: {
          api_domain: tokens.api_domain,
          token_type: tokens.token_type
        }
      });

      res.redirect('/admin/dashboard/integrations/zoho?success=true');
    } catch (err) {
      console.error('Error during Zoho OAuth callback:', err);
      res.redirect(`/admin/dashboard/integrations/zoho?error=${encodeURIComponent((err as Error).message)}`);
    }
  });

  app.get('/admin/dashboard/webhook-logs', async (req: Request, res: Response) => {
    try {
      const { status, source } = req.query;
      const where: Record<string, string> = {};
      if (typeof status === 'string' && status.length > 0) {
        where.status = status;
      }
      if (typeof source === 'string' && source.length > 0) {
        where.source = source;
      }

      const logs = await integrationDataService.listWebhookLogs({
        where,
        orderBy: { created_at: 'desc' },
        take: 100 // Limit for now
      });

      res.render('admin-webhook-logs', {
        title: 'Webhook Logs & DLQ',
        user: req.user,
        logs,
        statusFilter: status || '',
        sourceFilter: source || ''
      });
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      res.status(500).render('error', { title: 'Error', message: 'Error loading webhook logs', user: req.user });
    }
  });

  app.post('/admin/dashboard/webhook-logs/:id/requeue', async (req: Request, res: Response) => {
    try {
      const log = await integrationDataService.getWebhookLog(req.params.id);
      if (!log) {
        res.status(404).json({ success: false, message: 'Log not found' });
        return;
      }

      // Reset log status and attempts
      await integrationDataService.updateWebhookLog(log.id, {
        status: 'RECEIVED',
        attempts: 0,
        last_error: null,
        dlq_ref: null
      });

      // Enqueue the job again
      const { ventrataWebhookQueue } = await import('./services/queue');
      const logSource = (log as any).source;
      const jobName = logSource === 'wetravel' ? 'process-wetravel-webhook' : 'process-ventrata-webhook';
      await ventrataWebhookQueue.add(jobName, {
        payload: log.payload,
        logId: log.id
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error requeueing job:', error);
      res.status(500).json({ success: false, message: 'Error requeueing job' });
    }
  });
  //#endregion
}

function AddManagerRoutes(app: express.Express) {
  //#region Manager routes
  app.get('/manager/dashboard', (req: Request, res: Response) => {
    res.render('manager', { title: 'Manager Dashboard', user: req.user });
  });

  app.get('/manager/dashboard/users', async (req: Request, res: Response) => {
    //Get all users with for managers company
    const user = req.user as User;
    await prismaClientInstance.$queryRaw`SELECT * FROM users WHERE company_id = uuid(${user.company_id})`.then((users) => {
      res.render('manager-dashboard-users', { title: 'Manager Users', user: req.user, users });
    }
    ).catch((error) => {
      console.error(error);
      res.status(500).send('Internal server error');
    });

  });

  app.get('/manager/company/manage', async (req: Request, res: Response) => {
    try {
      const user = req.user as User;
      const company = await prismaClientInstance.companies.findUnique({
        where: { id: user.company_id }
      });

      if (!company) {
        return res.status(404).render('error', {
          title: 'Error',
          message: 'Company not found',
          user: req.user
        });
      }

      res.render('manager-company', {
        title: 'Manage Company',
        company,
        user: req.user
      });
    } catch (error) {
      console.error('Error loading company management:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'An error occurred while loading company details',
        user: req.user
      });
    }
  });

  app.get('/manager/dashboard/tunnels/create/new', async (req: Request, res: Response) => {

    //Generate a new tunnel ID
    const tunnelIdJSON = await prismaClientInstance.$queryRaw<{ id: string }[]>`SELECT uuid_generate_v4() as id`;
    const tunnelId = tunnelIdJSON[0].id;
    console.log("New tunnel ID: " + JSON.stringify(tunnelId));

    //Goto the tunnel creation step 1 page url = "+ /configureSetup"
    res.redirect('/manager/dashboard/tunnels/create/new/' + tunnelId + '/configureSetup/');


  });

  app.get('/manager/invite/user', async (req: Request, res: Response) => {
    const user = req.user as User;
    // We only need the company name of the manager's company
    const companyDictionary = new Map<string, string>([[user.company_id, user.company_name]]);
    res.render('manager-invite-user', {
      title: 'Invite User',
      user: req.user,
      companyDictionary
    });
  });

  app.get('/manager/dashboard/tunnels', async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).render('error', {
          title: 'Error',
          message: 'Unauthorized access',
          user: null
        });
      }

      const tunnels = await prismaClientInstance.tunnels.findMany({
        where: {
          company_id: req.user.company_id
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      res.render('manager-tunnels', {
        title: 'Company Tunnels Dashboard',
        user: req.user,
        tunnels
      });
    } catch (error) {
      console.error('Error fetching tunnels:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'Error loading tunnels',
        user: req.user
      });
    }
  });



  //#endregion
}
//#endregion
