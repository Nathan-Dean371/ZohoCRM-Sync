import express, { Express, Request, Response, NextFunction } from 'express';
import webhookRoutes from './routes/webhook.routes';
import apiKeyRoute from './routes/api-key.routes';
import loginRoute from './routes/login-auth.routes';
import tunnelRoutes from './routes/tunnels.routes';
import inviteUserRoute from './routes/inviteUser.routes';
import updateUserRoute from './routes/updateUser.route';
import createTunnelRoute from './routes/createTunnel.route';
import bitrixRoutes from './routes/bitrixHandler.routes';
import acceptInviteRoute from './routes/join.routes';
import { authMiddleware } from './middleware/auth';
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
import managerRoutes from './routes/manager.routes';
import managerTunnelsRouter from './routes/managerTunnels.routes';

declare module "express-session"
{
  interface SessionData
  {
    invitedUser : {
      email : string,
      firstName : string,
      lastName : string
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
    secret : process.env.SESSION_SECRET as string,
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
app.post('/api/:id/webhook', (req: Request, res: Response) =>
{
  console.log("Received webhook");
  res.status(200).send("Webhook received from tunnel " + req.params.id);

  //To do: Process the webhook, using the webhook handler
});

AddAdminRoutes(app);
AddManagerRoutes(app);
// Routes will be added here
// app.use('/api/v1', routes);
app.use('/', loginRoute);
app.use('/', companyRoute);
app.use('/', inviteUserRoute);
app.use('/', updateCompanyRoute);
app.use('/', updateUserRoute); // Add this line
app.use('/', createTunnelRoute);
app.use('/', bitrixRoutes);
app.use('/', acceptInviteRoute);

app.use('/tunnels', tunnelRoutes);
//#endregion

app.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('auth-token');
  res.redirect('/');
});

// Basic error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
  });

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });


app.get("/", (req: Request, res: Response) => {
  
  const user = req.user as User;
  res.render('index', { title: 'Home' , user : user});
});

app.get('/invite/declined', (req: Request, res: Response) => {
  res.render('invite-declined', { 
      title: 'Invitation Declined',
      user: req.user 
  });
});

export default app;

//#region Functions
function EnableMiddleware(app: express.Express) 
{
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.set('view engine', 'ejs');
  app.set('views', 'src/views');
  app.use(express.static(path.join(__dirname, 'public')));
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
function EnableAuthMiddleware(app: express.Express)
{
  app.use('/api', authMiddleware);
  app.use('/', userAuthMiddleware);
}

function EnableRoleMiddleware(app: express.Express)
{
  app.use('/admin', verifyRole([user_role.ADMIN]));
  app.use('/manager', verifyRole([user_role.MANAGER]));
}

function AddAdminRoutes(app: express.Express)
{
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

app.get('/admin/invite/company/success' , (req: Request, res: Response) => {
  res.status(404).render('error', { title: 'Not Found', message: 'Company invite UI removed', user: req.user });
});

  app.get('/admin/invite/user/success' , (req: Request, res: Response) =>
  {

    if(req.session.invitedUser)
    {
      let invitedUser = req.session.invitedUser;
      console.log("Clearing session data");
      res.render('invite-user-success', { title: 'Invite User Success', user: req.user, invitedUser});
      //Clear the session data
      console.log("Clearing session data");
      req.session.invitedUser = undefined;
    }
  });
  app.get('/admin/invite/user', (req: Request, res: Response) => {
    //Need a dictionary of companies to populate the dropdown
    // Key is the company id, value is the company name
    //Create dictionary
    let companyDictionary : Map<string, string> = new Map<string, string>();
    prismaClientInstance.companies.findMany().then((companies) => {
      companies.forEach((company) => 
        {
          companyDictionary.set(company.id, company.name);
        });
        
      res.render('invite-user', { title: 'Invite User', user: req.user, companyDictionary});
    });
    
  });
  app.get('/admin/dashboard/users', async (req: Request, res: Response) => {
    //Get all users with company name using a join

    prismaClientInstance.$queryRaw`SELECT users.*, c.name FROM users LEFT JOIN companies c ON users.company_id = c.id`.then((users) => {
      res.render('admin-users', { title: 'Admin Users', user: req.user, users, showReturnToCompanies : false });  
    }
    ).catch((error) => {  
      console.error(error);
      res.status(500).send('Internal server error');
    });
  });

  app.get('/admin/dashboard/user/invites', async (req: Request, res: Response) => {

    let companyDictionary : Map<string, string> = new Map<string, string>();
    const companies = prismaClientInstance.companies.findMany().then((companies) => {
      companies.forEach((company) => 
        {
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

    res.render('admin-users', { title: 'Admin Users', user: req.user, users, showReturnToCompanies : true});
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
  //#endregion
}

function AddManagerRoutes(app: express.Express)
{
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
    const tunnelIdJSON = await prismaClientInstance.$queryRaw<{id: string}[]>`SELECT uuid_generate_v4() as id`;
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

  // Use the manager tunnels router
  app.use('/manager/dashboard/tunnels', managerTunnelsRouter);

  //#endregion
}
//#endregion
