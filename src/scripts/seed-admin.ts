import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@test.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // 1. Ensure a company exists
  // We use findFirst then create because id is generated and we don't have a unique name constraint we can rely on easily here
  let company = await prisma.companies.findFirst({ where: { name: 'Admin Corp' } });
  
  if (!company) {
    company = await prisma.companies.create({
      data: {
        id: uuidv4(),
        name: 'Admin Corp',
        company_status: 'ACTIVE',
        primary_contact_email: 'admin@test.com'
      }
    });
  }

  // 2. Create or Update the Admin user
  let admin = await prisma.users.findFirst({ where: { email } });

  if (admin) {
    await prisma.users.update({
      where: { id: admin.id },
      data: {
        role: 'ADMIN'
      }
    });
  } else {
    await prisma.users.create({
      data: {
        id: uuidv4(),
        email,
        hashed_password: hashedPassword,
        first_name: 'System',
        last_name: 'Admin',
        role: 'ADMIN',
        company_id: company.id,
        is_active: true,
        email_verified: true
      }
    });
  }

  console.log('--- Setup Complete ---');
  console.log(`Admin User Created: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Company ID: ${company.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
