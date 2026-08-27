import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'nathan@lallytours.com';
const COMPANY_NAME = 'Lally Tours';
const TEST_EMAIL = 'admin@test.com';
const TEST_COMPANY_NAME = 'Admin Corp';

async function main() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD env var is required (e.g. $env:ADMIN_PASSWORD="...") to seed the admin account.');
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  // Remove the placeholder test account/company from earlier runs, if present
  const testAdmin = await prisma.users.findFirst({ where: { email: TEST_EMAIL } });
  if (testAdmin) {
    await prisma.users.delete({ where: { id: testAdmin.id } });
  }
  const testCompany = await prisma.companies.findFirst({ where: { name: TEST_COMPANY_NAME } });
  if (testCompany) {
    await prisma.companies.delete({ where: { id: testCompany.id } });
  }

  // 1. Ensure the real company exists
  // We use findFirst then create because id is generated and we don't have a unique name constraint we can rely on easily here
  let company = await prisma.companies.findFirst({ where: { name: COMPANY_NAME } });

  if (!company) {
    company = await prisma.companies.create({
      data: {
        id: uuidv4(),
        name: COMPANY_NAME,
        company_status: 'ACTIVE',
        primary_contact_email: ADMIN_EMAIL
      }
    });
  }

  // 2. Create or Update the Admin user
  let admin = await prisma.users.findFirst({ where: { email: ADMIN_EMAIL } });

  if (admin) {
    await prisma.users.update({
      where: { id: admin.id },
      data: {
        hashed_password: hashedPassword,
        role: 'ADMIN'
      }
    });
  } else {
    await prisma.users.create({
      data: {
        id: uuidv4(),
        email: ADMIN_EMAIL,
        hashed_password: hashedPassword,
        first_name: 'Nathan',
        last_name: 'Dean',
        role: 'ADMIN',
        company_id: company.id,
        is_active: true,
        email_verified: true
      }
    });
  }

  console.log('--- Setup Complete ---');
  console.log(`Admin User Created: ${ADMIN_EMAIL}`);
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
